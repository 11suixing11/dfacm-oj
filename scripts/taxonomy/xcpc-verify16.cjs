// Served-page assertions for the 16 XCPC statements repaired on 2026-10-05/06.
// Collected into the repository on 2026-10-11 because the repair never made it into
// CHANGELOG.md, and the 2026-10-08 audit therefore saw the repaired pages, called the
// class harmless, and left the applied payload looking unapplied.
//
// Run on the OJ server, after any change to these statements:
//   node xcpc-verify16.cjs
// Exits non-zero if any problem fails. Requires the site to answer on 127.0.0.1.
const { execSync } = require('child_process');
const fs = require('fs');

const IDS = [2, 3, 5, 631, 632, 642, 645, 646, 681, 688, 696, 753, 776, 798, 805, 827];
const PAYLOAD = '/root/xcpc-fix/fixed';

let pass = 0;
let fail = 0;
for (const id of IDS) {
  const html = execSync(
    `curl -s --max-time 20 --resolve swpuacm.xyz:443:127.0.0.1 https://swpuacm.xyz/p/${id}`,
  ).toString();
  // window.UiContextNew re-embeds the statement as JSON; cut it off before asserting.
  const cut = html.indexOf('window.UiContextNew');
  const body = cut > 0 ? html.slice(0, cut) : html;

  const checks = {
    http200: html.length > 5000,
    katexRendered: body.includes('class="katex-html"'),
    noEscapedKatex: !body.includes('&lt;span class=&quot;katex&quot;'),
    noEmptyClassSpan: !body.includes('<span class>'),
    sampleBlock: body.includes('language-input1'),
    noLiteralDollar: !body.includes('$'),
    noKatexError: !body.includes('katex-error'),
  };
  if (id === 5) checks.readable5 = body.includes('某工厂收到了');
  if (id === 696) checks.noTypo696 = !body.includes('选择了是');

  // Informational only: the repair payload lives outside the repository (Desktop/swpuoj/
  // xcpc-fix) and only the .txt half was pushed to /root/xcpc-fix/fixed, so its presence
  // is not a served-page assertion. The checks above already catch a silent re-import.
  const inRepoPayload = fs.existsSync(`${PAYLOAD}/${id}.txt`);
  if (!inRepoPayload && process.env.XCPC_QUIET !== '1') console.log(`  note: no repair payload on this host for #${id}`);

  const bad = Object.keys(checks).filter((k) => !checks[k]);
  if (bad.length === 0) { pass++; console.log('PASS', id); } else { fail++; console.log('FAIL', id, JSON.stringify(bad)); }
}
console.log('SUMMARY pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
