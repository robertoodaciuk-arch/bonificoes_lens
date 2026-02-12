(function () {
  function formatMoneyFromCents(cents) {
    const n = typeof cents === 'number' ? cents : 0;
    const v = n / 100;
    return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function kpi(label, value) {
    const div = document.createElement('div');
    div.className = 'kpi';
    div.innerHTML = `<div class="kpi-label">${label}</div><div class="kpi-value">${value}</div>`;
    return div;
  }

  function renderTable(sales) {
    const table = document.getElementById('sales-table');
    table.innerHTML = '';

    const cols = [
      { key: 'os', label: 'OS' },
      { key: 'store', label: 'Loja' },
      { key: 'clientName', label: 'Cliente' },
      { key: 'saleDate', label: 'Data' },
      { key: 'saleValueCents', label: 'Venda' },
      { key: 'commissionCents', label: 'Bonificação' },
    ];

    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    for (const c of cols) {
      const th = document.createElement('th');
      th.textContent = c.label;
      trh.appendChild(th);
    }
    thead.appendChild(trh);

    const tbody = document.createElement('tbody');
    for (const row of sales) {
      const tr = document.createElement('tr');
      for (const c of cols) {
        const td = document.createElement('td');
        const val = row[c.key];
        if (c.key === 'saleValueCents' || c.key === 'commissionCents') {
          td.textContent = formatMoneyFromCents(val || 0);
        } else {
          td.textContent = val ? String(val) : '';
        }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }

    table.appendChild(thead);
    table.appendChild(tbody);
  }

  async function waitForFontsAndImages() {
    try {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
    } catch {}

    const images = Array.from(document.images || []);
    await Promise.all(images.map(img => img.complete ? Promise.resolve() : new Promise(res => {
      img.addEventListener('load', res, { once: true });
      img.addEventListener('error', res, { once: true });
    })));
  }

  window.reportApi?.onLoad(async (payload) => {
    const { readyChannel, data } = payload;

    document.getElementById('period').textContent = `Período: ${data.periodRef}`;
    document.getElementById('seller').textContent = `Vendedor: ${data.sellerNameRaw}`;

    const kpis = document.getElementById('kpis');
    kpis.innerHTML = '';
    kpis.appendChild(kpi('Total de Vendas', formatMoneyFromCents(data.totals.salesTotalCents)));
    kpis.appendChild(kpi('Total Bonificação', formatMoneyFromCents(data.totals.commissionTotalCents)));
    kpis.appendChild(kpi('Transações', String(data.totals.txCount)));

    renderTable(data.sales);

    await waitForFontsAndImages();

    // allow layout
    requestAnimationFrame(() => {
      window.reportApi.signalReady(readyChannel);
    });
  });
})();
