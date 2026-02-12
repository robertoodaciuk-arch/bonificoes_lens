(function () {
  const { showToast } = window.uiToast || { showToast: console.log };

  const step3Content = document.getElementById('step3-content');
  if (!step3Content) return;

  const fmtPdf = document.getElementById('cfg-fmt-pdf');
  const fmtPng = document.getElementById('cfg-fmt-png');
  const msgTemplate = document.getElementById('cfg-message-template');

  const delayMin = document.getElementById('cfg-delay-min');
  const delayMax = document.getElementById('cfg-delay-max');
  const batchSize = document.getElementById('cfg-batch-size');
  const breakMin = document.getElementById('cfg-break-min');
  const breakMax = document.getElementById('cfg-break-max');

  const btnBack = document.getElementById('btn-back-step2');
  const btnNext = document.getElementById('btn-next-step4');

  function getConfig() {
    return {
      output: {
        pdf: !!fmtPdf?.checked,
        png: !!fmtPng?.checked,
      },
      mode: 'PROD',
      messageTemplate: String(msgTemplate?.value || '').trim() || 'Olá {vendedor}, segue seu relatório de bonificações do período {periodo}.',
      antiBan: {
        minDelaySec: Number(delayMin?.value || 8),
        maxDelaySec: Number(delayMax?.value || 15),
        batchSize: Number(batchSize?.value || 10),
        breakMinSec: Number(breakMin?.value || 120),
        breakMaxSec: Number(breakMax?.value || 300),
      },
    };
  }

  function validateConfig(cfg) {
    if (!cfg.output.pdf && !cfg.output.png) return 'Selecione PDF e/ou Imagem.';
    if (cfg.antiBan.minDelaySec <= 0 || cfg.antiBan.maxDelaySec < cfg.antiBan.minDelaySec) return 'Delays inválidos.';
    return null;
  }

  function setWizardStepActive(idx) {
    document.querySelectorAll('.wizard-steps .step').forEach(s => s.classList.remove('active'));
    const steps = document.querySelectorAll('.wizard-steps .step');
    steps[idx]?.classList.add('active');
  }

  function showStep3() {
    document.getElementById('step1-content')?.classList.add('hidden');
    document.getElementById('step2-content')?.classList.add('hidden');
    document.getElementById('step4-content')?.classList.add('hidden');
    document.getElementById('step5-content')?.classList.add('hidden');
    document.getElementById('step6-content')?.classList.add('hidden');
    step3Content.classList.remove('hidden');
    setWizardStepActive(2);
  }

  async function goNext() {
    const cfg = getConfig();
    const err = validateConfig(cfg);
    if (err) {
      showToast('warn', err);
      return;
    }

    window.wizardState = window.wizardState || {};
    window.wizardState.config = cfg;

    showToast('success', 'Configuração salva.');
    window.wizardStep4?.show?.();
  }

  btnBack?.addEventListener('click', () => window.wizardStep2?.show?.());
  btnNext?.addEventListener('click', goNext);

  window.wizardStep3 = {
    show: showStep3,
    getConfig,
  };
})();
