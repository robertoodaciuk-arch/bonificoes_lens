(function () {
  const api = window.api;
  const toastApi = window.uiToast || { showToast: console.log };
  const step1Ui = window.wizardStep1 || {};

  const { showToast } = toastApi;
  const {
    renderPreviewTable = () => {},
    renderWarnings = () => {},
    renderSellerList = () => {},
    renderInsights = () => {},
    renderSkeleton = () => {},
  } = step1Ui;

  if (!api) {
    console.error('[App] API preload indisponível.');
    return;
  }

  const ui = {
    dropzone: document.getElementById('dropzone'),
    dropFile: document.getElementById('drop-file'),
    previewArea: document.getElementById('preview-area'),
    statusText: document.getElementById('status-text'),
    btnClear: document.getElementById('btn-clear'),
    btnConfirm: document.getElementById('btn-confirm'),
    btnPickFile: document.getElementById('btn-pick-file'),
    btnThemeToggle: document.getElementById('btn-theme-toggle'),
    runtimeModeBadge: document.getElementById('runtime-mode-badge'),
    btnCommandPalette: document.getElementById('btn-command-palette'),
    commandPalette: document.getElementById('command-palette'),
    commandBackdrop: document.getElementById('command-backdrop'),
    commandClose: document.getElementById('command-close'),
    commandInput: document.getElementById('command-input'),
    commandList: document.getElementById('command-list'),
    kpiSellers: document.getElementById('kpi-sellers'),
    kpiTotals: document.getElementById('kpi-totals'),
    kpiNan: document.getElementById('kpi-nan'),
    periodSelector: document.getElementById('period-selector'),
    periodSelectorWrap: document.getElementById('period-selector-wrap'),
  };

  const state = {
    currentFilePath: null,
    lastPreview: null,
    isLoading: false,
  };

  function setBusy(text) {
    if (ui.statusText) ui.statusText.textContent = text;
  }

  function setLoading(isLoading) {
    state.isLoading = isLoading;
    if (ui.btnPickFile) ui.btnPickFile.disabled = isLoading;
    if (ui.btnClear) ui.btnClear.disabled = isLoading || !state.lastPreview;
    if (ui.btnConfirm) ui.btnConfirm.disabled = isLoading || !state.lastPreview;
    if (ui.dropzone) {
      ui.dropzone.classList.toggle('is-busy', isLoading);
      ui.dropzone.classList.toggle('scanning', isLoading);
      ui.dropzone.setAttribute('aria-busy', isLoading ? 'true' : 'false');
    }
  }

  const MONTH_NAMES_PT = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ];

  function formatPeriodLabel(periodRef) {
    if (!periodRef) return '';
    const m = String(periodRef).match(/^(\d{4})-(\d{2})$/);
    if (!m) return periodRef;
    const year = m[1];
    const monthIdx = Number(m[2]) - 1;
    const monthName = MONTH_NAMES_PT[monthIdx] || m[2];
    return `${monthName} de ${year}`;
  }

  function nowPeriodRef() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${m}`;
  }

  // Valid Excel serial date range (approx. 1902 to 2447)
  const MIN_EXCEL_SERIAL = 1000;
  const MAX_EXCEL_SERIAL = 200000;
  // Century pivot: years >= this value are 1900s, below are 2000s
  const YEAR_2DIGIT_PIVOT = 50;

  function tryParsePeriodRefFromDate(raw) {
    if (raw === null || raw === undefined || raw === '') return null;

    // dd/mm/yyyy
    if (typeof raw === 'string') {
      let m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m) {
        const month = String(Number(m[2])).padStart(2, '0');
        return `${m[3]}-${month}`;
      }

      // dd/mm/yy
      m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
      if (m) {
        const yy = Number(m[3]);
        const fullYear = yy >= YEAR_2DIGIT_PIVOT ? 1900 + yy : 2000 + yy;
        const month = String(Number(m[2])).padStart(2, '0');
        return `${fullYear}-${month}`;
      }

      // ISO yyyy-mm-dd
      m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return `${m[1]}-${m[2]}`;
    }

    // Excel serial number
    if (typeof raw === 'number' && raw > MIN_EXCEL_SERIAL && raw < MAX_EXCEL_SERIAL) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const utcMs = excelEpoch.getTime() + Math.round(raw) * 86400000;
      const date = new Date(utcMs);
      if (!Number.isNaN(date.getTime())) {
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        return `${date.getUTCFullYear()}-${month}`;
      }
    }

    return null;
  }

  function derivePeriodRef(previewRows = []) {
    for (const row of previewRows) {
      const fromVenda = tryParsePeriodRefFromDate(row?.['DATA VENDA']);
      if (fromVenda) return fromVenda;
    }
    return nowPeriodRef();
  }

  function normalizeWorkerPreview(workerPayload) {
    const previewRows = Array.isArray(workerPayload?.rows) ? workerPayload.rows : [];
    const columns = Array.isArray(workerPayload?.headers) ? workerPayload.headers : [];

    const sellersMap = new Map();
    let totalsRowsIgnored = 0;
    let nanSellerRowsLinked = 0;
    let previousSeller = '';

    for (const row of previewRows) {
      const rawSeller = row?.['VENDEDOR'];
      const sellerText = rawSeller === null || rawSeller === undefined ? '' : String(rawSeller).trim();
      const sellerUpper = sellerText.toUpperCase();

      if (!sellerText || sellerUpper === 'NAN') {
        if (previousSeller) {
          nanSellerRowsLinked++;
          sellersMap.set(previousSeller, (sellersMap.get(previousSeller) || 0) + 1);
        }
        continue;
      }

      if (sellerUpper === 'TOTAL') {
        totalsRowsIgnored++;
        continue;
      }

      previousSeller = sellerText;
      sellersMap.set(sellerText, (sellersMap.get(sellerText) || 0) + 1);
    }

    const sellers = Array.from(sellersMap.entries())
      .map(([sellerNameRaw, rows]) => ({
        sellerNameRaw,
        sellerNameNorm: sellerNameRaw,
        rows,
      }))
      .sort((a, b) => b.rows - a.rows);

    return {
      columns,
      previewRows,
      anomalies: [],
      detected: {
        sellers,
        totalsRowsIgnored,
        nanSellerRowsLinked,
      },
    };
  }

  function normalizePreviewPayload(data) {
    if (!data || typeof data !== 'object') {
      return {
        columns: [],
        previewRows: [],
        anomalies: [{ severity: 'error', message: 'Payload de preview inválido.' }],
        detected: { sellers: [], totalsRowsIgnored: 0, nanSellerRowsLinked: 0 },
      };
    }

    const isServiceShape = Array.isArray(data.previewRows) && data.detected;
    if (isServiceShape) {
      return {
        columns: Array.isArray(data.columns) ? data.columns : [],
        previewRows: Array.isArray(data.previewRows) ? data.previewRows : [],
        anomalies: Array.isArray(data.anomalies) ? data.anomalies : [],
        detected: {
          sellers: Array.isArray(data.detected?.sellers) ? data.detected.sellers : [],
          totalsRowsIgnored: Number(data.detected?.totalsRowsIgnored || 0),
          nanSellerRowsLinked: Number(data.detected?.nanSellerRowsLinked || 0),
        },
      };
    }

    const isWorkerShape = Array.isArray(data.rows) && Array.isArray(data.headers);
    if (isWorkerShape) return normalizeWorkerPreview(data);

    return {
      columns: [],
      previewRows: [],
      anomalies: [{ severity: 'error', message: 'Formato de preview não reconhecido.' }],
      detected: { sellers: [], totalsRowsIgnored: 0, nanSellerRowsLinked: 0 },
    };
  }

  function updateKpis(preview) {
    if (ui.kpiSellers) ui.kpiSellers.textContent = String(preview.detected?.sellers?.length || 0);
    if (ui.kpiTotals) ui.kpiTotals.textContent = String(preview.detected?.totalsRowsIgnored || 0);
    if (ui.kpiNan) ui.kpiNan.textContent = String(preview.detected?.nanSellerRowsLinked || 0);
  }

  function renderPreview(preview) {
    state.lastPreview = preview;
    window.wizardState = window.wizardState || {};
    window.wizardState.preview = preview;
    window.wizardStep1.lastPreview = preview;

    if (ui.previewArea) ui.previewArea.classList.remove('hidden');

    updateKpis(preview);

    renderInsights({
      sellersCount: preview.detected?.sellers?.length || 0,
      dataRows: preview.previewRows?.length || 0,
      ignoredRows: (preview.detected?.totalsRowsIgnored || 0) + (preview.detected?.nanSellerRowsLinked || 0),
    });

    renderWarnings(preview.anomalies || []);
    renderSellerList(preview.detected?.sellers || []);
    renderPreviewTable(preview.columns || [], preview.previewRows || []);

    // Show period selector with derived value
    const derivedPeriod = derivePeriodRef(preview.previewRows || []);
    if (ui.periodSelector) {
      ui.periodSelector.value = derivedPeriod;
    }
    if (ui.periodSelectorWrap) {
      ui.periodSelectorWrap.style.display = '';
    }

    const hasBlockingError = (preview.anomalies || []).some((a) => a.severity === 'error');
    if (hasBlockingError) {
      showToast('warn', 'Preview gerado com alertas críticos. Revise antes de continuar.');
      setBusy('Preview com erros. Ajuste o arquivo e tente novamente.');
      if (ui.btnConfirm) ui.btnConfirm.disabled = true;
      return;
    }

    if (ui.btnConfirm) ui.btnConfirm.disabled = false;
    setBusy('Preview pronto.');
  }

  function reset() {
    state.currentFilePath = null;
    state.lastPreview = null;

    if (ui.dropFile) ui.dropFile.textContent = '';
    if (ui.previewArea) ui.previewArea.classList.add('hidden');
    if (ui.kpiSellers) ui.kpiSellers.textContent = '—';
    if (ui.kpiTotals) ui.kpiTotals.textContent = '—';
    if (ui.kpiNan) ui.kpiNan.textContent = '—';
    if (ui.periodSelectorWrap) ui.periodSelectorWrap.style.display = 'none';

    setBusy('Aguardando arquivo…');
    setLoading(false);

    if (ui.btnClear) ui.btnClear.disabled = true;
    if (ui.btnConfirm) ui.btnConfirm.disabled = true;

    window.wizardState = window.wizardState || {};
    delete window.wizardState.preview;
    delete window.wizardState.importId;
    delete window.wizardState.sellerReportIds;
    delete window.wizardState.periodRef;
  }

  async function runPreview(filePath) {
    const result = await api.importPreview({ filePath });
    if (!result?.ok) throw new Error(result?.error?.message || 'Falha ao processar preview.');
    return normalizePreviewPayload(result.data);
  }

  async function loadByPath(filePath, preloadedPreview = null) {
    if (!filePath) return;

    state.currentFilePath = filePath;
    if (ui.dropFile) ui.dropFile.textContent = filePath;

    setLoading(true);
    setBusy('Processando arquivo…');

    if (ui.previewArea) ui.previewArea.classList.remove('hidden');
    renderSkeleton();

    try {
      const preview = preloadedPreview
        ? normalizePreviewPayload(preloadedPreview)
        : await runPreview(filePath);

      renderPreview(preview);
      showToast('success', 'Arquivo carregado com sucesso.');
    } catch (error) {
      console.error('[App] Falha no preview', error);
      showToast('error', error?.message || 'Falha ao processar arquivo.');
      setBusy('Falha ao processar arquivo.');
    } finally {
      setLoading(false);
    }
  }

  async function commitImportAndContinue() {
    if (!state.currentFilePath) {
      showToast('warn', 'Selecione um arquivo antes de continuar.');
      return;
    }

    if (!state.lastPreview) {
      showToast('warn', 'Gere o preview antes de continuar.');
      return;
    }

    // Use user-selected period if available, otherwise derive from data
    const periodSelector = document.getElementById('period-selector');
    const periodRef = periodSelector?.value || derivePeriodRef(state.lastPreview.previewRows || []);

    setLoading(true);
    setBusy('Confirmando importação…');

    try {
      const res = await api.importCommit({
        filePath: state.currentFilePath,
        periodRef,
      });

      if (!res?.ok) {
        throw new Error(res?.error?.message || 'Falha ao confirmar importação.');
      }

      window.wizardState = window.wizardState || {};
      window.wizardState.importId = res.data.importId;
      window.wizardState.sellerReportIds = res.data.sellerReportIds || [];
      window.wizardState.periodRef = periodRef;

      showToast('success', 'Importação confirmada.');
      setBusy(`Importação pronta (${formatPeriodLabel(periodRef)}).`);

      await window.wizardStep2?.init?.({
        importId: res.data.importId,
        sellers: state.lastPreview.detected?.sellers || [],
      });
    } catch (error) {
      console.error('[App] Falha no commit', error);
      showToast('error', error?.message || 'Falha ao confirmar importação.');
      setBusy('Erro ao confirmar importação.');
    } finally {
      setLoading(false);
    }
  }

  async function pickFileAndLoad() {
    setBusy('Abrindo seletor de arquivo…');

    try {
      const res = await api.pickImportFile();
      if (!res?.ok) {
        throw new Error(res?.error?.message || 'Falha ao abrir seletor de arquivo.');
      }

      if (res.data?.canceled) {
        setBusy('Seleção cancelada.');
        return;
      }

      if (!res.data?.filePath) {
        throw new Error('Nenhum arquivo válido foi selecionado.');
      }

      await loadByPath(res.data.filePath, res.data.preloadedPreview || null);
    } catch (error) {
      console.error('[App] Falha ao selecionar arquivo', error);
      showToast('error', error?.message || 'Erro ao selecionar arquivo.');
      setBusy('Aguardando arquivo…');
    }
  }


  const commandItems = [
    { id: 'pick-file', label: 'Importar planilha', hint: 'Abrir seletor de arquivo', run: () => pickFileAndLoad() },
    { id: 'continue', label: 'Continuar para revisão', hint: 'Confirma importação atual', run: () => commitImportAndContinue() },
    { id: 'clear', label: 'Limpar importação', hint: 'Resetar etapa atual', run: () => reset() },
    { id: 'contacts', label: 'Abrir contatos', hint: 'Gerenciar contatos de vendedores', run: () => document.getElementById('btn-open-contacts')?.click() },
    { id: 'theme', label: 'Alternar tema', hint: 'Claro / escuro', run: () => ui.btnThemeToggle?.click() },
  ];

  function closeCommandPalette() {
    if (!ui.commandPalette) return;
    ui.commandPalette.classList.add('hidden');
    ui.commandPalette.setAttribute('aria-hidden', 'true');
  }

  function openCommandPalette() {
    if (!ui.commandPalette) return;
    ui.commandPalette.classList.remove('hidden');
    ui.commandPalette.setAttribute('aria-hidden', 'false');
    renderCommandList('');
    setTimeout(() => ui.commandInput?.focus(), 0);
  }

  function renderCommandList(filterText = '') {
    if (!ui.commandList) return;
    const term = String(filterText || '').trim().toLowerCase();
    const list = commandItems.filter((item) => (`${item.label} ${item.hint}`).toLowerCase().includes(term));

    if (!list.length) {
      ui.commandList.innerHTML = '<div class="command-empty">Nenhum comando encontrado.</div>';
      return;
    }

    ui.commandList.innerHTML = list.map((item, idx) => `
      <button class="command-item ${idx === 0 ? 'is-active' : ''}" data-command-id="${item.id}">
        <span>${item.label}</span>
        <small>${item.hint}</small>
      </button>
    `).join('');
  }

  function runCommand(id) {
    const cmd = commandItems.find((item) => item.id === id);
    if (!cmd) return;
    closeCommandPalette();
    cmd.run();
  }

  function bindCommandPalette() {
    if (!ui.commandPalette) return;

    ui.btnCommandPalette?.addEventListener('click', openCommandPalette);
    ui.commandBackdrop?.addEventListener('click', closeCommandPalette);
    ui.commandClose?.addEventListener('click', closeCommandPalette);

    ui.commandInput?.addEventListener('input', (e) => {
      renderCommandList(e.target.value);
    });

    ui.commandInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeCommandPalette();
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = ui.commandList?.querySelector('.command-item');
        if (first) runCommand(first.dataset.commandId);
      }
    });

    ui.commandList?.addEventListener('click', (e) => {
      const btn = e.target.closest('.command-item');
      if (!btn) return;
      runCommand(btn.dataset.commandId);
    });

    document.addEventListener('keydown', (e) => {
      const isShortcut = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k';
      if (isShortcut) {
        e.preventDefault();
        if (ui.commandPalette.classList.contains('hidden')) openCommandPalette();
        else closeCommandPalette();
      } else if (e.key === 'Escape' && !ui.commandPalette.classList.contains('hidden')) {
        closeCommandPalette();
      }
    });
  }


  function bindDropzone() {
    if (!ui.dropzone) return;

    const preventDefaults = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
      ui.dropzone.addEventListener(eventName, preventDefaults);
    });

    ['dragenter', 'dragover'].forEach((eventName) => {
      ui.dropzone.addEventListener(eventName, () => ui.dropzone.classList.add('dragover'));
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      ui.dropzone.addEventListener(eventName, () => ui.dropzone.classList.remove('dragover'));
    });

    ui.dropzone.addEventListener('drop', async (e) => {
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;

      const filePath = file.path || '';
      const fileName = file.name || '';

      if (!filePath) {
        showToast('error', 'Não foi possível obter o caminho do arquivo arrastado.');
        return;
      }

      const isExcel = /\.xlsx?$/i.test(filePath || fileName);
      if (!isExcel) {
        showToast('error', 'Selecione uma planilha Excel (.xlsx ou .xls).');
        return;
      }

      await loadByPath(filePath);
    });

    ui.dropzone.addEventListener('click', (e) => {
      // Avoid double-triggering when button inside dropzone is clicked
      if (e.target.closest('#btn-pick-file')) return;
      pickFileAndLoad();
    });
    ui.dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pickFileAndLoad();
      }
    });
  }

  function bindActions() {
    ui.btnPickFile?.addEventListener('click', pickFileAndLoad);
    ui.btnClear?.addEventListener('click', reset);
    ui.btnConfirm?.addEventListener('click', commitImportAndContinue);
  }

  function setupTheme() {
    const body = document.body;
    const savedTheme = localStorage.getItem('theme') || 'dark';

    const applyTheme = (theme) => {
      const isLight = theme === 'light';
      body.classList.toggle('theme-light', isLight);
      if (ui.btnThemeToggle) ui.btnThemeToggle.textContent = isLight ? '☀️' : '🌙';
      localStorage.setItem('theme', isLight ? 'light' : 'dark');
    };

    applyTheme(savedTheme);

    ui.btnThemeToggle?.addEventListener('click', () => {
      const next = body.classList.contains('theme-light') ? 'dark' : 'light';
      applyTheme(next);
    });
  }

  function setupRuntimeModeBadge() {
    if (!ui.runtimeModeBadge) return;

    const isMock = Boolean(api?.runtime?.enableTestHooks);
    ui.runtimeModeBadge.classList.toggle('hidden', !isMock);
    ui.runtimeModeBadge.textContent = isMock ? 'MODO TESTE' : '';
  }

  function exposeTestHook() {
    const isProduction = !!api?.runtime?.isProduction;
    const enableTestHooks = !!api?.runtime?.enableTestHooks;
    if (isProduction && !enableTestHooks) return;

    window.__test = {
      loadByPath,
      getState: () => ({
        currentFilePath: state.currentFilePath,
        hasPreview: !!state.lastPreview,
        sellerCount: state.lastPreview?.detected?.sellers?.length || 0,
        periodRef: window.wizardState?.periodRef || null,
      }),
    };
  }

  // ═══ SIDEBAR NAVIGATION ═══
  const stepTitles = {
    step1: { title: '📥 Importar Planilha', subtitle: 'Arraste e solte o arquivo Excel' },
    step2: { title: '🔍 Revisão de Vendedores', subtitle: 'Associe vendedores não identificados' },
    step3: { title: '⚙️ Configuração', subtitle: 'Formato, mensagem e anti-bloqueio' },
    step4: { title: '👁️ Preview do Relatório', subtitle: 'Gere e valide antes de enviar' },
    step5: { title: '🚀 Execução de Envios', subtitle: 'Dispare e acompanhe o progresso' },
    step6: { title: '📊 Dashboard de Envios', subtitle: 'Resultados completos dos envios' },
    contacts: { title: '👥 Meus Contatos', subtitle: 'Gerenciar contatos de vendedores' },
  };

  function updateTopbar(navId) {
    const info = stepTitles[navId] || stepTitles.step1;
    const topbarTitle = document.getElementById('topbar-title');
    const topbarSubtitle = document.getElementById('topbar-subtitle');
    if (topbarTitle) topbarTitle.textContent = info.title;
    if (topbarSubtitle) topbarSubtitle.textContent = info.subtitle;

    // Update statusbar step
    const stepNum = navId.startsWith('step') ? navId.replace('step', '') : '';
    const statusbarStep = document.getElementById('statusbar-step');
    if (statusbarStep && stepNum) {
      statusbarStep.textContent = `Etapa ${stepNum}/6`;
    }
  }

  function setSidebarActive(navId) {
    document.querySelectorAll('.sidebar-item').forEach(item => {
      item.classList.toggle('active', item.dataset.nav === navId);
    });
    updateTopbar(navId);
  }

  function bindSidebar() {
    document.querySelectorAll('.sidebar-item[data-nav]').forEach(item => {
      item.addEventListener('click', () => {
        const navId = item.dataset.nav;
        if (!navId) return;

        if (navId === 'contacts') {
          // Show contacts, hide wizard
          document.getElementById('wizard-section')?.classList.add('hidden');
          document.getElementById('contacts-section')?.classList.remove('hidden');
          setSidebarActive('contacts');
          return;
        }

        // Show wizard, hide contacts
        document.getElementById('wizard-section')?.classList.remove('hidden');
        document.getElementById('contacts-section')?.classList.add('hidden');

        // Show the right step
        const stepMap = {
          step1: 'step1-content',
          step2: 'step2-content',
          step3: 'step3-content',
          step4: 'step4-content',
          step5: 'step5-content',
          step6: 'step6-content',
        };

        Object.values(stepMap).forEach(id => {
          document.getElementById(id)?.classList.add('hidden');
        });

        const targetId = stepMap[navId];
        if (targetId) {
          document.getElementById(targetId)?.classList.remove('hidden');
        }

        setSidebarActive(navId);

        // Trigger show functions for steps
        if (navId === 'step5') window.wizardStep5?.show?.();
        if (navId === 'step6') window.wizardStep6?.show?.();
      });
    });
  }

  // Make sidebar update accessible to step scripts
  window.setSidebarActive = setSidebarActive;

  bindDropzone();
  bindActions();
  bindCommandPalette();
  bindSidebar();
  setupTheme();
  setupRuntimeModeBadge();
  exposeTestHook();
  reset();
})();