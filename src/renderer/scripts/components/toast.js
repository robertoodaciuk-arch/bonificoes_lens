(function () {
  function showToast(kind, text) {
    const root = document.getElementById('toast-root');
    const el = document.createElement('div');
    el.className = `toast toast-${kind}`;
    el.textContent = text;
    root.appendChild(el);

    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      el.style.transition = 'all 0.25s ease';
    }, 2600);

    setTimeout(() => {
      el.remove();
    }, 3000);
  }

  window.uiToast = { showToast };
})();
