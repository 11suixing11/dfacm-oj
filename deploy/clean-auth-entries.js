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
// One line, no navigation: the global showSignInDialog() — Hydro's single
// choke point for every login-required action and the header 登录 button — is
// replaced with our own overlay that embeds the branded /reg page (same-origin
// iframe). The native dialog is a fallback target: if it ever becomes visible
// (hook not yet applied), it is hidden and the branded overlay opened instead.
// Auth success/close travel via postMessage from the embedded page.
const CLEAN = `<script>/* ${MARK} */(function(){function fixLinks(root){var ls=(root||document).querySelectorAll('a[href="/login"]');for(var i=0;i<ls.length;i++)ls[i].setAttribute('href','/reg?tab=pwd');var rs=(root||document).querySelectorAll('a[href="/register"]');for(var j=0;j<rs.length;j++)rs[j].setAttribute('href','/reg')}var overlay=null;function closeAuth(){if(overlay)overlay.style.display='none'}function openAuth(){if(!overlay){overlay=document.createElement('div');overlay.id='swpu-auth-overlay';overlay.style.cssText='position:fixed;inset:0;z-index:10000;background:rgba(7,13,24,.62);display:flex;align-items:center;justify-content:center;padding:16px';var f=document.createElement('iframe');f.id='swpu-auth-frame';f.title='登录 / 注册';f.style.cssText='width:min(520px,100%);height:min(780px,94vh);border:0;border-radius:18px;box-shadow:0 30px 90px rgba(2,6,14,.55);background:#070d18';overlay.appendChild(f);overlay.addEventListener('click',function(e){if(e.target===overlay)closeAuth()});document.addEventListener('keydown',function(e){if(e.key==='Escape')closeAuth()});document.body.appendChild(overlay)}var f=overlay.querySelector('iframe');f.src='/reg?embed=1&tab=pwd&return='+encodeURIComponent(location.pathname+location.search);overlay.style.display='flex'}function hookShow(){if(typeof window.showSignInDialog==='function'&&!window.showSignInDialog.__swpuHooked){var hooked=function(){openAuth()};hooked.__swpuHooked=true;try{window.showSignInDialog=hooked}catch(e){}}}window.addEventListener('message',function(e){if(e.origin!==location.origin)return;var d=e.data||{};if(d.type==='swpu-auth-close')closeAuth();if(d.type==='swpu-auth-success'&&typeof d.return==='string'&&d.return.charAt(0)==='/'&&d.return.charAt(1)!=='/'&&d.return.indexOf('\\\\')<0){closeAuth();location.href=d.return}});document.addEventListener('click',function(e){if(e.button!==0||e.defaultPrevented)return;var t=e.target&&e.target.closest?e.target.closest('[name=nav_login]'):null;if(!t)return;e.preventDefault();e.stopPropagation();openAuth()},true);function scan(){hookShow();fixLinks(document);var nd=document.querySelector('.dialog--signin');if(nd&&nd.style.display&&nd.style.display!=='none'){nd.style.display='none';openAuth()}}var pending=false;function schedule(){if(pending)return;pending=true;setTimeout(function(){pending=false;scan()},150)}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan);else scan();new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class']});if(location.pathname==='/login'){var n=0,t=setInterval(function(){var form=document.querySelector('.immersive--content form');n++;if(form||n>20){clearInterval(t);if(form&&!document.getElementById('swpu-codelogin')){var m=location.search.match(/[?&]redirect=([^&]+)/);var a=document.createElement('a');a.id='swpu-codelogin';a.className='swpu-codelogin';a.href='/reg?tab=login&return='+encodeURIComponent(m?decodeURIComponent(m[1]):location.pathname);a.textContent='使用邮箱验证码登录 →';a.style.cssText='display:block;text-align:center;margin-top:14px;font-size:14px;text-decoration:none';form.appendChild(a)}}},300)}})();</script>`;
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
