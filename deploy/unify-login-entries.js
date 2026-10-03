// Unify every login entry onto /reg: intercept Hydro's native login modal
// (dialog--signin) the moment it appears and send the user to /reg with a
// return URL, so the site has exactly one login interface.
//
// v2: React hydration may rebuild the .dialog--signin node, so besides
// observing the node itself we rebind via a body-level childList observer.
// Idempotently replaces the v1 block if present.
//
// Usage:
//   mongosh "mongodb://<user>:<pass>@127.0.0.1:27017/hydro" deploy/unify-login-entries.js
//   pm2 restart hydrooj   // system settings are cached in-process
const MARK = 'swpu-login-modal-redirect';
const V2 = `<script>(function(){var sent=false;function jump(){if(sent)return;var d=document.querySelector('.dialog--signin');if(d&&d.style.display!=='none'){sent=true;location.replace('/reg?tab=pwd&return='+encodeURIComponent(location.pathname+location.search))}}function bind(){var d=document.querySelector('.dialog--signin');if(!d||d.__swpuObs)return;d.__swpuObs=true;jump();new MutationObserver(jump).observe(d,{attributes:true,attributeFilter:['style','class']})}bind();new MutationObserver(bind).observe(document.body,{childList:true,subtree:true});})();</script>`;
const doc = db.system.findOne({ _id: 'ui-default.footer_extra_html' });
if (!doc) { print('ERROR: footer_extra_html missing'); quit(1); }
const lines = doc.value.split('\n');
if (lines.some((l) => l.indexOf('__swpuObs') >= 0)) {
  print('modal redirect v2 already installed, skipped');
} else {
  const idx = lines.findIndex((l) => l.startsWith("<script>(function(){var d=document.querySelector('.dialog--signin')"));
  if (idx >= 0) {
    lines[idx] = V2;
    db.system.updateOne({ _id: 'ui-default.footer_extra_html' }, { $set: { value: lines.join('\n') } });
    print('modal redirect upgraded to v2');
  } else {
    db.system.updateOne(
      { _id: 'ui-default.footer_extra_html' },
      { $set: { value: `${doc.value}\n<!-- ${MARK} -->\n${V2}` } },
    );
    print('login modal redirect v2 installed');
  }
}
print('=== footer_extra_html (tail) ===');
const cur = db.system.findOne({ _id: 'ui-default.footer_extra_html' }).value;
print(cur.slice(cur.length - 700));
