(function () {
  const { contacts } = window.api || {};
  const { showToast } = window.uiToast || { showToast: console.log };

  const section = document.getElementById('contacts-section');
  const grid = document.getElementById('contacts-grid');
  const btnNew = document.getElementById('btn-new-contact');
  const btnBack = document.getElementById('btn-back-home');

  // Modal elements
  const modal = document.getElementById('contact-modal');
  const modalTitle = document.getElementById('modal-title');
  const modalClose = document.getElementById('modal-close');
  const modalCancel = document.getElementById('modal-cancel');
  const modalSave = document.getElementById('modal-save');
  
  const inpId = document.getElementById('contact-id');
  const inpName = document.getElementById('contact-name');
  const inpPhone = document.getElementById('contact-phone');
  const inpActive = document.getElementById('contact-active');
  const inpAlias = document.getElementById('alias-input');
  const aliasContainer = document.getElementById('alias-container');

  // Import elements
  const btnImportPick = document.getElementById('btn-import-pick');
  const btnImportReset = document.getElementById('btn-import-reset');
  const importFileInfo = document.getElementById('import-file-info');
  const importMapping = document.getElementById('import-mapping');
  const mapName = document.getElementById('map-name');
  const mapPhone = document.getElementById('map-phone');
  const mapAlias = document.getElementById('map-alias');
  const importStats = document.getElementById('import-stats');
  const statRows = document.getElementById('stat-rows');
  const statUnique = document.getElementById('stat-unique');
  const statDup = document.getElementById('stat-dup');
  const statInvalid = document.getElementById('stat-invalid');
  const importPreview = document.getElementById('import-preview');
  const importPreviewTable = document.getElementById('import-preview-table');
  const importStatus = document.getElementById('import-status');
  const btnImportCommit = document.getElementById('btn-import-commit');

  let currentAliases = [];
  let importState = {
    filePath: '',
    columns: [],
    mapping: { nameColumn: '', phoneColumn: '', aliasColumn: '' },
  };

  function setStateText(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.classList.remove('is-empty', 'is-loading', 'is-error', 'is-success');
    if (type) el.classList.add(`is-${type}`);
  }

  function toggleHidden(el, show) {
    if (!el) return;
    el.classList.toggle('hidden', !show);
  }

  if (!contacts) {
    console.error('API contacts not found');
    return;
  }

  function toggleModal(open) {
    if (open) {
      modal.classList.add('open');
      modal.style.display = 'flex'; // Ensure flex layout
    } else {
      modal.classList.remove('open');
      setTimeout(() => {
        if (!modal.classList.contains('open')) modal.style.display = 'none';
      }, 300);
    }
  }

  // Init modal state
  modal.style.display = 'none';

  function renderAliases() {
    const children = Array.from(aliasContainer.children);
    children.forEach(c => {
      if (c !== inpAlias) c.remove();
    });

    currentAliases.forEach((alias, idx) => {
      const tag = document.createElement('div');
      tag.className = 'tag';
      tag.innerHTML = `
        <span>${alias}</span>
        <span class="tag-remove" data-idx="${idx}">&times;</span>
      `;
      aliasContainer.insertBefore(tag, inpAlias);
    });
  }

  function addAlias(val) {
    const v = val.trim();
    if (v && !currentAliases.includes(v)) {
      currentAliases.push(v);
      renderAliases();
    }
    inpAlias.value = '';
    inpAlias.focus();
  }

  function removeAlias(idx) {
    currentAliases.splice(idx, 1);
    renderAliases();
  }

  function setSelectOptions(select, columns, includeBlank = true) {
    select.innerHTML = '';
    if (includeBlank) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '—';
      select.appendChild(opt);
    }
    columns.forEach(col => {
      const opt = document.createElement('option');
      opt.value = col;
      opt.textContent = col;
      select.appendChild(opt);
    });
  }

  function guessColumn(columns, keywords) {
    const norm = keywords.map(k => k.toUpperCase());
    return columns.find(c => norm.some(k => c.toUpperCase().includes(k))) || '';
  }

  function updateMappingUI(columns) {
    setSelectOptions(mapName, columns);
    setSelectOptions(mapPhone, columns);
    setSelectOptions(mapAlias, columns, true);

    importState.mapping.nameColumn = importState.mapping.nameColumn || guessColumn(columns, ['NOME', 'NAME', 'VENDEDOR']);
    importState.mapping.phoneColumn = importState.mapping.phoneColumn || guessColumn(columns, ['TELEFONE', 'CEL', 'CELULAR', 'WHATS', 'PHONE']);
    importState.mapping.aliasColumn = importState.mapping.aliasColumn || guessColumn(columns, ['ALIAS', 'APELIDO', 'NICK']);

    mapName.value = importState.mapping.nameColumn || '';
    mapPhone.value = importState.mapping.phoneColumn || '';
    mapAlias.value = importState.mapping.aliasColumn || '';
  }

  function renderImportTable(rows) {
    if (!rows.length) {
      importPreviewTable.innerHTML = '<tr><td class="table-empty state-text is-empty" colspan="3">Sem dados para preview.</td></tr>';
      return;
    }

    const headers = ['Nome', 'Telefone (E.164)', 'Aliases'];
    const thead = `<thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>`;
    const tbody = rows.map(r => {
      const aliases = (r.aliases || []).join(', ');
      return `<tr><td>${r.displayName}</td><td>${r.phoneE164}</td><td>${aliases || '—'}</td></tr>`;
    }).join('');
    importPreviewTable.innerHTML = `${thead}<tbody>${tbody}</tbody>`;
  }

  async function loadImportPreview({ refreshMapping = false } = {}) {
    if (!importState.filePath) return;
    setStateText(importStatus, 'Analisando arquivo…', 'loading');
    const res = await contacts.importPreview({
      filePath: importState.filePath,
      options: { previewRows: 20 },
      mapping: importState.mapping,
    });

    if (!res.ok) {
      showToast('error', res.error || 'Falha ao gerar preview');
      setStateText(importStatus, 'Falha ao gerar preview.', 'error');
      return;
    }

    const data = res.data;
    importState.columns = data.columns || [];

    if (refreshMapping) {
      updateMappingUI(importState.columns);
    }

    const hasMapping = Boolean(importState.mapping.nameColumn && importState.mapping.phoneColumn);
    toggleHidden(importMapping, importState.columns.length);
    toggleHidden(importStats, hasMapping);
    toggleHidden(importPreview, hasMapping);

    if (hasMapping) {
      statRows.textContent = data.stats?.totalRows ?? '—';
      statUnique.textContent = data.stats?.uniquePhones ?? '—';
      statDup.textContent = data.stats?.duplicatePhones ?? '—';
      statInvalid.textContent = data.stats?.invalidPhones ?? '—';
      renderImportTable(data.normalizedPreview || []);
      btnImportCommit.disabled = false;
      setStateText(importStatus, 'Revise o preview e confirme a importação.');
    } else {
      btnImportCommit.disabled = true;
      setStateText(importStatus, 'Selecione as colunas de nome e telefone.', 'empty');
    }
  }

  function resetImport() {
    importState = { filePath: '', columns: [], mapping: { nameColumn: '', phoneColumn: '', aliasColumn: '' } };
    importFileInfo.textContent = 'Nenhum arquivo selecionado.';
    toggleHidden(importMapping, false);
    toggleHidden(importStats, false);
    toggleHidden(importPreview, false);
    importPreviewTable.innerHTML = '';
    setStateText(importStatus, 'Selecione um arquivo para começar.', 'empty');
    btnImportCommit.disabled = true;
    btnImportReset.disabled = true;
  }

  async function handlePickImportFile() {
    const res = await contacts.pickImportFile();
    if (!res.ok) {
      showToast('error', res.error || 'Falha ao selecionar arquivo');
      return;
    }
    if (res.data?.canceled) return;

    importState.filePath = res.data.filePath;
    importFileInfo.textContent = `Arquivo: ${importState.filePath}`;
    btnImportReset.disabled = false;

    await loadImportPreview({ refreshMapping: true });
    if (!importState.mapping.nameColumn && importState.columns.length) {
      setStateText(importStatus, 'Mapeie as colunas para continuar.', 'empty');
    }

    // Trigger preview with mapping if guessed
    if (importState.mapping.nameColumn && importState.mapping.phoneColumn) {
      await loadImportPreview();
    }
  }

  async function commitImport() {
    if (!importState.filePath) return;
    if (!importState.mapping.nameColumn || !importState.mapping.phoneColumn) {
      showToast('warn', 'Mapeie nome e telefone para importar.');
      return;
    }

    btnImportCommit.disabled = true;
    setStateText(importStatus, 'Importando contatos…', 'loading');

    const res = await contacts.importCommit({
      filePath: importState.filePath,
      mapping: importState.mapping,
    });

    if (res.ok) {
      const stats = res.data?.stats || {};
      showToast('success', `Importação concluída: ${stats.created || 0} novos, ${stats.updated || 0} atualizados.`);
      setStateText(importStatus, 'Importação finalizada.', 'success');
      loadContacts();
    } else {
      showToast('error', res.error || 'Falha ao importar contatos');
      setStateText(importStatus, 'Falha na importação.', 'error');
    }

    btnImportCommit.disabled = false;
  }

  async function loadContacts() {
    if (!contacts) return;
    grid.innerHTML = '<div class="state-block is-loading"><strong>Carregando contatos…</strong><span>Buscando registros no sistema.</span></div>';
    
    const res = await contacts.getAll();
    if (!res.ok) {
      showToast('error', 'Falha ao carregar contatos');
      grid.innerHTML = '<div class="state-block is-error"><strong>Erro ao carregar contatos</strong><span>Tente novamente em instantes.</span></div>';
      return;
    }

    const list = res.data || [];
    grid.innerHTML = '';

    if (list.length === 0) {
      grid.innerHTML = '<div class="state-block is-empty"><strong>Nenhum contato cadastrado</strong><span>Importe ou crie um novo contato para começar.</span></div>';
      return;
    }

    list.forEach(c => {
      const card = document.createElement('div');
      card.className = `contact-card${!c.active ? ' is-inactive' : ''}`;
      const aliasTags = (c.aliases || []).slice(0, 3).map(a => `<span class="alias-tag">${a}</span>`).join('');
      const moreAliases = (c.aliases || []).length > 3 ? `+${c.aliases.length - 3}` : '';
      const phoneHtml = c.phone_e164 ? c.phone_e164 : '<span class="contact-phone-empty">Sem telefone</span>';
      const moreAliasesHtml = moreAliases ? `<span class="alias-more">${moreAliases}</span>` : '';
      
      card.innerHTML = `
        <div class="contact-header">
          <div class="contact-name">${c.display_name}</div>
          <div class="contact-actions inline">
            <button class="btn-icon edit-btn" data-id="${c.id}" title="Editar">✎</button>
            <button class="btn-icon btn-danger del-btn" data-id="${c.id}" title="Excluir">🗑</button>
          </div>
        </div>
        <div class="contact-phone">${phoneHtml}</div>
        <div class="contact-aliases">
          ${aliasTags} ${moreAliasesHtml}
        </div>
      `;
      grid.appendChild(card);
    });

    grid.querySelectorAll('.edit-btn').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        editContact(b.dataset.id, list);
      });
    });
    grid.querySelectorAll('.del-btn').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteContact(b.dataset.id);
      });
    });
  }

  function editContact(id, list) {
    const c = list.find(x => x.id === id);
    if (!c) return;

    inpId.value = c.id;
    inpName.value = c.display_name;
    inpPhone.value = c.phone_e164 || '';
    inpActive.checked = c.active;
    currentAliases = [...(c.aliases || [])];
    
    renderAliases();
    modalTitle.textContent = 'Editar Contato';
    toggleModal(true);
  }

  function newContact() {
    inpId.value = '';
    inpName.value = '';
    inpPhone.value = '';
    inpActive.checked = true;
    currentAliases = [];
    renderAliases();
    modalTitle.textContent = 'Novo Contato';
    toggleModal(true);
  }

  async function save() {
    const id = inpId.value;
    const data = {
      displayName: inpName.value.trim(),
      phone: inpPhone.value.trim(),
      active: inpActive.checked,
      aliases: currentAliases
    };

    if (!data.displayName) {
      showToast('warn', 'Nome é obrigatório');
      return;
    }

    let res;
    if (id) {
      res = await contacts.update(id, data);
    } else {
      res = await contacts.create(data);
    }

    if (res.ok) {
      showToast('success', 'Contato salvo!');
      toggleModal(false);
      loadContacts();
    } else {
      showToast('error', res.error || 'Erro ao salvar');
    }
  }

  async function deleteContact(id) {
    if (!confirm('Tem certeza que deseja excluir este contato?')) return;
    const res = await contacts.delete(id);
    if (res.ok) {
      showToast('success', 'Contato excluído');
      loadContacts();
    } else {
      showToast('error', res.error || 'Erro ao excluir');
    }
  }

  btnNew.addEventListener('click', newContact);

  if (btnImportPick) btnImportPick.addEventListener('click', handlePickImportFile);
  if (btnImportReset) btnImportReset.addEventListener('click', resetImport);
  if (btnImportCommit) btnImportCommit.addEventListener('click', commitImport);

  if (mapName) mapName.addEventListener('change', () => {
    importState.mapping.nameColumn = mapName.value;
    loadImportPreview();
  });
  if (mapPhone) mapPhone.addEventListener('change', () => {
    importState.mapping.phoneColumn = mapPhone.value;
    loadImportPreview();
  });
  if (mapAlias) mapAlias.addEventListener('change', () => {
    importState.mapping.aliasColumn = mapAlias.value;
    loadImportPreview();
  });
  
  if (btnBack) {
    btnBack.addEventListener('click', () => {
      section.classList.add('hidden');
      document.getElementById('wizard-section').classList.remove('hidden');
    });
  }

  modalClose.addEventListener('click', () => toggleModal(false));
  modalCancel.addEventListener('click', () => toggleModal(false));
  modalSave.addEventListener('click', save);

  inpAlias.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addAlias(inpAlias.value);
    }
  });

  aliasContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('tag-remove')) {
      const idx = parseInt(e.target.dataset.idx, 10);
      removeAlias(idx);
    }
  });

  window.contactsPage = {
    show: () => {
      document.getElementById('wizard-section').classList.add('hidden');
      section.classList.remove('hidden');
      resetImport();
      loadContacts();
    }
  };

  const headerBtn = document.getElementById('btn-open-contacts');
  if (headerBtn) {
    headerBtn.disabled = false;
    headerBtn.addEventListener('click', window.contactsPage.show);
  }

})();
