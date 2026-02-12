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
    kpiSellers: document.getElementById('kpi-sellers'),
    kpiTotals: document.getElementById('kpi-totals'),
    kpiNan: document.getElementById('kpi-nan'),
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

  function nowPeriodRef() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${m}`;
  }

  function tryParsePeriodRefFromDate(raw) {
    if (raw === null || raw === undefined || raw === '') return null;

    // dd/mm/yyyy
    if (typeof raw === 'string') {
      const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m) {
        const month = String(Number(m[2])).padStart(2, '0');
        return `${m[3]}-${month}`;
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

    const periodRef = derivePeriodRef(state.lastPreview.previewRows || []);

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
      setBusy(`Importação pronta (${periodRef}).`);

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
      if (!file?.path) return;

      const isExcel = /\.xlsx?$/i.test(file.path);
      if (!isExcel) {
        showToast('error', 'Selecione uma planilha Excel (.xlsx ou .xls).');
        return;
      }

      await loadByPath(file.path);
    });

    ui.dropzone.addEventListener('click', () => pickFileAndLoad());
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

  bindDropzone();
  bindActions();
  setupTheme();
  setupRuntimeModeBadge();
  exposeTestHook();
  reset();
})();