(function () {
  const { showToast } = window.uiToast || { showToast: console.log };

  const step4Content = document.getElementById('step4-content');
  if (!step4Content) return;

  const btnBack = document.getElementById('btn-back-step3');
  const btnNext = document.getElementById('btn-next-step5');
  const btnGenerate = document.getElementById('btn-generate-preview');
  const previewInfo = document.getElementById('preview-info');

  function setWizardStepActive(idx) {
    document.querySelectorAll('.wizard-steps .step').forEach((s) => s.classList.remove('active'));
    const steps = document.querySelectorAll('.wizard-steps .step');
    steps[idx]?.classList.add('active');
  }

  function safeBaseName(filePath) {
    if (!filePath) return 'Não gerado';
    const parts = String(filePath).split(/[/\\]/);
    return parts[parts.length - 1] || filePath;
  }

  function setPreviewInfo(state = 'empty', payload = {}) {
    if (!previewInfo) return;

    previewInfo.classList.remove('is-loading', 'is-error', 'is-success', 'is-empty');
    previewInfo.classList.add(`is-${state}`);

    if (state === 'loading') {
      previewInfo.innerHTML = `
        <div class="preview-state preview-state--loading">
          <span class="preview-dot" aria-hidden="true"></span>
          <div>
            <strong>Gerando preview</strong>
            <p>Preparando PDF e PNG para validação visual…</p>
          </div>
        </div>
      `;
      return;
    }

    if (state === 'error') {
      const msg = payload?.message || 'Falha ao gerar preview.';
      previewInfo.innerHTML = `
        <div class="preview-state preview-state--error">
          <div>
            <strong>Não foi possível gerar o preview</strong>
            <p>${msg}</p>
          </div>
        </div>
      `;
      return;
    }

    if (state === 'success') {
      const artifacts = payload?.artifacts || {};
      const pdf = safeBaseName(artifacts.pdfPath);
      const png = safeBaseName(artifacts.pngPath);

      previewInfo.innerHTML = `
        <div class="preview-state preview-state--success">
          <div class="preview-state-head">
            <strong>Preview gerado com sucesso</strong>
            <span>Valide os arquivos antes de seguir para envio.</span>
          </div>
          <div class="preview-artifacts-grid">
            <article class="preview-artifact-card">
              <div class="preview-artifact-icon">PDF</div>
              <div class="preview-artifact-meta">
                <b>Relatório PDF</b>
                <p title="${pdf}">${pdf}</p>
              </div>
            </article>
            <article class="preview-artifact-card">
              <div class="preview-artifact-icon preview-artifact-icon--img">PNG</div>
              <div class="preview-artifact-meta">
                <b>Imagem PNG</b>
                <p title="${png}">${png}</p>
              </div>
            </article>
          </div>
        </div>
      `;
      return;
    }

    previewInfo.innerHTML = `
      <div class="preview-state preview-state--empty">
        <div>
          <strong>Ainda não gerado.</strong>
          <p>Clique em <b>Gerar Preview</b> para visualizar os artefatos.</p>
        </div>
      </div>
    `;
  }

  function showStep4() {
    document.getElementById('step1-content')?.classList.add('hidden');
    document.getElementById('step2-content')?.classList.add('hidden');
    document.getElementById('step3-content')?.classList.add('hidden');
    document.getElementById('step5-content')?.classList.add('hidden');
    document.getElementById('step6-content')?.classList.add('hidden');

    step4Content.classList.remove('hidden');
    setWizardStepActive(3);

    const existing = window.wizardState?.previewArtifacts;
    if (existing?.pdfPath || existing?.pngPath) {
      setPreviewInfo('success', { artifacts: existing });
      btnNext.disabled = false;
    } else {
      setPreviewInfo('empty');
      btnNext.disabled = false; // mantém fluxo sem bloqueio
    }
  }

  async function generateArtifacts() {
    const state = window.wizardState || {};
    const cfg = state.config;
    const sellerReportId = state.sellerReportIds?.[0];

    if (!cfg) {
      showToast('warn', 'Configuração não encontrada (Step 3).');
      setPreviewInfo('error', { message: 'Configuração não encontrada.' });
      return;
    }

    if (!sellerReportId) {
      showToast('warn', 'Nenhum vendedor disponível para gerar preview.');
      setPreviewInfo('empty');
      return;
    }

    btnGenerate.disabled = true;
    setPreviewInfo('loading');

    try {
      const output = cfg?.output || { pdf: true, png: true };
      const res = await window.api.reportsGenerate({ sellerReportId, output });

      if (!res?.ok) {
        throw new Error(res?.error?.message || 'Falha ao gerar preview.');
      }

      state.previewArtifacts = res.data?.artifacts || {};
      setPreviewInfo('success', { artifacts: state.previewArtifacts });
      showToast('success', 'Preview gerado com sucesso.');
      btnNext.disabled = false;
    } catch (err) {
      console.error('[Step4] generateArtifacts error', err);
      showToast('error', err?.message || 'Falha ao gerar preview');
      setPreviewInfo('error', { message: err?.message || 'Erro inesperado ao gerar preview.' });
    } finally {
      btnGenerate.disabled = false;
    }
  }

  btnBack?.addEventListener('click', () => window.wizardStep3?.show?.());
  btnNext?.addEventListener('click', () => window.wizardStep5?.show?.());
  btnGenerate?.addEventListener('click', generateArtifacts);

  window.wizardStep4 = {
    show: showStep4,
    generateArtifacts,
  };
})();
