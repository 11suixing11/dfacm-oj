// Restore Hydro's native light default and append the footer theme toggle.
// Usage:
//   mongosh "mongodb://<user>:<pass>@127.0.0.1:27017/hydro" deploy/set-theme-light.js
//   pm2 restart hydrooj   // settings are cached in-process
print('=== before ===');
printjson(db.system.findOne({ _id: 'preference.theme' }));

// 1. Set only the system default; do not depend on a modified ui-default package.
db.system.updateOne({ _id: 'preference.theme' }, { $set: { value: 'light' } }, { upsert: true });

// 2. Keep every user's explicit preference. Changing the site default must not
//    erase choices made after an earlier migration or on repeated deployment.

// 3. Append the one-click footer toggle (idempotent via swpu-theme-toggle marker).
//    Signed-in users toggle via /set_theme/:theme (redirects back, PRIV_USER_PROFILE guarded);
//    guests are pointed at /login instead of the shared Guest profile.
const block = [
  '<a id="swpu-theme-toggle" href="/home/settings/preference" title="theme">白天 / 夜间</a>',
  `<script>(function(){var el=document.getElementById('swpu-theme-toggle');if(!el)return;var d=document.documentElement.className.indexOf('theme--dark')>=0;var u=document.querySelector('a[name="nav_logout"]');if(u){el.href=d?'/set_theme/light':'/set_theme/dark';el.textContent=d?'切换到白天模式':'切换到夜间模式';}else{el.href='/login';}})();</script>`,
].join('\n');
const cur = db.system.findOne({ _id: 'ui-default.footer_extra_html' });
const currentHtml = typeof cur?.value === 'string' ? cur.value : '';
if (currentHtml.indexOf('swpu-theme-toggle') < 0) {
  db.system.updateOne(
    { _id: 'ui-default.footer_extra_html' },
    { $set: { value: currentHtml ? `${currentHtml}\n${block}` : block } },
    { upsert: true },
  );
  print('footer toggle appended');
} else {
  print('footer toggle already present, skipped');
}

print('=== after ===');
printjson(db.system.findOne({ _id: 'preference.theme' }));
print('=== footer_extra_html ===');
print(db.system.findOne({ _id: 'ui-default.footer_extra_html' }).value);
