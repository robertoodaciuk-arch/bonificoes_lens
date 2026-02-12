const { getDb } = require('../database/connection');
const { normalizeText } = require('../utils/normalize');
const { normalizePhoneE164 } = require('../utils/phone');
const crypto = require('crypto');
const logger = require('../utils/logger');

class ContactService {
  constructor() {
    this.db = getDb();
  }

  getAll() {
    const stmt = this.db.prepare(`
      SELECT * FROM contacts 
      ORDER BY display_name ASC
    `);
    const rows = stmt.all();
    return rows.map(r => ({
      ...r,
      aliases: JSON.parse(r.seller_aliases_json || '[]'),
      active: Boolean(r.active),
    }));
  }

  getById(id) {
    const stmt = this.db.prepare('SELECT * FROM contacts WHERE id = ?');
    const row = stmt.get(id);
    if (!row) return null;
    return {
      ...row,
      aliases: JSON.parse(row.seller_aliases_json || '[]'),
      active: Boolean(row.active),
    };
  }

  create(data) {
    const id = crypto.randomUUID();
    const displayName = String(data.displayName || '').trim();
    const sellerNameNorm = normalizeText(data.sellerNameNorm || displayName);
    const aliasesRaw = Array.isArray(data.aliases) ? data.aliases : [];
    const aliases = aliasesRaw
      .map(a => normalizeText(a))
      .filter(Boolean);
    const phone = normalizePhoneE164(data.phone || '');
    const email = data.email || '';
    const active = data.active !== false ? 1 : 0;

    const stmt = this.db.prepare(`
      INSERT INTO contacts (id, display_name, seller_name_norm, seller_aliases_json, phone_e164, email, active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      stmt.run(id, displayName, sellerNameNorm, JSON.stringify(aliases), phone, email, active);
      logger.info(`Contact created: ${displayName} (${id})`);
      return { id };
    } catch (err) {
      logger.error('Failed to create contact', err);
      throw err;
    }
  }

  update(id, data) {
    const current = this.getById(id);
    if (!current) throw new Error('Contact not found');

    const displayName = (data.displayName ?? current.display_name);
    const sellerNameNorm = normalizeText(data.sellerNameNorm ?? current.seller_name_norm ?? displayName);

    const aliasesInput = (data.aliases ?? current.aliases) || [];
    const aliases = Array.isArray(aliasesInput)
      ? aliasesInput.map(a => normalizeText(a)).filter(Boolean)
      : [];
    const phone = normalizePhoneE164(data.phone ?? current.phone_e164);
    const email = data.email ?? current.email;
    const active = data.active !== undefined ? (data.active ? 1 : 0) : current.active ? 1 : 0;

    const stmt = this.db.prepare(`
      UPDATE contacts 
      SET display_name = ?, seller_name_norm = ?, seller_aliases_json = ?, phone_e164 = ?, email = ?, active = ?, updated_at = datetime('now')
      WHERE id = ?
    `);

    stmt.run(displayName, sellerNameNorm, JSON.stringify(aliases), phone, email, active, id);
    logger.info(`Contact updated: ${displayName} (${id})`);
    return { ok: true };
  }

  delete(id) {
    const stmt = this.db.prepare('DELETE FROM contacts WHERE id = ?');
    const res = stmt.run(id);
    if (res.changes === 0) throw new Error('Contact not found');
    logger.info(`Contact deleted: ${id}`);
    return { ok: true };
  }

  // --- Matching Logic ---

  findMatch(sellerNameRaw) {
    const norm = normalizeText(sellerNameRaw);
    if (!norm) return null;

    // 1. Exact match on seller_name_norm
    const exactStmt = this.db.prepare('SELECT id, display_name FROM contacts WHERE seller_name_norm = ? LIMIT 1');
    const exact = exactStmt.get(norm);
    if (exact) return { type: 'EXACT', contactId: exact.id, contactName: exact.display_name };

    // 2. Alias match (requires scanning or JSON query - SQLite JSON1 is usually enabled)
    // We'll fetch all aliases and check in JS for flexibility, as the list of contacts is small (< 1000)
    const allContacts = this.getAll();
    for (const contact of allContacts) {
      const aliasList = (contact.aliases || []).map(a => normalizeText(a)).filter(Boolean);
      if (aliasList.includes(norm)) {
        return { type: 'ALIAS', contactId: contact.id, contactName: contact.display_name };
      }
    }

    return null;
  }

  getUnmatchedSellers(importId) {
    // If importId is provided, we could filter by specific import.
    // For now, let's just get all seller_reports where matched_contact_id is NULL
    // But typically we want this context-bound to the current import wizard.
    
    // Assuming we pass the list of seller names from the preview or a temporary table.
    // If we persist the import first (which we should do before matching step), we query seller_reports.
    
    // Let's assume the flow: Import Preview -> Commit (creates import + seller_reports) -> Match Step.
    // So we need a method to get unmatched reports for a given importId.
    
    if (!importId) throw new Error('importId is required');

    const stmt = this.db.prepare(`
      SELECT id, seller_name_raw, seller_name_norm, rows_count 
      FROM seller_reports 
      WHERE import_id = ? AND matched_contact_id IS NULL
      ORDER BY rows_count DESC
    `);
    
    return stmt.all(importId);
  }

  linkContactToReport(reportId, contactId) {
    const stmt = this.db.prepare(`
      UPDATE seller_reports 
      SET matched_contact_id = ? 
      WHERE id = ?
    `);
    stmt.run(contactId, reportId);
    return { ok: true };
  }
}

module.exports = { ContactService };
