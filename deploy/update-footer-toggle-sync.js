// Upgrade the footer theme-toggle script to also persist the choice into
// localStorage 'swpu-theme', so the static landing page (same origin) follows.
// Usage:
//   mongosh "mongodb://<user>:<pass>@127.0.0.1:27017/hydro" deploy/update-footer-toggle-sync.js
//   pm2 restart hydrooj   // system settings are cached in-process
const NEW = `<script>(function(){var el=document.getElementById('swpu-theme-toggle');if(!el)return;var d=document.documentElement.className.indexOf('theme--dark')>=0;var u=document.querySelector('a[name="nav_logout"]');if(u){el.href=d?'/set_theme/light':'/set_theme/dark';el.textContent=d?'切换到白天模式':'切换到夜间模式';el.addEventListener('click',function(){try{localStorage.setItem('swpu-theme',el.href.indexOf('light')>=0?'light':'dark')}catch(e){}});}else{el.href='/login';}})();</script>`;
const doc = db.system.findOne({ _id: 'ui-default.footer_extra_html' });
if (!doc) { print('ERROR: footer_extra_html missing'); quit(1); }
if (doc.value.indexOf("localStorage.setItem('swpu-theme'") >= 0) {
  print('already synced, skipped');
} else {
  const lines = doc.value.split('\n').map((l) =>
    (l.indexOf("<script>(function(){var el=document.getElementById('swpu-theme-toggle')") === 0) ? NEW : l);
  const replaced = lines.filter((l) => l === NEW).length;
  if (replaced !== 1) { print('ERROR: expected exactly 1 toggle line, found ' + replaced); quit(1); }
  db.system.updateOne({ _id: 'ui-default.footer_extra_html' }, { $set: { value: lines.join('\n') } });
  print('footer toggle synced with landing theme storage');
}
print('=== footer_extra_html ===');
print(db.system.findOne({ _id: 'ui-default.footer_extra_html' }).value);
