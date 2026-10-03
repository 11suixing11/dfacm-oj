// Clean auth entries: point every login/register link at the branded /reg page
// and give the native signin modal a mail-code login link — WITHOUT any forced
// navigation. This replaces the earlier modal-redirect hijack (v1/v2): the
// modal now stays in place, gets branded by the theme CSS, and password login
// completes on the current page.
//
// IMPORTANT: Hydro renders footer_extra_html line-by-line inside <ol> items, so
// a multi-line <script> gets shredded into inert text. Every script installed
// here must stay on ONE line. (The historical multi-line /login banner script
// never executed for exactly this reason; this script also removes its remains
// and reinstalls the same feature as a single line.)
//
// The script is idempotent: rerunning removes the old hijack blocks first and
// installs at most one clean block.
//
// Usage:
//   mongosh "mongodb://<user>:<pass>@127.0.0.1:27017/hydro" deploy/clean-auth-entries.js
//   pm2 restart hydrooj   // system settings are cached in-process
const MARK = 'swpu-clean-auth';
// One line, no navigation: header/dialog links are corrected (a normal link
// click), the signin dialog gains a mail-code link that carries a return path,
// and the native /login page (query-carrying hits only) keeps its mail-code
// entry link.
const CLEAN = `<script>/* ${MARK} */(function(){function fixLinks(root){var ls=(root||document).querySelectorAll('a[href="/login"]');for(var i=0;i<ls.length;i++)ls[i].setAttribute('href','/reg?tab=pwd');var rs=(root||document).querySelectorAll('a[href="/register"]');for(var j=0;j<rs.length;j++)rs[j].setAttribute('href','/reg')}function enhance(d){if(!d||d.__swpuClean)return;d.__swpuClean=true;fixLinks(d);var f=d.querySelector('.dialog--signin__main form');if(f&&!document.getElementById('swpu-dialog-code')){var a=document.createElement('a');a.id='swpu-dialog-code';a.href='/reg?tab=login&return='+encodeURIComponent(location.pathname+location.search);a.textContent='使用邮箱验证码登录 →';f.appendChild(a)}}function scan(){fixLinks(document);enhance(document.querySelector('.dialog--signin'))}var pending=false;function schedule(){if(pending)return;pending=true;setTimeout(function(){pending=false;scan()},200)}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan);else scan();new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});if(location.pathname==='/login'){var n=0,t=setInterval(function(){var form=document.querySelector('.immersive--content form');n++;if(form||n>20){clearInterval(t);if(form&&!document.getElementById('swpu-codelogin')){var m=location.search.match(/[?&]redirect=([^&]+)/);var a=document.createElement('a');a.id='swpu-codelogin';a.className='swpu-codelogin';a.href='/reg?tab=login&return='+encodeURIComponent(m?decodeURIComponent(m[1]):location.pathname);a.textContent='使用邮箱验证码登录 →';a.style.cssText='display:block;text-align:center;margin-top:14px;font-size:14px;text-decoration:none';form.appendChild(a)}}},300)}})();</script>`;
const doc = db.system.findOne({ _id: 'ui-default.footer_extra_html' });
if (!doc) { print('ERROR: footer_extra_html missing'); quit(1); }
const HIJACK_SIGNATURES = [
  'swpu-login-modal-redirect', // v1/v2 marker comment
  '__swpuObs',                 // v2 observer/hijack script
  "location.replace('/reg",    // any variant that force-navigates to /reg
];
const lines = doc.value.split('\n');
const out = [];
for (let i = 0; i < lines.length; i++) {
  // Shredded multi-line <script> blocks are inert; drop the known /login one.
  if (lines[i].trim() === '<script>') {
    let j = i + 1;
    while (j < lines.length && lines[j].trim() !== '</script>') j++;
    if (j < lines.length && lines.slice(i, j + 1).join('\n').indexOf('swpu-codelogin') >= 0) {
      print('removing broken multi-line /login block (' + (j + 1 - i) + ' lines)');
      i = j;
      continue;
    }
  }
  const hit = HIJACK_SIGNATURES.some((sig) => lines[i].indexOf(sig) >= 0);
  if (hit) print('removing hijack line: ' + lines[i].slice(0, 80) + '…');
  else out.push(lines[i]);
}
let value = out.join('\n');
if (value.indexOf(MARK) >= 0) {
  // Replace an earlier clean block (single line) with the current one.
  value = value.split('\n').filter((line) => line.indexOf(MARK) < 0).join('\n');
}
value = `${value}\n<!-- ${MARK} -->\n${CLEAN}`;
db.system.updateOne({ _id: 'ui-default.footer_extra_html' }, { $set: { value } });
print('clean auth entries installed');
print('=== footer_extra_html (tail) ===');
const cur = db.system.findOne({ _id: 'ui-default.footer_extra_html' }).value;
print(cur.slice(cur.length - 600));
