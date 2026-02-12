const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

function run() {
  const html = read('src/renderer/index.html');

  const requiredIds = [
    'dropzone',
    'btn-pick-file',
    'btn-confirm',
    'step2-content',
    'step3-content',
    'step4-content',
    'step5-content',
    'step6-content',
    'btn-start-dispatch',
  ];

  for (const id of requiredIds) {
    assert.match(html, new RegExp(`id="${id}"`), `Elemento obrigatório ausente: ${id}`);
  }

  const cssFiles = [
    'styles/base.css',
    'styles/components.css',
    'styles/layout.css',
    'styles/pages/wizard.css',
    'styles/pages/wizard-matching.css',
    'styles/pages/contacts.css',
    'styles/pages/app-redesign.css',
  ];

  for (const file of cssFiles) {
    assert.match(html, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `CSS obrigatório não carregado: ${file}`);
  }

  const preload = read('src/main/preload.js');
  const apiMethods = ['importPreview', 'contacts:importPreview', 'reports:generate', 'dispatch:start', 'wa:connect'];
  for (const method of apiMethods) {
    assert.match(preload, new RegExp(method.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Bridge API não expõe: ${method}`);
  }

  console.log('✅ E2E smoke (estrutura UI + preload API) passou.');
}

try {
  run();
} catch (error) {
  console.error('❌ E2E smoke falhou:', error.message);
  process.exit(1);
}
