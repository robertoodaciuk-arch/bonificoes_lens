const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..', '..');
const reportPath = path.join(repoRoot, 'docs', 'reports', 'system-recon-report.md');

function listFiles(dir, acc = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listFiles(full, acc);
    } else {
      acc.push(full);
    }
  }
  return acc;
}

test('gera relatório de reconhecimento técnico da base', () => {
  const files = listFiles(repoRoot);
  const byExt = new Map();

  for (const file of files) {
    const ext = path.extname(file) || '[sem extensão]';
    byExt.set(ext, (byExt.get(ext) || 0) + 1);
  }

  const topExtensions = [...byExt.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([ext, count]) => `- ${ext}: ${count}`)
    .join('\n');

  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

  const report = `# Reconhecimento Técnico — Operação Apple Transformation\n\n## Resumo\n- Arquivos analisados (sem node_modules/.git): ${files.length}\n- Produto: ${packageJson.productName}\n- Versão: ${packageJson.version}\n\n## Stack detectada\n- Runtime desktop: Electron\n- Front-end: HTML/CSS/JS vanilla\n- Back-end local: Node.js com IPC\n- Banco local: better-sqlite3\n- Automação WhatsApp: @whiskeysockets/baileys\n\n## Distribuição por extensão\n${topExtensions}\n\n## Pontos-chave para refatoração\n1. Consolidar tema visual em design tokens unificados por semântica.\n2. Expandir suíte de testes automatizados para fluxo crítico wizard + dispatch.\n3. Fortalecer critérios de regressão visual e acessibilidade.\n4. Formalizar baseline de performance por etapa do wizard.\n`;

  fs.writeFileSync(reportPath, report, 'utf8');

  assert.ok(fs.existsSync(reportPath));
  assert.match(report, /Operação Apple Transformation/);
});
