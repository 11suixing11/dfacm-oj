'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const bank = require('./source/bank.json');
const core = require('./source/core.cjs');
const root = path.resolve(__dirname, '../../..');
const output = path.join(root, 'qa/pta-oop-2026-11-08/browser');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(root, 'qa/pta-oop-2026-11-08/tools/browsers');
const { chromium } = require(process.env.PTA_PLAYWRIGHT_MODULE || path.join(root, 'qa/pta-oop-2026-11-08/tools/node_modules/playwright-core'));
const executablePath = process.env.PTA_BROWSER;
const html = fs.readFileSync(path.join(__dirname, 'dist/index.html'));
const beforePath = path.join(__dirname, 'audit-2026-11-08/live-before.html');
const before = fs.existsSync(beforePath) ? fs.readFileSync(beforePath) : null;
fs.mkdirSync(output, { recursive: true });

const question = label => bank.questions.find(q => q.label === label);
function state(labels, mode = 'practice', answers = {}) {
  const session = core.createSession(bank.questions, { types: Object.keys(bank.typeCounts), query: '', limit: 'all', mode,
    shuffleQuestions: false, shuffleOptions: true }, labels.map(label => question(label).id), () => 0);
  for (const [label, answer] of Object.entries(answers)) session.answers[question(label).id] = answer;
  return { version: bank.version, session, mistakes: {} };
}

async function main() {
  const server = http.createServer((req, res) => {
    if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(req.url.startsWith('/before') && before ? before : html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-gpu'] });
  const report = { flows: [], layouts: [], errors: [] };
  async function pageFor(saved, options = {}, route = null) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...options });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    if (route) await page.route('**/*', route);
    await page.addInitScript(({ saved, key }) => {
      if (!localStorage.getItem('pta-audit-seeded')) {
        localStorage.setItem(key, JSON.stringify(saved));
        localStorage.setItem('pta-audit-seeded', '1');
      }
    }, { saved, key: 'pta-oop-practice-' + bank.version });
    await page.goto(base + '/practice/pta-oop/', { waitUntil: 'load' });
    return { page, context };
  }
  const choose = (page, id) => page.locator('.option-row').filter({ has: page.locator('input[value="' + id + '"]') }).click();
  const saved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), 'pta-oop-practice-' + bank.version);
  try {
    {
      const { page, context } = await pageFor(state(['1-38']));
      assert.equal(await page.locator('#question-heading').isHidden(), true);
      await page.locator('#mark-review').click();
      assert.match(await page.locator('.nav-question').getAttribute('class'), /is-review/);
      await choose(page, 'true');
      assert.match(await page.locator('#reference-verdict').innerText(), /答对/);
      assert.match(await page.locator('.nav-question').getAttribute('aria-label'), /答对，待复习/);
      await page.locator('#mark-mastered').click();
      assert.match(await page.locator('.nav-question').getAttribute('class'), /is-correct/);
      await choose(page, 'false');
      assert.match(await page.locator('#reference-verdict').innerText(), /答案错误/);
      assert.match(await page.locator('.nav-question').getAttribute('class'), /is-wrong/);
      assert.equal(await page.locator('#mark-mastered').isDisabled(), true);
      const count = (await saved(page)).mistakes[question('1-38').id].count;
      await page.reload({ waitUntil: 'load' });
      assert.match(await page.locator('.nav-question').getAttribute('class'), /is-wrong/);
      assert.equal((await saved(page)).mistakes[question('1-38').id].count, count);
      report.flows.push('screenshot question: deduplication, automatic feedback, mistake book and reload');
      await context.close();
    }
    {
      const { page, context } = await pageFor(state(['2-1']));
      assert.deepEqual(await page.locator('.option-letter').allTextContents(), ['B', 'C', 'D', 'A']);
      await choose(page, 'A');
      assert.match(await page.locator('#reference-verdict').innerText(), /答对/);
      await page.locator('#check-answer').click();
      assert.match(await page.locator('#reference-answer').innerText(), /A\. 构造函数的返回类型只能是void/);
      report.flows.push('shuffled options retain original letters in selection, feedback and reference');
      await context.close();
    }
    {
      const { page, context } = await pageFor(state(['2-5']));
      for (const id of ['B', 'C']) {
        await choose(page, id);
        assert.match(await page.locator('#reference-verdict').innerText(), /答对/);
      }
      await choose(page, 'D');
      assert.match(await page.locator('#reference-verdict').innerText(), /答案错误/);
      report.flows.push('multiple defensible options are accepted; unrelated options fail');
      await context.close();
    }
    {
      const initial = state(['1-35', '1-42'], 'practice', { '1-35': ['true'], '1-42': ['true'] });
      initial.session.results[question('1-35').id] = 'review';
      initial.session.manualReviews[question('1-35').id] = true;
      initial.session.results[question('1-42').id] = 'mastered';
      initial.mistakes[question('1-35').id] = { count: 3, lastWrong: 10 };
      const { page, context } = await pageFor(initial);
      const restored = await saved(page);
      assert.deepEqual(restored.session.answers, initial.session.answers);
      assert.equal(restored.mistakes[question('1-35').id].count, 3);
      assert.match(await page.locator('.nav-question').nth(0).getAttribute('aria-label'), /答对，待复习/);
      assert.match(await page.locator('.nav-question').nth(1).getAttribute('class'), /is-wrong/);
      report.flows.push('existing drafts survive migration and corrected keys replace stale manual grades');
      await context.close();
    }
    {
      const { page, context } = await pageFor(state(['1-35', '1-38', '2-5'], 'exam', { '1-35': ['false'], '1-38': ['true'], '2-5': ['B'] }));
      assert.equal(await page.locator('#reference-verdict').isHidden(), true);
      assert.equal(await page.locator('#reference-actions').isHidden(), true);
      assert.equal(await page.locator('.nav-question.is-correct,.nav-question.is-wrong').count(), 0);
      await page.locator('#finish-button').click();
      await page.locator('#confirm-finish').click();
      assert.equal(await page.locator('#score-number').innerText(), '2 / 3');
      await page.locator('#review-all').click();
      assert.match(await page.locator('.nav-question').nth(0).getAttribute('class'), /is-wrong/);
      assert.match(await page.locator('.nav-question').nth(1).getAttribute('class'), /is-correct/);
      report.flows.push('self-test withholds grades until finish and then scores all completed objective answers');
      await context.close();
    }
    {
      const q = question('6-4');
      let uid = 9, status = 2, submitted = 0;
      const records = new Map();
      const submitCodes = [];
      const route = async route => {
        const url = new URL(route.request().url());
        let body;
        if (url.pathname === '/workbench/data') body = { data: { user: { uid } } };
        else if (url.pathname.endsWith('/submit')) {
          const rid = (++submitted).toString(16).padStart(24, '0');
          submitCodes.push(route.request().postDataJSON().code);
          records.set(rid, { _id: rid, pid: q.judge.docId, uid, status, score: status === 1 ? 100 : 0, time: 12, memory: 1024,
            testCases: Array.from({ length: q.judge.caseCount }, (_, i) => ({ id: i + 1, status, time: 6 })) });
          body = { rid };
        } else if (url.pathname.startsWith('/record/')) body = { rdoc: records.get(url.pathname.split('/').at(-1)) };
        else { await route.continue(); return; }
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
      };
      const { page, context } = await pageFor(state(['6-4'], 'practice', { '6-4': ['@Override\n' + q.reference.code] }), {}, route);
      await page.locator('#submit-judge').click();
      await page.locator('#judge-verdict').filter({ hasText: '答案错误' }).waitFor();
      assert.match(await page.locator('.nav-question').getAttribute('class'), /is-wrong/);
      assert.doesNotMatch(submitCodes[0], /@Override\s*@Override/);
      assert.equal(await page.locator('#mark-mastered').isDisabled(), true);
      await page.reload({ waitUntil: 'load' });
      await page.locator('#judge-verdict').filter({ hasText: '答案错误' }).waitFor();
      assert.match(await page.locator('.nav-question').getAttribute('class'), /is-wrong/);
      status = 1;
      await page.locator('#code-answer').fill(q.reference.code);
      await page.locator('#submit-judge').click();
      await page.locator('#judge-verdict').filter({ hasText: '通过' }).waitFor();
      assert.match(await page.locator('.nav-question').getAttribute('class'), /is-correct/);
      assert.equal((await saved(page)).mistakes[q.id], undefined);
      uid = 10;
      await page.reload({ waitUntil: 'load' });
      await page.locator('#judge-message').filter({ hasText: '当前账号' }).waitFor();
      assert.equal((await saved(page)).session.judges[q.id], undefined);
      assert.doesNotMatch(await page.locator('.nav-question').getAttribute('class'), /is-correct|is-wrong/);
      report.flows.push('mock judge: assembled code, WA/AC persistence, mastery guard, draft edits and account changes');
      await context.close();
    }
    for (const width of [320, 390, 768, 1440]) for (const colorScheme of ['light', 'dark']) {
      const initial = state(['1-38'], 'practice', { '1-38': ['true'] });
      initial.session.revealed[question('1-38').id] = true;
      const { page, context } = await pageFor(initial, { viewport: { width, height: 1000 }, colorScheme });
      const layout = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth,
        duplicateTitleHidden: document.getElementById('question-heading').hidden }));
      assert.ok(layout.scrollWidth <= width + 1, 'horizontal overflow at ' + width + ' ' + colorScheme);
      assert.equal(layout.duplicateTitleHidden, true);
      await page.screenshot({ path: path.join(output, `question-1-38-${width}-${colorScheme}.png`), fullPage: true });
      report.layouts.push({ ...layout, colorScheme });
      if (before && width === 1440 && colorScheme === 'dark') {
        await page.goto(base + '/before', { waitUntil: 'load' });
        assert.equal(await page.locator('#question-heading').isVisible(), true);
        await page.screenshot({ path: path.join(output, 'question-1-38-before.png'), fullPage: true });
      }
      await context.close();
    }
    assert.deepEqual(report.errors, []);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    report.failure = error.stack;
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    throw error;
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
