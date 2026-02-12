const { SpreadsheetParserService } = require('../import/SpreadsheetParserService');
const { normalizeText } = require('../../utils/normalize');
const { normalizePhoneE164 } = require('../../utils/phone');
const { getDb } = require('../../database/connection');
const crypto = require('crypto');
const logger = require('../../utils/logger');

function cleanName(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function splitAliases(value) {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
  const str = String(value).trim();
  if (!str) return [];
  return str
    .split(/[;,|\n]+/g)
    .map(s => s.trim())
    .filter(Boolean);
}

function getCell(row, key) {
  if (!row || !key) return '';
  return row[key] ?? '';
}

class ContactImportService {
  constructor() {
    this.parser = new SpreadsheetParserService();
    this.db = getDb();
  }

  preview({ filePath, options = {}, mapping = {} } = {}) {
    const previewRowsLimit = Math.max(1, Math.min(Number(options.previewRows ?? 30), 200));

    const parsed = this.parser.parse({
      filePath,
      sheetName: options.sheetName,
      headerRow: Number.isFinite(options.headerRow) ? options.headerRow : 0,
      requiredHeaders: [],
    });

    const rawPreview = parsed.rows.slice(0, previewRowsLimit).map(r => {
      const cleaned = { ...r };
      delete cleaned.__rowIndex;
      return cleaned;
    });

    const hasMapping = Boolean(mapping?.nameColumn && mapping?.phoneColumn);

    const normalizedPreview = [];
    const stats = {
      totalRows: parsed.rows.length,
      rowsWithPhone: 0,
      uniquePhones: 0,
      duplicatePhones: 0,
      invalidPhones: 0,
      rowsMissingName: 0,
      skippedNoPhone: 0,
    };

    const dedupe = new Map();

    if (hasMapping) {
      parsed.rows.forEach((row, idx) => {
        const nameRaw = getCell(row, mapping.nameColumn);
        const phoneRaw = getCell(row, mapping.phoneColumn);
        const aliasRaw = getCell(row, mapping.aliasColumn);

        const displayName = cleanName(nameRaw);
        const phoneE164 = normalizePhoneE164(phoneRaw);
        const aliases = splitAliases(aliasRaw);

        if (!displayName) stats.rowsMissingName++;
        if (!phoneRaw || !String(phoneRaw).trim()) stats.skippedNoPhone++;

        if (phoneRaw && String(phoneRaw).trim()) {
          if (phoneE164) {
            stats.rowsWithPhone++;
            if (dedupe.has(phoneE164)) {
              stats.duplicatePhones++;
              const info = dedupe.get(phoneE164);
              info.count++;
              if (displayName) info.names.add(displayName);
            } else {
              dedupe.set(phoneE164, { count: 1, names: new Set(displayName ? [displayName] : []) });
            }
          } else {
            stats.invalidPhones++;
          }
        }

        if (idx < previewRowsLimit) {
          normalizedPreview.push({
            displayName: displayName || '—',
            phoneE164: phoneE164 || '—',
            aliases,
          });
        }
      });

      stats.uniquePhones = dedupe.size;
    }

    return {
      file: {
        name: parsed.meta.fileName,
        size: parsed.meta.fileSize,
        mtimeMs: parsed.meta.fileMtimeMs,
      },
      columns: parsed.columns,
      previewRows: rawPreview,
      normalizedPreview,
      stats,
    };
  }

  commit({ filePath, options = {}, mapping = {} } = {}) {
    if (!mapping?.nameColumn || !mapping?.phoneColumn) {
      throw new Error('Mapeamento inválido: nome e telefone são obrigatórios');
    }

    const parsed = this.parser.parse({
      filePath,
      sheetName: options.sheetName,
      headerRow: Number.isFinite(options.headerRow) ? options.headerRow : 0,
      requiredHeaders: [],
    });

    const aggregated = new Map();
    const stats = {
      totalRows: parsed.rows.length,
      uniquePhones: 0,
      created: 0,
      updated: 0,
      skippedNoPhone: 0,
      invalidPhones: 0,
      skippedNoName: 0,
      duplicatesMerged: 0,
    };

    for (const row of parsed.rows) {
      const nameRaw = getCell(row, mapping.nameColumn);
      const phoneRaw = getCell(row, mapping.phoneColumn);
      const aliasRaw = getCell(row, mapping.aliasColumn);

      const displayName = cleanName(nameRaw);
      const phoneE164 = normalizePhoneE164(phoneRaw);
      const aliases = splitAliases(aliasRaw);

      if (!phoneRaw || !String(phoneRaw).trim()) {
        stats.skippedNoPhone++;
        continue;
      }

      if (!phoneE164) {
        stats.invalidPhones++;
        continue;
      }

      if (!displayName && aliases.length === 0) {
        stats.skippedNoName++;
        continue;
      }

      if (aggregated.has(phoneE164)) {
        const existing = aggregated.get(phoneE164);
        if (!existing.displayName && displayName) existing.displayName = displayName;
        aliases.forEach(a => existing.aliases.add(a));
        stats.duplicatesMerged++;
      } else {
        aggregated.set(phoneE164, {
          displayName,
          aliases: new Set(aliases),
        });
      }
    }

    stats.uniquePhones = aggregated.size;

    const selectByPhone = this.db.prepare('SELECT id, display_name, seller_aliases_json FROM contacts WHERE phone_e164 = ? LIMIT 1');
    const insertStmt = this.db.prepare(`
      INSERT INTO contacts (id, display_name, seller_name_norm, seller_aliases_json, phone_e164, email, active)
      VALUES (?, ?, ?, ?, ?, '', 1)
    `);
    const updateStmt = this.db.prepare(`
      UPDATE contacts
      SET display_name = ?, seller_name_norm = ?, seller_aliases_json = ?, updated_at = datetime('now')
      WHERE id = ?
    `);

    const now = Date.now();
    logger.info('[ContactImport] Starting import', { filePath, rows: parsed.rows.length, now });

    for (const [phoneE164, data] of aggregated.entries()) {
      const displayName = data.displayName || 'Contato';
      const sellerNameNorm = normalizeText(displayName);
      const aliases = Array.from(data.aliases).map(a => normalizeText(a)).filter(Boolean);

      const existing = selectByPhone.get(phoneE164);
      if (!existing) {
        const id = crypto.randomUUID();
        insertStmt.run(id, displayName, sellerNameNorm, JSON.stringify(aliases), phoneE164);
        stats.created++;
      } else {
        const existingAliases = JSON.parse(existing.seller_aliases_json || '[]');
        const merged = new Set(existingAliases.map(a => normalizeText(a)).filter(Boolean));
        aliases.forEach(a => merged.add(a));
        if (existing.display_name && existing.display_name !== displayName) {
          merged.add(normalizeText(displayName));
        }
        const finalAliases = Array.from(merged);
        const finalName = existing.display_name || displayName;
        updateStmt.run(finalName, normalizeText(finalName), JSON.stringify(finalAliases), existing.id);
        stats.updated++;
      }
    }

    return { stats };
  }
}

module.exports = {
  ContactImportService,
};
