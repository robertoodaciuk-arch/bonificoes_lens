(function () {
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normalizeCol(col) {
    return String(col || '')
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function formatMoney(value) {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'number') {
      return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    const asNumber = Number(String(value).replace(/\./g, '').replace(',', '.'));
    if (Number.isFinite(asNumber)) {
      return asNumber.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    return String(value);
  }

  function getOrderedColumns(columns = []) {
    const clean = columns.filter((c) => c && !String(c).startsWith('__'));

    const priority = [
      'LOJA',
      'VENDEDOR',
      'NOME CLIENTE',
      'OS',
      'DATA VENDA',
      'VENDA',
      'AC',
      'TELEFONE',
      'TELEFONE 1',
    ];

    const priorityIndex = new Map(priority.map((p, idx) => [normalizeCol(p), idx]));

    return [...clean].sort((a, b) => {
      const na = normalizeCol(a);
      const nb = normalizeCol(b);

      const ia = priorityIndex.has(na) ? priorityIndex.get(na) : 999;
      const ib = priorityIndex.has(nb) ? priorityIndex.get(nb) : 999;

      if (ia !== ib) return ia - ib;
      return na.localeCompare(nb, 'pt-BR');
    });
  }

  function getCellClass(colName) {
    const normalized = normalizeCol(colName);
    if (normalized === 'VENDA' || normalized === 'AC' || normalized.includes('VALOR')) {
      return 'cell-number cell-money';
    }
    if (normalized.includes('TOTAL') || normalized.includes('QTD') || normalized.includes('QUANT')) {
      return 'cell-number';
    }
    return '';
  }

  function getCellValue(colName, rawValue) {
    const normalized = normalizeCol(colName);

    if (rawValue === null || rawValue === undefined) return '';

    if (normalized === 'VENDA' || normalized === 'AC' || normalized.includes('VALOR')) {
      return formatMoney(rawValue);
    }

    return String(rawValue);
  }

  function renderWarnings(anomalies = []) {
    const el = document.getElementById('warnings');
    if (!el) return;

    if (!anomalies.length) {
      el.innerHTML = `
        <div class="warning-item">
          <div class="warning-title" style="color: var(--success);">✅ Arquivo saudável</div>
          <div class="warning-message">Nenhum problema estrutural crítico encontrado no preview.</div>
        </div>
      `;
      return;
    }

    const html = anomalies.slice(0, 8).map((a) => {
      const severity = a.severity === 'error' ? 'error' : 'warn';
      const title = a.severity === 'error' ? 'Crítico' : 'Alerta';
      return `
        <article class="warning-item is-${severity}">
          <div class="warning-title">${title}</div>
          <div class="warning-message">${escapeHtml(a.message || 'Sem descrição')}</div>
          ${a.rowIndex ? `<div class="warning-meta">Linha: ${escapeHtml(a.rowIndex)}</div>` : ''}
        </article>
      `;
    }).join('');

    el.innerHTML = html;
  }

  function renderInsights(stats) {
    const container = document.getElementById('preview-area');
    if (!container) return;

    let grid = container.querySelector('.insight-grid');
    if (!grid) {
      grid = document.createElement('div');
      grid.className = 'insight-grid animate-in';
      container.prepend(grid);
    }

    grid.innerHTML = `
      <div class="insight-card">
        <div class="insight-label">Vendedores</div>
        <div class="insight-value">${Number(stats?.sellersCount || 0)}</div>
        <div class="insight-trend trend-neutral">Identificados</div>
      </div>
      <div class="insight-card">
        <div class="insight-label">Linhas de dados</div>
        <div class="insight-value">${Number(stats?.dataRows || 0)}</div>
        <div class="insight-trend trend-up">Processadas</div>
      </div>
      <div class="insight-card">
        <div class="insight-label">Ignoradas</div>
        <div class="insight-value">${Number(stats?.ignoredRows || 0)}</div>
        <div class="insight-trend trend-neutral">Totais / vazias</div>
      </div>
    `;
  }

  function renderSellerList(sellers = []) {
    const el = document.getElementById('seller-list');
    if (!el) return;

    if (!sellers.length) {
      el.innerHTML = '<div class="table-empty-state">Nenhum vendedor detectado.</div>';
      return;
    }

    const rows = sellers.slice(0, 12).map((seller) => {
      const firstChar = escapeHtml((seller.sellerNameNorm || '?').charAt(0));
      return `
        <article class="seller-row animate-in">
          <div class="seller-main">
            <div class="seller-avatar">${firstChar}</div>
            <div class="seller-name">${escapeHtml(seller.sellerNameRaw || 'Sem nome')}</div>
          </div>
          <span class="badge-pill">${Number(seller.rows || 0)} vendas</span>
        </article>
      `;
    }).join('');

    el.innerHTML = `<div class="seller-list-wrap">${rows}</div>`;
  }

  function renderPreviewTable(columns = [], rows = []) {
    const container = document.getElementById('preview-table-wrap');
    if (!container) return;

    const orderedCols = getOrderedColumns(columns);
    const visibleRows = Array.isArray(rows) ? rows.slice(0, 120) : [];

    if (!orderedCols.length || !visibleRows.length) {
      container.innerHTML = '<div class="table-empty-state">Sem dados para exibir no preview.</div>';
      return;
    }

    const head = orderedCols
      .map((col) => `<th>${escapeHtml(col)}</th>`)
      .join('');

    const body = visibleRows.map((row, idx) => {
      const cells = orderedCols.map((col) => {
        const cls = getCellClass(col);
        const value = getCellValue(col, row[col]);
        return `<td class="${cls}">${escapeHtml(value)}</td>`;
      }).join('');

      return `<tr><td class="cell-index">${idx + 1}</td>${cells}</tr>`;
    }).join('');

    const previewInfo = rows.length > visibleRows.length
      ? `<div class="table-empty-state" style="text-align:left; padding:8px 12px; border-bottom:1px solid var(--border-subtle); color:var(--text-muted);">Mostrando ${visibleRows.length} de ${rows.length} linhas do preview.</div>`
      : '';

    container.classList.add('modern-table-wrap');
    container.innerHTML = `
      ${previewInfo}
      <table class="modern-table animate-in" id="preview-table">
        <thead>
          <tr>
            <th>#</th>
            ${head}
          </tr>
        </thead>
        <tbody>
          ${body}
        </tbody>
      </table>
    `;

    // Bind search/filter
    bindPreviewSearch();
  }

  function bindPreviewSearch() {
    const searchInput = document.getElementById('preview-search');
    const tableEl = document.getElementById('preview-table');
    if (!searchInput || !tableEl) return;

    searchInput.oninput = () => {
      const term = searchInput.value.trim().toLowerCase();
      const rows = tableEl.querySelectorAll('tbody tr');
      rows.forEach((row) => {
        const text = row.textContent.toLowerCase();
        row.style.display = !term || text.includes(term) ? '' : 'none';
      });
    };
  }

  function renderSkeleton() {
    const warningsEl = document.getElementById('warnings');
    const sellersEl = document.getElementById('seller-list');
    const tableContainer = document.getElementById('preview-table-wrap');

    if (warningsEl) {
      warningsEl.innerHTML = `
        <div class="skeleton-block" style="padding:10px; margin-bottom:8px;">
          <div class="skeleton-line" style="width:42%;"></div>
          <div class="skeleton-line" style="width:88%;"></div>
          <div class="skeleton-line" style="width:64%;"></div>
        </div>
        <div class="skeleton-block" style="padding:10px;">
          <div class="skeleton-line" style="width:38%;"></div>
          <div class="skeleton-line" style="width:82%;"></div>
        </div>
      `;
    }

    if (sellersEl) {
      sellersEl.innerHTML = `
        <div class="skeleton-block" style="padding:10px; margin-bottom:8px;">
          <div class="skeleton-line" style="width:70%;"></div>
          <div class="skeleton-line" style="width:50%;"></div>
        </div>
        <div class="skeleton-block" style="padding:10px;">
          <div class="skeleton-line" style="width:60%;"></div>
          <div class="skeleton-line" style="width:48%;"></div>
        </div>
      `;
    }

    if (tableContainer) {
      tableContainer.innerHTML = `
        <div style="padding:12px;">
          <div class="skeleton-line" style="width:100%; height:16px; margin-bottom:10px;"></div>
          <div class="skeleton-line" style="width:95%;"></div>
          <div class="skeleton-line" style="width:98%;"></div>
          <div class="skeleton-line" style="width:93%;"></div>
          <div class="skeleton-line" style="width:96%;"></div>
        </div>
      `;
    }
  }

  window.wizardStep1 = {
    renderWarnings,
    renderSellerList,
    renderPreviewTable,
    renderInsights,
    renderSkeleton,
    lastPreview: null,
  };
})();