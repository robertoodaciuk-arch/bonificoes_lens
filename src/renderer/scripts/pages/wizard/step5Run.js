(function () {
  const { showToast } = window.uiToast || { showToast: console.log };

  const step5Content = document.getElementById('step5-content');
  if (!step5Content) return;

  const btnBack = document.getElementById('btn-back-step4');
  const btnDashboard = document.getElementById('btn-open-dashboard');
  const btnStart = document.getElementById('btn-start-dispatch');
  const btnPause = document.getElementById('btn-dispatch-pause');
  const btnResume = document.getElementById('btn-dispatch-resume');
  const btnRetry = document.getElementById('btn-dispatch-retry');
  const btnStop = document.getElementById('btn-dispatch-stop');

  const runInfo = document.getElementById('run-info');
  const runStats = document.getElementById('run-stats');

  let statusPollTimer = null;

  function setWizardStepActive(idx) {
    document.querySelectorAll('.wizard-steps .step').forEach((s) => s.classList.remove('active'));
    const steps = document.querySelectorAll('.wizard-steps .step');
    steps[idx]?.classList.add('active');
    const sidebarMap = ['step1', 'step2', 'step3', 'step4', 'step5', 'step6'];
    if (window.setSidebarActive && sidebarMap[idx]) window.setSidebarActive(sidebarMap[idx]);
  }

  function setRunInfo(text, type = 'empty') {
    if (!runInfo) return;
    runInfo.textContent = text;
    runInfo.classList.remove('is-loading', 'is-error', 'is-success', 'is-empty');
    runInfo.classList.add(`is-${type}`);
  }

  function renderStats(statusPayload) {
    if (!runStats) return;

    const summary = statusPayload?.summary;
    if (!summary) {
      runStats.innerHTML = '<div class="run-empty">Sem detalhes para exibir.</div>';
      runStats.classList.add('is-empty');
      return;
    }

    runStats.classList.remove('is-empty');

    const c = summary.counts || {};
    const total = Number(summary.total || 0);
    const sent = Number(c.SENT || 0);
    const failed = Number(c.FAILED || 0);
    const pending = Number(c.PENDING || 0);
    const retry = Number(c.RETRY || 0);
    const processing = Number(c.PROCESSING || 0);

    const done = sent + failed;
    const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

    runStats.innerHTML = `
      <div class="run-dashboard">
        <div class="run-progress-head">
          <span>Progresso</span>
          <b>${pct}%</b>
        </div>
        <div class="run-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
          <div class="run-progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="run-progress-meta">${done}/${total} processados</div>

        <div class="run-kpi-grid">
          <div class="run-kpi run-kpi--success"><small>Enviados</small><strong>${sent}</strong></div>
          <div class="run-kpi"><small>Pendentes</small><strong>${pending}</strong></div>
          <div class="run-kpi run-kpi--warn"><small>Retry</small><strong>${retry}</strong></div>
          <div class="run-kpi run-kpi--error"><small>Falhas</small><strong>${failed}</strong></div>
          <div class="run-kpi"><small>Processando</small><strong>${processing}</strong></div>
        </div>
      </div>
    `;
  }

  function setControls(statusPayload) {
    const status = statusPayload?.status;
    const hasJob = Boolean(statusPayload?.activeJobId);
    const failedCount = Number(statusPayload?.summary?.counts?.FAILED || 0);

    btnPause.disabled = !(hasJob && status === 'RUNNING');
    btnResume.disabled = !(hasJob && status === 'PAUSED');
    btnStop.disabled = !(hasJob && (status === 'RUNNING' || status === 'PAUSED'));
    btnRetry.disabled = !(hasJob && failedCount > 0);

    const hasKnownJob = hasJob || Boolean(window.wizardState?.dispatchJobId);
    const canOpenDashboard = hasKnownJob && ['COMPLETED', 'STOPPED', 'PAUSED', 'ERROR'].includes(String(status || '').toUpperCase());
    btnDashboard.disabled = !canOpenDashboard;

    btnStart.disabled = hasJob && status === 'RUNNING';
  }

  async function refreshStatus() {
    try {
      const statusPayload = await window.api.dispatch.getStatus();
      const stateLabel = statusPayload?.status || 'IDLE';
      const jobText = statusPayload?.activeJobId ? ` • Job: ${statusPayload.activeJobId}` : '';

      if (!statusPayload?.activeJobId) {
        setRunInfo('Nenhum envio em execução.', 'empty');
      } else if (stateLabel === 'RUNNING') {
        setRunInfo(`Envio em andamento${jobText}`, 'loading');
      } else if (stateLabel === 'COMPLETED') {
        setRunInfo(`Envio concluído${jobText}`, 'success');
      } else if (stateLabel === 'ERROR') {
        setRunInfo(`Envio com erro${jobText}`, 'error');
      } else if (stateLabel === 'PAUSED') {
        setRunInfo(`Envio pausado${jobText}`, 'loading');
      } else {
        setRunInfo(`Status: ${stateLabel}${jobText}`, 'success');
      }

      renderStats(statusPayload);
      setControls(statusPayload);

      if (['COMPLETED', 'STOPPED', 'ERROR'].includes(String(stateLabel).toUpperCase())) {
        stopStatusPolling();
      }
    } catch (err) {
      console.error('[Step5] refreshStatus error', err);
      setRunInfo('Falha ao consultar status de envio.', 'error');
    }
  }

  function startStatusPolling() {
    stopStatusPolling();
    refreshStatus();
    statusPollTimer = setInterval(refreshStatus, 2000);
  }

  function stopStatusPolling() {
    if (statusPollTimer) {
      clearInterval(statusPollTimer);
      statusPollTimer = null;
    }
  }

  async function showStep5() {
    document.getElementById('step1-content')?.classList.add('hidden');
    document.getElementById('step2-content')?.classList.add('hidden');
    document.getElementById('step3-content')?.classList.add('hidden');
    document.getElementById('step4-content')?.classList.add('hidden');
    document.getElementById('step6-content')?.classList.add('hidden');

    step5Content.classList.remove('hidden');
    setWizardStepActive(4);

    setRunInfo('Carregando status…', 'loading');
    startStatusPolling();
  }

  async function startDispatch() {
    const state = window.wizardState || {};
    const cfg = state.config;

    if (!state.importId) {
      showToast('warn', 'Nenhum import confirmado.');
      return;
    }

    if (!window.api?.dispatch) {
      showToast('error', 'Dispatch indisponível (preload/IPC).');
      return;
    }

    try {
      btnStart.disabled = true;
      setRunInfo('Criando job de envio…', 'loading');

      const dispatchConfig = {
        minDelay: Math.floor((cfg?.antiBan?.minDelaySec ?? 8) * 1000),
        maxDelay: Math.floor((cfg?.antiBan?.maxDelaySec ?? 15) * 1000),
        retryLimit: 3,
        output: cfg?.output || { pdf: true, png: false },
        messageTemplate: cfg?.messageTemplate,
        mode: cfg?.mode,
      };

      const status = await window.api.dispatch.getStatus();
      if (status?.status === 'RUNNING') {
        showToast('warn', 'Já existe um job em execução.');
        refreshStatus();
        return;
      }

      const createRes = await window.api.dispatch.createJob(state.importId, dispatchConfig);
      const jobId = createRes?.jobId || createRes?.data?.jobId;
      if (!jobId) throw new Error('Falha ao criar job (sem jobId).');

      state.dispatchJobId = jobId;
      await window.api.dispatch.start(jobId);

      showToast('success', 'Envios iniciados.');
      startStatusPolling();
    } catch (err) {
      console.error('[Step5] startDispatch error', err);
      showToast('error', err?.message || 'Falha ao iniciar envio');
      setRunInfo('Erro ao iniciar envio.', 'error');
    } finally {
      btnStart.disabled = false;
    }
  }

  async function pause() {
    await window.api.dispatch.pause();
    refreshStatus();
  }

  async function resume() {
    const st = await window.api.dispatch.getStatus();
    await window.api.dispatch.resume(st.activeJobId);
    refreshStatus();
  }

  async function stop() {
    await window.api.dispatch.stop();
    refreshStatus();
  }

  async function retryFailed() {
    const st = await window.api.dispatch.getStatus();
    if (!st.activeJobId) return;
    await window.api.dispatch.retryFailed(st.activeJobId);
    showToast('success', 'Falhas marcadas para reenvio.');
    refreshStatus();
  }

  btnBack?.addEventListener('click', () => {
    stopStatusPolling();
    window.wizardStep4?.show?.();
  });

  btnStart?.addEventListener('click', startDispatch);
  btnPause?.addEventListener('click', () => pause().catch(() => {}));
  btnResume?.addEventListener('click', () => resume().catch(() => {}));
  btnStop?.addEventListener('click', () => stop().catch(() => {}));
  btnRetry?.addEventListener('click', () => retryFailed().catch(() => {}));
  btnDashboard?.addEventListener('click', () => {
    stopStatusPolling();
    window.wizardStep6?.show?.();
  });

  window.wizardStep5 = {
    show: showStep5,
  };
})();
