const fs = require('fs');
const html = fs.readFileSync('plugin-swpu-regcode/reg.html', 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
scripts.forEach((s, i) => { new Function(s); console.log('script', i, 'syntax OK'); });
for (const k of ['RETURN||', "get('return')", 'RETURN||d.redirect']) console.log(k, '->', html.split(k).length - 1);
const caddy = fs.readFileSync('deploy/Caddyfile.example', 'utf8');
console.log('caddy barelogin ->', caddy.split('@barelogin').length - 1);
const uni = fs.readFileSync('deploy/unify-login-entries.js', 'utf8');
new Function(uni.replace(/^\/\/.*$/gm, '').replace(/const (MARK|BLOCK).*$/s, '')); // only syntax-shape check of top part
console.log('unify script present, marker swpu-login-modal-redirect ->', uni.indexOf('swpu-login-modal-redirect') >= 0);
