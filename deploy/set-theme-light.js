// Restore Hydro's native light default and append the footer theme toggle.
// Usage:
//   mongosh "mongodb://<user>:<pass>@127.0.0.1:27017/hydro" deploy/set-theme-light.js
//   pm2 restart hydrooj   // settings are cached in-process
print('=== before ===');
printjson(db.system.findOne({ _id: 'preference.theme' }));
printjson(db.user.find({}, { uname: 1, theme: 1 }).toArray());

// 1. Drop the system-wide forced dark preference; the ui-default code default ('light') takes over.
db.system.deleteOne({ _id: 'preference.theme' });

// 2. Clear per-user forced themes so everyone follows the default again.
db.user.updateMany({ theme: { $exists: true } }, { $unset: { theme: '' } });

// 3. Append the one-click footer toggle (idempotent via swpu-theme-toggle marker).
//    Signed-in users toggle via /set_theme/:theme (redirects back, PRIV_USER_PROFILE guarded);
//    guests are pointed at /login instead of the shared Guest profile.
const block = [
  '<a id="swpu-theme-toggle" href="/home/settings/preference" title="theme">白天 / 夜间</a>',
  `<script>(function(){var el=document.getElementById('swpu-theme-toggle');if(!el)return;var d=document.documentElement.className.indexOf('theme--dark')>=0;var u=document.querySelector('a[name="nav_logout"]');if(u){el.href=d?'/set_theme/light':'/set_theme/dark';el.textContent=d?'切换到白天模式':'切换到夜间模式';}else{el.href='/login';}})();</script>`,
].join('\n');
const cur = db.system.findOne({ _id: 'ui-default.footer_extra_html' });
if (cur && cur.value.indexOf('swpu-theme-toggle') < 0) {
  db.system.updateOne(
    { _id: 'ui-default.footer_extra_html' },
    { $set: { value: `${cur.value}\n${block}` } },
  );
  print('footer toggle appended');
} else {
  print('footer toggle already present, skipped');
}

print('=== after ===');
printjson(db.user.find({}, { uname: 1, theme: 1 }).toArray());
print('=== footer_extra_html ===');
print(db.system.findOne({ _id: 'ui-default.footer_extra_html' }).value);
