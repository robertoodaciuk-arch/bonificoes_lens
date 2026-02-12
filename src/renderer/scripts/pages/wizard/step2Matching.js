(function () {
  const { contacts } = window.api || {};
  const { showToast } = window.uiToast || { showToast: console.log };

  const step1Content = document.getElementById('step1-content');
  const step2Content = document.getElementById('step2-content');
  const matchingList = document.getElementById('matching-list');
  const btnFinish = document.getElementById('btn-finish-match');
  const btnBack = document.getElementById('btn-back-step1');

  let allContacts = [];
  let currentSellers = [];
  const pendingChanges = new Map(); // sellerRaw -> { action: NEW|LINK|IGNORE, targetId? }

  if (!contacts) {
    console.warn('[Step2] Contacts API indisponível');
    return;
  }

  function setWizardStepActive(idx) {
    document.querySelectorAll('.wizard-steps .step').forEach((s) => s.classList.remove('active'));
    const steps = document.querySelectorAll('.wizard-steps .step');
    steps[idx]?.classList.add('active');
  }

  function setMatchingState(type, title, description) {
    const kind = type ? `is-${type}` : '';
    matchingList.innerHTML = `
      <div class="state-block ${kind}">
        <strong>${title}</strong>
        ${description ? `<span>${description}</span>` : ''}
      </div>
    `;
  }

  function renderSummary(total, unmatched) {
    const summary = document.createElement('div');
    summary.className = 'state-block';
    summary.style.marginBottom = '10px';
    summary.innerHTML = `
      <strong>Resumo da revisão</strong>
      <span>Total de vendedores: <b>${total}</b> • Pendentes de associação: <b>${unmatched}</b></span>
    `;
    matchingList.prepend(summary);
  }

  function makeSafeId(base, index) {
    return `${String(base || 'seller').replace(/[^a-zA-Z0-9]/g, '_')}_${index}`;
  }

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderUnmatchedActions(container, sellerRaw) {
    container.innerHTML = '';

    const select = document.createElement('select');
    select.className = 'match-select';

    const sorted = [...allContacts].sort((a, b) => String(a.display_name || '').localeCompare(String(b.display_name || ''), 'pt-BR', { sensitivity: 'base' }));
    select.innerHTML = `
      <option value="NEW">Criar novo contato</option>
      <option value="IGNORE">Ignorar (sem bonificação)</option>
      <option disabled>──────────</option>
      ${sorted.map((c) => `<option value="${c.id}">${esc(c.display_name)}</option>`).join('')}
    `;

    pendingChanges.set(sellerRaw, { action: 'NEW' });
    const row = container.closest('.match-row');
    if (row) row.dataset.action = 'NEW';

    select.addEventListener('change', () => {
      const value = select.value;
      if (row) row.dataset.action = value;

      if (value === 'NEW') pendingChanges.set(sellerRaw, { action: 'NEW' });
      else if (value === 'IGNORE') pendingChanges.set(sellerRaw, { action: 'IGNORE' });
      else pendingChanges.set(sellerRaw, { action: 'LINK', targetId: value });
    });

    container.appendChild(select);
  }

  async function initStep2({ sellers, importId } = {}) {
    currentSellers = Array.isArray(sellers) ? sellers : [];

    if (importId) {
      const res = await contacts.getUnmatchedReports(importId);
      if (res?.ok && Array.isArray(res.data)) {
        currentSellers = res.data.map((row) => ({
          sellerNameRaw: row.seller_name_raw,
          sellerNameNorm: row.seller_name_norm,
          rows: row.rows_count,
          reportId: row.id,
        }));
      }
    }

    step1Content?.classList.add('hidden');
    step2Content?.classList.remove('hidden');
    setWizardStepActive(1);

    setMatchingState('loading', 'Analisando vendedores…', 'Verificando contatos e possíveis matches.');

    if (!currentSellers.length) {
      setMatchingState('empty', 'Nenhum vendedor para revisar', 'Todos foram identificados ou não há dados disponíveis.');
      btnFinish.textContent = 'Continuar';
      return;
    }

    const contactsRes = await contacts.getAll();
    if (!contactsRes?.ok) {
      setMatchingState('error', 'Falha ao carregar contatos', 'Tente novamente ou verifique o serviço.');
      return;
    }

    allContacts = contactsRes.data || [];
    pendingChanges.clear();
    matchingList.innerHTML = '';

    let unmatchedCount = 0;

    for (let index = 0; index < currentSellers.length; index++) {
      const seller = currentSellers[index];
      const safeId = makeSafeId(seller.sellerNameRaw, index);

      const row = document.createElement('div');
      row.className = 'match-row';
      row.dataset.seller = seller.sellerNameRaw;
      row.innerHTML = `
        <div class="match-info">
          <div class="match-name" title="${esc(seller.sellerNameRaw)}">${esc(seller.sellerNameRaw)}</div>
          <div class="match-meta">${Number(seller.rows || 0)} vendas</div>
        </div>
        <div class="match-actions" id="action-${safeId}">
          <span class="state-text is-loading">Verificando…</span>
        </div>
      `;

      matchingList.appendChild(row);

      try {
        const matchRes = await contacts.findMatch(seller.sellerNameRaw);
        const match = matchRes?.ok ? matchRes.data : null;
        const actionDiv = document.getElementById(`action-${safeId}`);
        if (!actionDiv) continue;

        if (match) {
          actionDiv.innerHTML = `
            <div class="match-status-badge">✅ ${esc(match.contactName)}</div>
            <div class="match-status-note">(${esc(match.type)})</div>
          `;

          if (seller.reportId) {
            contacts.linkReport(seller.reportId, match.contactId).catch(() => {});
          }
        } else {
          row.classList.add('unmatched');
          renderUnmatchedActions(actionDiv, seller.sellerNameRaw);
          unmatchedCount++;
        }
      } catch {
        const actionDiv = document.getElementById(`action-${safeId}`);
        if (actionDiv) {
          row.classList.add('unmatched');
          renderUnmatchedActions(actionDiv, seller.sellerNameRaw);
          unmatchedCount++;
        }
      }
    }

    renderSummary(currentSellers.length, unmatchedCount);

    if (unmatchedCount === 0) {
      btnFinish.textContent = 'Continuar';
      showToast('success', 'Todos os vendedores já estão associados.');
    } else {
      btnFinish.textContent = 'Salvar e Continuar';
      showToast('info', `Encontrados ${unmatchedCount} vendedores pendentes de associação.`);
    }
  }

  async function finishMatching() {
    btnFinish.disabled = true;
    btnFinish.textContent = 'Salvando…';

    try {
      if (pendingChanges.size === 0) {
        window.wizardStep3?.show?.();
        return;
      }

      let changed = 0;

      for (const [sellerRaw, change] of pendingChanges.entries()) {
        const sellerObj = currentSellers.find((s) => s.sellerNameRaw === sellerRaw);

        if (change.action === 'IGNORE') {
          changed++;
          continue;
        }

        if (change.action === 'NEW') {
          const created = await contacts.create({
            displayName: sellerRaw,
            aliases: [sellerRaw],
            active: true,
          });

          if (sellerObj?.reportId && created?.ok && created?.data?.id) {
            await contacts.linkReport(sellerObj.reportId, created.data.id);
          }

          changed++;
          continue;
        }

        if (change.action === 'LINK') {
          const contact = allContacts.find((c) => c.id === change.targetId);
          if (!contact) continue;

          const aliases = [...new Set([...(contact.aliases || []), sellerRaw])];
          await contacts.update(contact.id, { aliases });

          if (sellerObj?.reportId) {
            await contacts.linkReport(sellerObj.reportId, contact.id);
          }

          changed++;
        }
      }

      pendingChanges.clear();
      showToast('success', `${changed} alterações salvas.`);
      window.wizardStep3?.show?.();
    } catch (err) {
      console.error('[Step2] finishMatching error', err);
      showToast('error', `Erro ao salvar revisão: ${err?.message || err}`);
    } finally {
      btnFinish.disabled = false;
      btnFinish.textContent = 'Salvar e Continuar';
    }
  }

  function showStep2() {
    document.getElementById('step1-content')?.classList.add('hidden');
    document.getElementById('step3-content')?.classList.add('hidden');
    document.getElementById('step4-content')?.classList.add('hidden');
    document.getElementById('step5-content')?.classList.add('hidden');
    document.getElementById('step6-content')?.classList.add('hidden');
    step2Content?.classList.remove('hidden');
    setWizardStepActive(1);
  }

  btnBack?.addEventListener('click', () => {
    step2Content?.classList.add('hidden');
    step1Content?.classList.remove('hidden');
    setWizardStepActive(0);
  });

  btnFinish?.addEventListener('click', finishMatching);

  window.wizardStep2 = {
    init: initStep2,
    show: showStep2,
  };
})();