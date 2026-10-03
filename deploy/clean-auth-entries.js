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
//
// The overlay has three states. Loading: visible from the very first frame,
// with a close ✕ and a "直接打开登录页" link so nobody waits on a blank box.
// Error (10s timeout or iframe failure): the same escape routes. Revealed: the
// /reg card itself, which carries its own in-card ✕ (the shell ✕ is hidden to
// avoid doubling it). The direct link opens the TOP-LEVEL /reg WITHOUT the
// embed flag: with embed=1 the top-level page would boot in iframe mode, where
// the in-card ✕ and the success postMessage have no host to talk to. The
// iframe is only revealed when a /reg-specific marker (#tab-reg) is present,
// so a Caddy/Hydro error page served at the same URL cannot pose as the login
// card.
const CLEAN = [
  `<script>/* ${MARK} */(function(){`,
  `function fixLinks(root){var ls=(root||document).querySelectorAll('a[href="/login"]');for(var i=0;i<ls.length;i++)ls[i].setAttribute('href','/reg?tab=pwd');var rs=(root||document).querySelectorAll('a[href="/register"]');for(var j=0;j<rs.length;j++)rs[j].setAttribute('href','/reg')}`,
  `var overlay=null,loadTimer=null;function closeAuth(){if(loadTimer){clearTimeout(loadTimer);loadTimer=null}if(overlay){overlay.style.display='none';overlay.setAttribute('aria-hidden','true')}}`,
  `function frameReady(f){try{var d=f.contentDocument;return !!(d&&String(d.URL||'').indexOf('/reg')>=0&&d.getElementById('tab-reg'))}catch(e){return false}}`,
  `function revealFrame(){var f=overlay.querySelector('iframe'),loading=overlay.querySelector('#swpu-auth-loading'),error=overlay.querySelector('#swpu-auth-error'),x=overlay.querySelector('#swpu-auth-close');if(loadTimer){clearTimeout(loadTimer);loadTimer=null}loading.style.display='none';error.style.display='none';x.style.display='none';f.style.opacity='1';f.style.visibility='visible'}`,
  `function failFrame(){var f=overlay.querySelector('iframe'),loading=overlay.querySelector('#swpu-auth-loading'),error=overlay.querySelector('#swpu-auth-error'),x=overlay.querySelector('#swpu-auth-close');if(loadTimer){clearTimeout(loadTimer);loadTimer=null}loading.style.display='none';error.style.display='flex';x.style.display='flex';f.style.opacity='0';f.style.visibility='hidden'}`,
  `function openAuth(){var url='/reg?embed=1&tab=pwd&return='+encodeURIComponent(location.pathname+location.search);var topUrl='/reg?tab=pwd&return='+encodeURIComponent(location.pathname+location.search);if(!overlay){overlay=document.createElement('div');overlay.id='swpu-auth-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','登录 / 注册');overlay.setAttribute('aria-hidden','true');overlay.style.cssText='position:fixed;inset:0;z-index:10000;background:rgba(7,13,24,.62);display:none;align-items:center;justify-content:center;padding:16px';var shell=document.createElement('div');shell.id='swpu-auth-shell';shell.style.cssText='position:relative;width:min(520px,100%);height:min(780px,94vh);overflow:hidden;border-radius:18px;box-shadow:0 30px 90px rgba(2,6,14,.55);background:#070d18';var f=document.createElement('iframe');f.id='swpu-auth-frame';f.title='登录 / 注册';f.style.cssText='display:block;width:100%;height:100%;border:0;background:#070d18;opacity:0;visibility:hidden;transition:opacity .15s ease';f.addEventListener('load',function(){if(frameReady(f))revealFrame()});f.addEventListener('error',failFrame);var loading=document.createElement('div');loading.id='swpu-auth-loading';loading.setAttribute('role','status');loading.style.cssText='position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;color:#a7b4c7;font:14px/1.7 system-ui,-apple-system,"Microsoft YaHei",sans-serif';var lnote=document.createElement('p');lnote.textContent='登录页面加载中…';var direct=document.createElement('a');direct.id='swpu-auth-direct';direct.target='_top';direct.rel='noopener';direct.textContent='直接打开登录页';direct.style.cssText='display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 16px;border:1px solid rgba(233,196,85,.45);border-radius:10px;color:#e9c455;text-decoration:none';loading.appendChild(lnote);loading.appendChild(direct);var error=document.createElement('div');error.id='swpu-auth-error';error.setAttribute('role','alert');error.style.cssText='position:absolute;inset:0;z-index:3;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;color:#e8edf5;font:14px/1.7 system-ui,-apple-system,"Microsoft YaHei",sans-serif';var note=document.createElement('p');note.textContent='登录页面加载较慢，请稍后重试。';var fallback=document.createElement('a');fallback.id='swpu-auth-fallback';fallback.target='_top';fallback.rel='noopener';fallback.textContent='直接打开登录页';fallback.style.cssText='display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 16px;border:1px solid rgba(233,196,85,.45);border-radius:10px;color:#e9c455;text-decoration:none';error.appendChild(note);error.appendChild(fallback);var x=document.createElement('button');x.type='button';x.id='swpu-auth-close';x.setAttribute('aria-label','关闭登录窗口');x.title='关闭 (Esc)';x.textContent='✕';x.style.cssText='position:absolute;top:10px;right:10px;z-index:5;width:34px;height:34px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(198,216,240,.18);border-radius:10px;background:rgba(7,13,24,.55);color:#a7b4c7;font-size:15px;line-height:1;cursor:pointer';x.addEventListener('click',closeAuth);shell.appendChild(f);shell.appendChild(loading);shell.appendChild(error);shell.appendChild(x);overlay.appendChild(shell);overlay.addEventListener('click',function(e){if(e.target===overlay)closeAuth()});document.addEventListener('keydown',function(e){if(e.key==='Escape')closeAuth()});document.body.appendChild(overlay)}var f=overlay.querySelector('iframe'),loading=overlay.querySelector('#swpu-auth-loading'),error=overlay.querySelector('#swpu-auth-error'),fallback=overlay.querySelector('#swpu-auth-fallback'),direct=overlay.querySelector('#swpu-auth-direct'),x=overlay.querySelector('#swpu-auth-close');fallback.href=topUrl;direct.href=topUrl;overlay.style.display='flex';overlay.setAttribute('aria-hidden','false');if(f.getAttribute('src')!==url||!frameReady(f)){if(loadTimer)clearTimeout(loadTimer);loading.style.display='flex';error.style.display='none';x.style.display='flex';f.style.opacity='0';f.style.visibility='hidden';loadTimer=setTimeout(failFrame,10000);if(f.getAttribute('src')!==url)f.setAttribute('src',url)}else revealFrame()}`,
  `function hookShow(){if(typeof window.showSignInDialog==='function'&&!window.showSignInDialog.__swpuHooked){var hooked=function(){openAuth()};hooked.__swpuHooked=true;try{window.showSignInDialog=hooked}catch(e){}}}`,
  `window.addEventListener('message',function(e){if(e.origin!==location.origin)return;var d=e.data||{};if(d.type==='swpu-auth-close')closeAuth();if(d.type==='swpu-auth-success'&&typeof d.return==='string'&&d.return.charAt(0)==='/'&&d.return.charAt(1)!=='/'&&d.return.indexOf('\\\\')<0){closeAuth();location.href=d.return}});document.addEventListener('click',function(e){if(e.button!==0||e.defaultPrevented)return;var t=e.target&&e.target.closest?e.target.closest('[name=nav_login]'):null;if(!t)return;e.preventDefault();e.stopPropagation();openAuth()},true);`,
  `function scan(){hookShow();fixLinks(document);var nd=document.querySelector('.dialog--signin');if(nd&&nd.style.display&&nd.style.display!=='none'){nd.style.display='none';openAuth()}}var pending=false;function schedule(){if(pending)return;pending=true;setTimeout(function(){pending=false;scan()},150)}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan);else scan();new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class']});`,
  `if(location.pathname==='/login'){var n=0,t=setInterval(function(){var form=document.querySelector('.immersive--content form');n++;if(form||n>20){clearInterval(t);if(form&&!document.getElementById('swpu-codelogin')){var m=location.search.match(/[?&]redirect=([^&]+)/);var a=document.createElement('a');a.id='swpu-codelogin';a.className='swpu-codelogin';a.href='/reg?tab=login&return='+encodeURIComponent(m?decodeURIComponent(m[1]):location.pathname);a.textContent='使用邮箱验证码登录 →';a.style.cssText='display:block;text-align:center;margin-top:14px;font-size:14px;text-decoration:none';form.appendChild(a)}}},300)}})();</script>`,
].join('');
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
