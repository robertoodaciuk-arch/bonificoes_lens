(function () {
  const { showToast } = window.uiToast || { showToast: console.log };

  // Step 5 elements
  const btn = document.getElementById('btn-wa-connect');
  const btnDisconnect = document.getElementById('btn-wa-disconnect');
  const img = document.getElementById('wa-qr-img');
  const statusEl = document.getElementById('wa-status');

  // Topbar elements
  const waDot = document.getElementById('wa-dot');
  const waLabel = document.getElementById('wa-label');
  const waToggleBtn = document.getElementById('btn-wa-toggle');
  const waToggleIcon = document.getElementById('wa-toggle-icon');

  // Statusbar elements
  const statusbarWa = document.getElementById('statusbar-wa');
  const statusbarWaDot = document.getElementById('statusbar-wa-dot');

  let pollTimer = null;
  let isConnected = false;

  function updateAllStatusIndicators(connected, connecting) {
    isConnected = connected;

    // Step 5 status
    if (statusEl) {
      statusEl.textContent = connected ? 'Conectado' : (connecting ? 'Conectando…' : 'Desconectado');
    }

    // Topbar
    if (waDot) {
      waDot.classList.toggle('connected', connected);
    }
    if (waLabel) {
      waLabel.textContent = connected ? 'Conectado' : (connecting ? 'Conectando…' : 'Desconectado');
    }
    if (waToggleIcon) {
      waToggleIcon.textContent = connected ? '🔌' : '📱';
    }
    if (waToggleBtn) {
      waToggleBtn.title = connected ? 'Desconectar WhatsApp' : 'Conectar WhatsApp';
      waToggleBtn.classList.toggle('is-connected', connected);
    }

    // Statusbar
    if (statusbarWaDot) {
      statusbarWaDot.classList.toggle('connected', connected);
    }
    if (statusbarWa) {
      statusbarWa.innerHTML = `<span class="statusbar-dot${connected ? ' connected' : ''}" id="statusbar-wa-dot"></span> WhatsApp: ${connected ? 'Conectado' : 'Desconectado'}`;
    }

    // Hide QR if connected
    if (connected && img) {
      img.classList.add('hidden');
    }
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(async () => {
      try {
        const st = await window.api.wa.getStatus();
        updateAllStatusIndicators(st.isConnected, st.isConnecting);
        if (st.qrDataURL && !st.isConnected) {
          if (img) {
            img.src = st.qrDataURL;
            img.classList.remove('hidden');
          }
        }
        if (st.isConnected) {
          stopPolling();
        }
      } catch {
        // ignore poll errors
      }
    }, 1500);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function connectWhatsApp() {
    try {
      updateAllStatusIndicators(false, true);
      await window.api.wa.connect();
      showToast('success', 'WhatsApp: aguardando QR / conexão');
      startPolling();
    } catch (e) {
      showToast('error', e?.message || 'Falha ao conectar WhatsApp');
      updateAllStatusIndicators(false, false);
    }
  }

  async function disconnectWhatsApp() {
    try {
      await window.api.wa.logout();
      updateAllStatusIndicators(false, false);
      showToast('success', 'WhatsApp desconectado com sucesso.');
    } catch (e) {
      showToast('error', e?.message || 'Falha ao desconectar WhatsApp');
    }
  }

  async function toggleWhatsApp() {
    if (isConnected) {
      await disconnectWhatsApp();
    } else {
      await connectWhatsApp();
    }
  }

  // Step 5 connect button
  if (btn) {
    btn.addEventListener('click', connectWhatsApp);
  }

  // Step 5 disconnect button
  if (btnDisconnect) {
    btnDisconnect.addEventListener('click', disconnectWhatsApp);
  }

  // Topbar toggle button
  if (waToggleBtn) {
    waToggleBtn.addEventListener('click', toggleWhatsApp);
  }

  // Initial status check
  async function init() {
    try {
      const st = await window.api.wa.getStatus();
      updateAllStatusIndicators(st.isConnected, st.isConnecting);
    } catch {
      // ignore
    }
  }

  init();

  // Expose for other modules
  window.waConnect = {
    connect: connectWhatsApp,
    disconnect: disconnectWhatsApp,
    toggle: toggleWhatsApp,
    isConnected: () => isConnected,
  };
})();
