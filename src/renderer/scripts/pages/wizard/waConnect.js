(function () {
  const { showToast } = window.uiToast || { showToast: console.log };

  const btn = document.getElementById('btn-wa-connect');
  const img = document.getElementById('wa-qr-img');
  const statusEl = document.getElementById('wa-status');

  if (!btn || !img || !statusEl) return;

  async function refresh() {
    const st = await window.api.wa.getStatus();
    statusEl.textContent = st.isConnected ? 'Conectado' : 'Desconectado';
    if (st.qrDataURL) {
      img.src = st.qrDataURL;
      img.classList.remove('hidden');
    }
  }

  btn.addEventListener('click', async () => {
    try {
      statusEl.textContent = 'Conectando…';
      await window.api.wa.connect();
      showToast('success', 'WhatsApp: aguardando QR / conexão');

      // poll
      const t = setInterval(async () => {
        const st = await window.api.wa.getStatus();
        statusEl.textContent = st.isConnected ? 'Conectado' : 'Aguardando QR';
        if (st.qrDataURL) {
          img.src = st.qrDataURL;
          img.classList.remove('hidden');
        }
        if (st.isConnected) {
          clearInterval(t);
          img.classList.add('hidden');
        }
      }, 1000);
    } catch (e) {
      showToast('error', e?.message || 'Falha ao conectar WhatsApp');
      statusEl.textContent = 'Erro ao conectar';
    }
  });

  refresh().catch(() => {});
})();
