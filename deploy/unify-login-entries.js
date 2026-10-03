// Unify every login entry onto /reg: intercept Hydro's native login modal
// (dialog--signin) the moment it appears and send the user to /reg with a
// return URL, so the site has exactly one login interface.
// Usage:
//   mongosh "mongodb://<user>:<pass>@127.0.0.1:27017/hydro" deploy/unify-login-entries.js
//   pm2 restart hydrooj   // system settings are cached in-process
const MARK = 'swpu-login-modal-redirect';
const BLOCK = `<script>(function(){var d=document.querySelector('.dialog--signin');if(!d)return;var sent=false;new MutationObserver(function(){if(!sent&&d.style.display!=='none'){sent=true;location.replace('/reg?tab=pwd&return='+encodeURIComponent(location.pathname+location.search))}}).observe(d,{attributes:true,attributeFilter:['style','class']});})();</script>`;
const doc = db.system.findOne({ _id: 'ui-default.footer_extra_html' });
if (!doc) { print('ERROR: footer_extra_html missing'); quit(1); }
if (doc.value.indexOf(MARK) >= 0) {
  print('modal redirect already installed, skipped');
} else {
  // the marker lives in a comment so it never runs in the browser
  db.system.updateOne(
    { _id: 'ui-default.footer_extra_html' },
    { $set: { value: `${doc.value}\n<!-- ${MARK} -->\n${BLOCK}` } },
  );
  print('login modal redirect installed');
}
print('=== footer_extra_html ===');
print(db.system.findOne({ _id: 'ui-default.footer_extra_html' }).value);
