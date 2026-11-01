'use strict';
(() => {
  const root = document.documentElement;
  const button = document.getElementById('theme-toggle');
  function apply(dark) {
    root.classList.toggle('dark', dark);
    button.textContent = dark ? '白天模式' : '夜间模式';
    button.setAttribute('aria-label', dark ? '切换到白天模式' : '切换到夜间模式');
  }
  apply(root.classList.contains('dark'));
  button.addEventListener('click', () => {
    const dark = !root.classList.contains('dark');
    apply(dark);
    try { localStorage.setItem('swpu-theme', dark ? 'dark' : 'light'); } catch (_) {}
  });
  window.addEventListener('storage', event => {
    if (event.key === 'swpu-theme') apply(event.newValue === 'dark');
  });
})();
