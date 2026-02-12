(function () {
  const { contacts } = window.api || {};
  const { showToast } = window.uiToast || { showToast: console.log };

  const btnOpen = document.getElementById('btn-import-contacts');
  const modal = document.getElementById('contacts-import-modal');
  const btnClose = document.getElementById('contacts-import-close');
  const btnCancel = document.getElementById('contacts-import-cancel');

  const btnPick = document.getElementById('btn-contacts-pick-file');
  const fileLabel = document.getElementById('contacts-import-file');

  const mappingPane = document.getElementById('contacts-import-mapping');
  const previewPane = document.getElementById('contacts-import-preview');

  const selName = document.getElementById('map-col-name');
  const selPhone = document.getElementById('map-col-phone');
  const selAlias = document.getElementById('map-col-alias');

  const btnPreview = document.getElementById('btn-contacts-preview');
  const statsEl = document.getElementById('contacts-import-stats');
  const table = document.getElementById('contacts-import-table');
  const btnCommit = document.getElementById('contacts-import-commit');

  if (!btnOpen || !modal || !btnPick || !btnPreview || !btnCommit) return;
  if (!contacts) return;

  let currentFilePath = null;
  let currentColumns = [];

  function setStateText(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.classList.remove('is-empty', 'is-loading', 'is-error', 'is-success');
    if (type) el.classList.add(`is-${type}`);
  }

  function toggle(open) {
    if (open) {
      modal.classList.add('open');
      modal.style.display = 'flex';
    } else {
      modal.classList.remove('open');
      setTimeout(() => {
        if (!modal.classList.contains('open')) modal.style.display = 'none';
      }, 300);
    }
  }

  modal.style.display = 'none';

  function setOptions(select, columns, { allowEmpty = false } = {}) {
    select.innerHTML = '';
    if (allowEmpty) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '—';
      select.appendChild(opt);
    }
    columns.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      select.appendChild(opt);
    });
  }

  function guessColumn(columns, candidates) {
    const norm = (s) => String(s || '').toLowerCase();
    const cols = columns.map((c) => ({ raw: c, n: norm(c) }));
    for (const cand of candidates) {
      const c = cols.find((x) => x.n === cand || x.n.includes(cand));
      if (c) return c.raw;
    }
    return '';
  }

  function renderTable(rows) {
    table.innerHTML = '';
    const thead = document.createElement('thead');
    thead.innerHTML = `<tr><th>Nome</th><th>Telefone (E.164)</th><th>Aliases</th></tr>`;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    rows.forEach((r) => {
      const tr = document.createElement('tr');
      const aliasText = Array.isArray(r.aliases) ? r.aliases.join(', ') : '';
      tr.innerHTML = `<td>${r.displayName || '—'}</td><td>${r.phoneE164 || '—'}</td><td class="table-muted">${aliasText || '—'}</td>`;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }

  async function pickFile() {
    btnPick.disabled = true;
    btnCommit.disabled = true;
    previewPane.classList.add('hidden');
    setStateText(fileLabel, 'Selecionando arquivo…', 'loading');

    try {
      const res = await contacts.pickImportFile();
      if (!res?.ok) throw new Error(res?.error || 'Falha ao abrir seletor');
      if (res.data?.canceled) {
        setStateText(fileLabel, 'Nenhum arquivo selecionado.', 'empty');
        return;
      }

      currentFilePath = res.data.filePath;
      setStateText(fileLabel, currentFilePath, 'success');

      // First preview without mapping (to get columns)
      const p = await contacts.importPreview({ filePath: currentFilePath });
      if (!p?.ok) throw new Error(p?.error || 'Falha no preview');

      currentColumns = p.data.columns || [];
      if (!currentColumns.length) throw new Error('Nenhuma coluna detectada');

      mappingPane.classList.remove('hidden');
      setOptions(selName, currentColumns);
      setOptions(selPhone, currentColumns);
      setOptions(selAlias, currentColumns, { allowEmpty: true });

      selName.value = guessColumn(currentColumns, ['nome', 'name', 'vendedor', 'display']);
      selPhone.value = guessColumn(currentColumns, ['telefone', 'celular', 'whatsapp', 'phone', 'mobile']);
      selAlias.value = guessColumn(currentColumns, ['alias', 'apelido', 'aliases']);

      showToast('info', 'Selecione as colunas e gere um preview.');
    } catch (e) {
      showToast('error', e?.message || 'Erro ao importar');
      setStateText(fileLabel, e?.message || 'Erro ao importar', 'error');
    } finally {
      btnPick.disabled = false;
    }
  }

  async function preview() {
    if (!currentFilePath) return;

    const mapping = {
      nameColumn: selName.value,
      phoneColumn: selPhone.value,
      aliasColumn: selAlias.value || null,
    };

    if (!mapping.nameColumn || !mapping.phoneColumn) {
      showToast('warn', 'Mapeie Nome e Telefone.');
      return;
    }

    btnPreview.disabled = true;
    btnCommit.disabled = true;
    setStateText(statsEl, 'Gerando preview…', 'loading');

    try {
      const res = await contacts.importPreview({
        filePath: currentFilePath,
        mapping,
        options: { previewRows: 40 },
      });
      if (!res?.ok) throw new Error(res?.error || 'Falha ao gerar preview');

      const st = res.data.stats;
      setStateText(statsEl, `Linhas: ${st.totalRows} | com telefone: ${st.rowsWithPhone} | únicos: ${st.uniquePhones} | duplicados: ${st.duplicatePhones} | inválidos: ${st.invalidPhones}`, 'success');

      renderTable(res.data.normalizedPreview || []);

      previewPane.classList.remove('hidden');
      btnCommit.disabled = false;
      showToast('success', 'Preview pronto.');
    } catch (e) {
      showToast('error', e?.message || 'Erro no preview');
      setStateText(statsEl, e?.message || 'Erro no preview', 'error');
    } finally {
      btnPreview.disabled = false;
    }
  }

  async function commit() {
    if (!currentFilePath) return;

    const mapping = {
      nameColumn: selName.value,
      phoneColumn: selPhone.value,
      aliasColumn: selAlias.value || null,
    };

    btnCommit.disabled = true;
    btnCommit.textContent = 'Importando…';

    try {
      const res = await contacts.importCommit({ filePath: currentFilePath, mapping });
      if (!res?.ok) throw new Error(res?.error || 'Falha ao importar');

      const st = res.data.stats;
      showToast('success', `Importação concluída: +${st.created} criados, ${st.updated} atualizados, ${st.invalidPhones} inválidos.`);

      // Refresh contacts page
      window.contactsPage?.show?.();
      toggle(false);

    } catch (e) {
      showToast('error', e?.message || 'Erro ao importar');
    } finally {
      btnCommit.textContent = 'Importar';
      btnCommit.disabled = false;
    }
  }

  btnOpen.addEventListener('click', () => toggle(true));
  btnClose?.addEventListener('click', () => toggle(false));
  btnCancel?.addEventListener('click', () => toggle(false));

  btnPick.addEventListener('click', pickFile);
  btnPreview.addEventListener('click', preview);
  btnCommit.addEventListener('click', commit);
})();
