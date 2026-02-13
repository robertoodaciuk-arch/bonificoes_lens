(function () {
  const { showToast } = window.uiToast || { showToast: console.log };

  const step6Content = document.getElementById('step6-content');
  if (!step6Content) return;

  const btnBack = document.getElementById('btn-back-step5');
  const btnRefresh = document.getElementById('btn-refresh-dashboard');

  const kpiSent = document.getElementById('dash-kpi-sent');
  const kpiUnsent = document.getElementById('dash-kpi-unsent');
  const kpiErrors = document.getElementById('dash-kpi-errors');
  const summaryEl = document.getElementById('dash-summary');
  const tableEl = document.getElementById('dashboard-table');

  let intervalId = null;

  function setWizardStepActive(idx) {
    document.querySelectorAll('.wizard-steps .step').forEach((s) => s.classList.remove('active'));
    const steps = document.querySelectorAll('.wizard-steps .step');
    steps[idx]?.classList.add('active');
    const sidebarMap = ['step1', 'step2', 'step3', 'step4', 'step5', 'step6'];
    if (window.setSidebarActive && sidebarMap[idx]) window.setSidebarActive(sidebarMap[idx]);
  }

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatPhone(phone) {
    if (!phone) return '—';
    const raw = String(phone).replace(/\D+/g, '');
    if (raw.length === 13 && raw.startsWith('55')) {
      return `+55 (${raw.slice(2, 4)}) ${raw.slice(4, 9)}-${raw.slice(9)}`;
    }
    return String(phone);
  }

  function getStatusBadge(statusRaw) {
    const status = String(statusRaw || '').toUpperCase();

    if (status === 'SENT') return '<span class="badge success">Enviado</span>';
    if (status === 'FAILED') return '<span class="badge error">Falhou</span>';
    if (status === 'RETRY') return '<span class="badge warn">Retry</span>';
    if (status === 'PROCESSING') return '<span class="badge warn">Enviando</span>';
    if (status === 'PENDING') return '<span class="badge">Pendente</span>';

    return `<span class="badge">${esc(status || '—')}</span>`;
  }

  function renderSummaryText(status, summary) {
    const total = Number(summary?.total || 0);
    const sent = Number(summary?.sent || 0);
    const failed = Number(summary?.failed || 0);
    const pending = Number(summary?.pending || 0);
    const processing = Number(summary?.processing || 0);
    const retry = Number(summary?.retry || 0);
    const skipped = Number(summary?.skipped || 0);

    const completion = total > 0 ? Math.round((sent / total) * 100) : 0;

    return `Status: ${status || '—'} • Progresso: ${completion}% • Total: ${total} • Enviados: ${sent} • Falhas: ${failed} • Pendente: ${pending} • Processando: ${processing} • Retry: ${retry} • Ignorados: ${skipped}`;
  }

  function renderTable(items = []) {
    if (!tableEl) return;

    if (!items.length) {
      tableEl.innerHTML = `
        <tbody>
          <tr>
            <td colspan="5" class="table-empty-state">
              <div class="table-empty-block">
                <strong>Nenhum envio para exibir.</strong>
                <span>Assim que o job processar contatos, os resultados aparecerão aqui.</span>
              </div>
            </td>
          </tr>
        </tbody>
      `;
      return;
    }

    const head = `
      <thead>
        <tr>
          <th>Contato</th>
          <th>Telefone</th>
          <th>Vendedor</th>
          <th>Status</th>
          <th>Detalhe</th>
        </tr>
      </thead>
    `;

    const rows = items.map((item, idx) => {
      const detailRaw = item.last_error_message || item.last_attempt_error || '—';
      const detail = esc(detailRaw);
      const rowClass = idx % 2 === 0 ? 'dash-row-even' : 'dash-row-odd';

      return `
        <tr class="${rowClass}">
          <td>${esc(item.display_name || 'Sem nome')}</td>
          <td>${esc(formatPhone(item.phone_e164))}</td>
          <td>${esc(item.seller_name_raw || '—')}</td>
          <td>${getStatusBadge(item.status)}</td>
          <td class="dash-cell-detail" title="${detail}">${detail}</td>
        </tr>
      `;
    }).join('');

    tableEl.innerHTML = `${head}<tbody>${rows}</tbody>`;
  }

  async function refresh() {
    try {
      const state = window.wizardState || {};
      const status = await window.api.dispatch.getStatus();
      const targetJobId = status?.activeJobId || state.dispatchJobId;
      const dashboard = await window.api.dispatch.getDashboard(targetJobId);

      const summary = dashboard?.summary || {};
      const unsent = Number(summary.pending || 0) + Number(summary.processing || 0) + Number(summary.retry || 0) + Number(summary.skipped || 0);

      if (kpiSent) kpiSent.textContent = String(summary.sent || 0);
      if (kpiUnsent) kpiUnsent.textContent = String(unsent);
      if (kpiErrors) kpiErrors.textContent = String(summary.failed || 0);

      if (summaryEl) {
        summaryEl.textContent = renderSummaryText(status?.status, summary);
        summaryEl.classList.remove('is-empty', 'is-error');
      }

      renderTable(dashboard?.items || []);
    } catch (err) {
      console.error('[Step6] refresh error', err);
      if (summaryEl) {
        summaryEl.textContent = 'Falha ao carregar dashboard.';
        summaryEl.classList.remove('is-empty');
        summaryEl.classList.add('is-error');
      }
      showToast('error', 'Falha ao atualizar dashboard');
    }
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    refresh();
    intervalId = setInterval(refresh, 5000);
  }

  function stopAutoRefresh() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function show() {
    document.getElementById('step1-content')?.classList.add('hidden');
    document.getElementById('step2-content')?.classList.add('hidden');
    document.getElementById('step3-content')?.classList.add('hidden');
    document.getElementById('step4-content')?.classList.add('hidden');
    document.getElementById('step5-content')?.classList.add('hidden');

    step6Content.classList.remove('hidden');
    setWizardStepActive(5);

    if (summaryEl) {
      summaryEl.classList.remove('is-error');
      summaryEl.classList.add('is-empty');
      summaryEl.textContent = 'Carregando dashboard…';
    }

    startAutoRefresh();
  }

  btnBack?.addEventListener('click', () => {
    stopAutoRefresh();
    window.wizardStep5?.show?.();
  });

  btnRefresh?.addEventListener('click', refresh);

  window.wizardStep6 = {
    show,
    refresh,
  };
})();
