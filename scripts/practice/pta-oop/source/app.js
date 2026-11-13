(function () {
  'use strict';
  const bank = JSON.parse(document.getElementById('question-bank').textContent);
  const core = window.PtaPracticeCore;
  const lookup = new Map(bank.questions.map(question => [question.id, question]));
  const storageKey = 'pta-oop-practice-' + bank.version;
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  let session = null;
  let mistakes = {};
  let currentView = 'setup';
  let storageAvailable = true;
  let toastTimer;
  let judgeGeneration = 0;
  let judgeAbort;
  let judgeTimer;
  let judgeSubmitting = false;
  const judgeCache = new Map();
  const pendingStatuses = new Set([0, 20, 21, 22, 23, 24, 25]);
  const failedStatuses = new Set([2, 3, 4, 5, 6, 7]);
  const statusNames = { 0: '等待评测', 1: '通过', 2: '答案错误', 3: '运行超时', 4: '内存超限', 5: '输出超限', 6: '运行错误', 7: '编译错误', 8: '系统错误', 9: '已取消', 20: '正在编译', 21: '正在运行', 22: '正在判题', 23: '正在读取测试数据', 24: '正在取回结果', 25: '等待结果' };

  function load() {
    try {
      const value = localStorage.getItem(storageKey);
      if (!value) return;
      ({ session, mistakes } = core.restore(JSON.parse(value), bank));
    } catch (error) {
      if (!(error instanceof SyntaxError)) storageAvailable = false;
    }
  }

  function save() {
    if (!storageAvailable) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ version: bank.version, session, mistakes }));
    } catch (_) {
      storageAvailable = false;
      $('storage-message').hidden = false;
    }
  }

  function toast(message) {
    $('toast').textContent = message;
    $('toast').hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { $('toast').hidden = true; }, 3000);
  }

  function show(view, scroll = true) {
    if (view !== 'quiz') stopJudgeRead();
    currentView = view;
    for (const name of ['setup', 'quiz', 'results', 'mistakes']) $(name + '-view').hidden = name !== view;
    $('mistake-count').textContent = String(Object.keys(mistakes).length);
    if (scroll) window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function config() {
    return {
      types: [...document.querySelectorAll('input[name="type"]:checked')].map(input => input.value),
      query: $('question-search').value.trim(), limit: $('question-limit').value,
      mode: document.querySelector('input[name="mode"]:checked').value,
      shuffleQuestions: $('shuffle-questions').checked, shuffleOptions: $('shuffle-options').checked,
    };
  }

  function updatePool() {
    const settings = config();
    const available = core.pool(bank.questions, settings).length;
    const amount = settings.limit === 'all' ? available : Math.min(available, Number(settings.limit));
    const action = settings.shuffleQuestions ? '随机抽取' : '顺序练习';
    $('pool-description').textContent = available ? `已选 ${available} 题，本轮${settings.limit === 'all' ? '练习全部' : action} ${amount} 题` : '当前范围没有题目，请调整题型或关键词';
    $('start-button').disabled = !available;
  }

  function setup() {
    $('resume-banner').hidden = !session || session.done;
    if (session && !session.done) {
      const answered = session.ids.filter(id => core.complete(lookup.get(id), session.answers[id])).length;
      $('resume-description').textContent = `${session.config.mode === 'exam' ? '自测模式' : '逐题练习'} · 已答 ${answered} / ${session.ids.length} 题`;
    }
    updatePool();
    show('setup');
  }

  function start(settings = config(), forcedIds = null) {
    const round = core.createSession(bank.questions, settings, forcedIds);
    if (!round) { toast('当前范围没有可练习的题目'); return; }
    session = round;
    save();
    renderQuestion();
    show('quiz');
  }

  function currentQuestion() { return lookup.get(session.ids[session.index]); }
  function orderedOptions(question) { return session.options[question.id].map(id => question.options.find(option => option.id === id)); }

  function stopJudgeRead() {
    judgeGeneration += 1;
    judgeAbort?.abort();
    window.clearTimeout(judgeTimer);
  }

  async function judgeJson(url, options = {}) {
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store',
      ...options, headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...options.headers } });
    if (response.redirected && /\/login(?:\?|$)/.test(new URL(response.url).pathname + new URL(response.url).search)) {
      const error = new Error('请登录网站后提交判题，草稿已经保留。');
      error.loginRequired = true;
      throw error;
    }
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const error = new Error('请登录网站后提交判题，草稿已经保留。');
      error.loginRequired = true;
      throw error;
    }
    const body = await response.json();
    if (typeof body.url === 'string' && /^\/login(?:\?|$)/.test(body.url)) {
      const error = new Error('请登录网站后提交判题，草稿已经保留。');
      error.loginRequired = true;
      throw error;
    }
    if (!response.ok || body.error) throw new Error(body.error?.message || body.message || '判题请求失败，请稍后重试。');
    return body;
  }

  function judgeTexts(value) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(judgeTexts).filter(Boolean).join('\n');
    if (value && typeof value.message === 'string') return value.message + (value.params?.length ? ' ' + value.params.join(' ') : '');
    return '';
  }

  function showJudgeRecord(q, entry, record) {
    if (!session || currentQuestion().id !== q.id || entry.answerKey !== JSON.stringify(session.answers[q.id])) return;
    const status = record.status;
    const previousStatus = entry.status;
    entry.status = status;
    if (session.judges[q.id]?.rid === entry.rid) session.judges[q.id].status = status;
    $('judge-result').hidden = false;
    $('judge-result').className = 'judge-result' + (status === 1 ? ' is-accepted' : failedStatuses.has(status) ? ' is-failed' : '');
    $('judge-verdict').textContent = statusNames[status] || '评测状态 ' + status;
    const cases = Array.isArray(record.testCases) ? record.testCases : [];
    const accepted = cases.filter(c => c.status === 1).length;
    $('judge-statistics').textContent = pendingStatuses.has(status) ? '提交已收到，正在处理。'
      : `得分 ${record.score || 0} / 100 · 测试点 ${accepted} / ${q.judge.caseCount} · 用时 ${Math.round(record.time || 0)} ms · 内存 ${((record.memory || 0) / 1024).toFixed(1)} MB`;
    const diagnostics = judgeTexts(record.compilerTexts) + (record.judgeTexts?.length ? '\n' + judgeTexts(record.judgeTexts) : '');
    $('judge-diagnostics').hidden = !diagnostics.trim();
    $('judge-diagnostics').textContent = diagnostics.slice(0, 100000);
    $('judge-cases').replaceChildren();
    for (const c of cases.slice(0, 30)) {
      const row = document.createElement('div');
      row.className = 'judge-case';
      row.textContent = `测试点 ${c.id}：${statusNames[c.status] || c.status} · ${Math.round(c.time || 0)} ms` + (c.message ? '\n' + judgeTexts(c.message) : '');
      $('judge-cases').appendChild(row);
    }
    const active = pendingStatuses.has(status);
    if (active && session.results[q.id] === 'mastered') delete session.results[q.id];
    $('mark-mastered').disabled = active || failedStatuses.has(status);
    $('refresh-judge').hidden = false;
    $('submit-judge').disabled = active || judgeSubmitting;
    $('submit-judge').textContent = active ? '正在判题…' : '再次提交判题';
    $('judge-record').hidden = false;
    $('judge-record').href = '/record/' + entry.rid;
    if (!active && (!entry.applied || previousStatus !== status)) {
      entry.applied = true;
      if (session.judges[q.id]?.rid === entry.rid) session.judges[q.id].applied = true;
      if (status === 1) {
        if (session.results[q.id] !== 'review') delete mistakes[q.id];
        session.results[q.id] = session.results[q.id] === 'review' ? 'review' : 'mastered';
      } else if (failedStatuses.has(status)) {
        if (session.results[q.id] === 'mastered') delete session.results[q.id];
        mistakes[q.id] = { count: (mistakes[q.id]?.count || 0) + 1, lastWrong: Date.now() };
      }
      save();
      renderNavigation();
      $('mark-mastered').setAttribute('aria-pressed', String(session.results[q.id] === 'mastered'));
    }
    save();
    renderNavigation();
  }

  function verifyJudgeUser(uid) {
    if (!Number.isInteger(uid) || uid <= 0) throw new Error('请登录网站后提交判题。');
    for (const [id, entry] of Object.entries(session?.judges || {})) {
      if (entry.uid === uid) continue;
      delete session.judges[id];
      judgeCache.delete(entry.rid);
      if (session.manualReviews?.[id]) session.results[id] = 'review';
      else delete session.results[id];
    }
  }

  async function readJudge(q, entry, token) {
    judgeAbort = new AbortController();
    try {
      if (entry.verifiedGeneration !== token) {
        const profile = await judgeJson('/workbench/data', { signal: judgeAbort.signal });
        if (token !== judgeGeneration) return;
        const uid = profile.data?.user?.uid;
        verifyJudgeUser(uid);
        if (uid !== entry.uid) {
          save();
          renderNavigation();
          throw new Error('当前账号与这条评测记录不同，请重新提交。');
        }
        entry.verifiedGeneration = token;
      }
      const body = await judgeJson('/record/' + entry.rid, { signal: judgeAbort.signal });
      const record = body.rdoc;
      if (token !== judgeGeneration || !session || currentQuestion().id !== q.id) return;
      if (!record || String(record._id) !== entry.rid || record.pid !== q.judge.docId || record.uid !== entry.uid) throw new Error('评测记录与当前提交不一致。');
      entry.record = record;
      judgeCache.set(entry.rid, entry);
      $('judge-message').textContent = '';
      showJudgeRecord(q, entry, record);
      if (pendingStatuses.has(record.status)) judgeTimer = window.setTimeout(() => readJudge(q, entry, token), 2200);
    } catch (error) {
      if (token !== judgeGeneration || error.name === 'AbortError') return;
      $('judge-message').textContent = error.message;
      $('refresh-judge').hidden = false;
      $('submit-judge').disabled = judgeSubmitting;
      if (error.loginRequired) $('judge-login').hidden = false;
    }
  }

  function renderJudge() {
    stopJudgeRead();
    const q = currentQuestion();
    const available = !!q.judge && !(session.config.mode === 'exam' && !session.done);
    $('judge-panel').hidden = !available;
    $('judge-result').hidden = true;
    $('judge-message').textContent = '';
    $('judge-login').hidden = true;
    $('refresh-judge').hidden = true;
    $('judge-record').hidden = true;
    $('submit-judge').disabled = judgeSubmitting;
    $('submit-judge').textContent = judgeSubmitting ? '提交中…' : '提交判题';
    if (!available) return;
    $('judge-scope').textContent = q.type === 'fill' ? `按 ${q.blankCount} 个空填写，系统自动拼接原题模板；共 ${q.judge.caseCount} 个测试点。`
      : q.type === 'function' ? q.reference.codeScope + `；系统补齐测试程序，共 ${q.judge.caseCount} 个测试点。`
        : `提交完整 Main.java 程序；共 ${q.judge.caseCount} 个测试点。`;
    $('judge-login').href = '/login?redirect=' + encodeURIComponent('/practice/pta-oop/');
    const saved = session.judges?.[q.id];
    if (!saved || saved.answerKey !== JSON.stringify(session.answers[q.id])) return;
    const entry = judgeCache.get(saved.rid) || { ...saved };
    readJudge(q, entry, judgeGeneration);
  }

  async function submitJudge() {
    if (!session || judgeSubmitting || (session.config.mode === 'exam' && !session.done)) return;
    const round = session;
    const q = currentQuestion();
    if (!q.judge) return;
    const last = round.judges[q.id];
    if (last && pendingStatuses.has(judgeCache.get(last.rid)?.record?.status)) return;
    let code;
    try { code = core.submissionCode(q, session.answers[q.id]); }
    catch (error) { $('judge-message').textContent = error.message; return; }
    const answerKey = JSON.stringify(session.answers[q.id]);
    stopJudgeRead();
    judgeSubmitting = true;
    $('submit-judge').disabled = true;
    $('submit-judge').textContent = '提交中…';
    $('judge-message').textContent = '正在提交代码…';
    try {
      // Read the active profile; restored records never inherit another account's results.
      const profile = await judgeJson('/workbench/data');
      const judgeUser = profile.data?.user?.uid;
      verifyJudgeUser(judgeUser);
      const body = await judgeJson('/p/' + q.judge.pid + '/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang: 'java', code }) });
      const rid = String(body.rid || '');
      if (!/^[a-f\d]{24}$/i.test(rid)) throw new Error('网站没有返回评测编号，请查看评测记录后再试。');
      const entry = { rid, uid: judgeUser, answerKey, version: q.judge.version, status: 0, applied: false };
      if (answerKey === JSON.stringify(round.answers[q.id])) {
        round.judges[q.id] = entry;
        if (round.results[q.id] === 'mastered') delete round.results[q.id];
      }
      judgeCache.set(rid, entry);
      save();
      if (session === round && currentQuestion().id === q.id && answerKey === JSON.stringify(session.answers[q.id])) {
        $('judge-message').textContent = '提交成功，正在获取评测结果。';
      }
    } catch (error) {
      if (session === round && currentQuestion().id === q.id) {
        $('judge-message').textContent = error.message;
        if (error.loginRequired) $('judge-login').hidden = false;
      }
    } finally {
      judgeSubmitting = false;
      if (session === round && currentQuestion().id === q.id && round.judges[q.id]?.answerKey === answerKey) renderJudge();
      else if (session && currentView === 'quiz') {
        $('submit-judge').disabled = false;
        $('submit-judge').textContent = '提交判题';
      }
    }
  }

  function answerText(question, answer) {
    if (!Array.isArray(answer) || !answer.length) return '';
    if (question.type === 'fill') return answer.map((value, index) => `第 ${index + 1} 空：${value}`).join('\n');
    if (question.type === 'function' || question.type === 'program') return answer[0];
    return orderedOptions(question).flatMap((option, index) => answer.includes(option.id)
      ? [question.type === 'tf' ? option.text : `${option.id}. ${option.text}`] : []).join('\n');
  }

  function referenceAnswerText(question) {
    const reference = question.reference;
    if (question.type === 'tf') return reference.answerId === 'true' ? '正确' : '错误';
    if (question.type === 'single') {
      return core.acceptedAnswers(question).map(id => {
        const option = question.options.find(item => item.id === id);
        return `${option.id}. ${option.text}`;
      }).join('；或 ');
    }
    if (question.type === 'fill') return reference.blanks.map((value, index) => `第 ${index + 1} 空：${value}`).join('\n');
    return reference.code;
  }

  function referenceVisible(question) {
    return core.canReveal(session) && (session.done || session.revealed?.[question.id] === true);
  }

  function renderReference() {
    const q = currentQuestion();
    const reference = q.reference;
    const available = core.canReveal(session);
    const visible = referenceVisible(q);
    $('reference-actions').hidden = !available;
    $('reference-hint').textContent = core.canScore(q) ? '选择后自动判定，答错会加入错题本。' : '可提交评测，或查看参考解答。';
    $('check-answer').textContent = visible ? '再次查看讲解' : '查看答案与讲解';
    const grade = core.checkedGrade(q, session);
    $('mark-mastered').disabled = grade === 'wrong' || core.judgeGrade(q, session) === 'wrong';
    $('mark-mastered').setAttribute('aria-pressed', String(session.results[q.id] === 'mastered'));
    $('mark-review').setAttribute('aria-pressed', String(session.manualReviews?.[q.id] === true));
    $('reference-verdict').hidden = !grade;
    $('reference-verdict').className = 'feedback' + (grade === 'wrong' ? ' is-wrong' : '');
    $('reference-verdict').textContent = grade === 'correct' ? '✓ 答对了。' : grade === 'wrong' ? '答案错误，已加入错题本。' : '';
    $('reference-panel').hidden = !visible;
    // Remove the previous question's answer from the DOM while a test is active.
    $('reference-answer').textContent = '';
    $('reference-blanks').replaceChildren();
    $('reference-code').textContent = '';
    $('reference-explanation').textContent = '';
    $('reference-remark').textContent = '';
    $('reference-validation').textContent = '';
    $('reference-validation-notes').textContent = '';
    if (!visible) return;
    const objective = ['tf', 'single'].includes(q.type);
    $('reference-answer').hidden = !objective;
    if (objective) $('reference-answer').textContent = '参考答案：' + referenceAnswerText(q);
    $('reference-blanks').hidden = q.type !== 'fill';
    if (q.type === 'fill') {
      for (let index = 0; index < reference.blanks.length; index += 1) {
        const row = document.createElement('div');
        row.className = 'reference-blank';
        const label = document.createElement('span');
        label.textContent = `第 ${index + 1} 空`;
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.textContent = reference.blanks[index];
        pre.appendChild(code);
        row.append(label, pre);
        $('reference-blanks').appendChild(row);
      }
    }
    $('reference-explanation').textContent = '讲解：' + reference.explanation;
    $('reference-remark').hidden = !reference.remark;
    if (reference.remark) $('reference-remark').textContent = '题面说明：' + reference.remark;
    $('reference-code-section').hidden = !reference.code;
    if (reference.code) {
      $('reference-code-scope').textContent = reference.codeScope;
      $('reference-code').textContent = reference.code;
    }
    $('reference-validation').hidden = !reference.validation;
    if (reference.validation) $('reference-validation').textContent = `✓ JDK 17 编译通过 · ${reference.validation.passedCases} 个样例和边界用例通过`;
    $('reference-validation-notes').hidden = !reference.validationNotes?.length;
    if (reference.validationNotes?.length) $('reference-validation-notes').textContent = '运行说明：' + reference.validationNotes.join(' ');
    for (const row of $('answer-controls').querySelectorAll('.option-row')) {
      const id = row.querySelector('input').value;
      row.classList.toggle('is-correct', Boolean(grade) && core.acceptedAnswers(q).includes(id));
      row.classList.toggle('is-wrong', grade === 'wrong' && id === session.answers[q.id]?.[0]);
    }
  }

  function checkQuestion(q) {
    core.checkObjective(q, session, mistakes);
  }

  function checkAnswer() {
    if (!core.canReveal(session)) return;
    const q = currentQuestion();
    if (core.canScore(q) && !core.complete(q, session.answers[q.id])) {
      $('question-message').textContent = '请先选择答案，再核对讲解。';
      return;
    }
    checkQuestion(q);
    session.revealed[q.id] = true;
    save();
    renderQuestion();
  }

  function renderQuestion() {
    if (!session) { setup(); return; }
    const q = currentQuestion();
    const answer = session.answers[q.id] || [];
    const assessment = session.results[q.id];
    const examActive = session.config.mode === 'exam' && !session.done;
    $('round-heading').textContent = session.config.review ? '错题重练' : '面向对象综合练习';
    $('round-mode').textContent = session.done ? '本轮回顾 · 核对与标记' : examActive ? '自测模式 · 作答后统一回顾' : '逐题练习';
    $('question-type').textContent = q.typeName;
    $('question-source').textContent = '原题 ' + q.label;
    $('question-position').textContent = `${session.index + 1} / ${session.ids.length}`;
    const title = core.displayTitle(q);
    $('question-heading').textContent = title || q.typeName + ' · ' + q.label;
    $('question-heading').hidden = !title;
    const limits = [];
    if (q.timeLimit != null) limits.push(`时间限制 ${q.timeLimit} ms`);
    if (q.memoryLimit != null) limits.push(`内存限制 ${q.memoryLimit / 1024} MB`);
    $('question-limits').hidden = !limits.length;
    $('question-limits').textContent = limits.join(' · ');
    $('question-stem').innerHTML = q.stemHtml;
    $('question-context').hidden = !q.context;
    $('question-context').textContent = q.context || '';
    $('pta-link').href = q.sourceUrl;
    $('answer-instruction').textContent = q.type === 'fill' ? `共 ${q.blankCount} 个空，按题面编号填写代码。`
      : q.type === 'function' ? '在下方编写函数或类，完整保留你的代码。'
        : q.type === 'program' ? '在下方编写完整程序，代码会自动保存。'
          : q.type === 'tf' ? '选择正确或错误，系统会自动判定。' : '请选择一个选项；字母沿用原题标识。';
    if (q.type === 'fill') {
      $('answer-controls').innerHTML = `<div class="fill-fields">${Array.from({ length: q.blankCount }, (_, index) =>
        `<label class="fill-field" for="fill-${index}"><span>第 ${index + 1} 空</span><textarea id="fill-${index}" rows="2" data-blank-index="${index}" spellcheck="false" autocomplete="off" placeholder="填写代码">${escape(answer[index] || '')}</textarea></label>`).join('')}</div>`;
    } else if (q.type === 'function' || q.type === 'program') {
      $('answer-controls').innerHTML = `<label class="code-label" for="code-answer">我的代码</label><textarea id="code-answer" class="code-answer" rows="16" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="在这里编写代码">${escape(answer[0] || '')}</textarea>`;
    } else {
      $('answer-controls').innerHTML = `<div class="option-list">${orderedOptions(q).map((option, index) => {
        const selected = answer.includes(option.id);
        const letter = q.type === 'tf' ? String(index + 1) : option.id;
        return `<label class="option-row ${selected ? 'is-selected' : ''}"><input type="radio" name="option" value="${escape(option.id)}" aria-label="${escape(letter + '. ' + option.text)}" ${selected ? 'checked' : ''}><span class="option-letter" aria-hidden="true">${letter}</span><span class="option-copy">${option.html}</span></label>`;
      }).join('')}</div>`;
      if (q.type === 'single' && !q.shuffleOptions) $('answer-instruction').textContent += ' 本题选项涉及顺序或其他选项，保留原顺序。';
    }
    $('assessment-controls').hidden = examActive;
    $('mark-mastered').setAttribute('aria-pressed', String(assessment === 'mastered'));
    $('mark-review').setAttribute('aria-pressed', String(session.manualReviews?.[q.id] === true));
    $('mark-mastered').disabled = core.checkedGrade(q, session) === 'wrong' || core.judgeGrade(q, session) === 'wrong';
    $('feedback').hidden = !assessment || examActive || core.canScore(q) || Boolean(core.judgeGrade(q, session));
    $('feedback').className = 'feedback' + (assessment === 'review' ? ' is-review' : '');
    $('feedback').textContent = assessment === 'mastered' ? '✓ 已记录为掌握，已从错题本移出。' : assessment === 'review' ? '已加入错题本，下次可以单独重练。' : '';
    $('question-message').textContent = '';
    $('draft-status').textContent = answer.some(value => value.trim()) ? (storageAvailable ? '作答已保存到当前浏览器' : '作答保留在当前页面') : '作答自动保存';
    $('previous-button').disabled = session.index === 0;
    $('next-button').textContent = session.index === session.ids.length - 1 ? (session.done ? '查看本轮记录' : '完成本轮') : '下一题 →';
    $('finish-button').hidden = session.done;
    $('back-results').hidden = !session.done;
    if (window.innerWidth < 721) $('answer-card').open = false;
    renderReference();
    renderJudge();
    renderNavigation();
  }

  function renderNavigation() {
    const answered = session.ids.filter(id => core.complete(lookup.get(id), session.answers[id])).length;
    const marked = session.ids.filter(id => session.results[id]).length;
    $('progress-label').textContent = `${answered} / ${session.ids.length}`;
    $('round-progress').max = session.ids.length;
    $('round-progress').value = answered;
    $('round-status').textContent = session.done ? `已作答 ${answered} 题，已标记 ${marked} 题掌握情况。`
      : session.config.mode === 'exam' ? `已保存 ${answered} 题答案，完成后逐题核对。` : `已作答 ${answered} 题，已标记 ${marked} 题。`;
    $('navigation-count').textContent = `${session.ids.length} 题`;
    $('question-navigation').innerHTML = session.ids.map((id, index) => {
      const outcome = core.navigationState(lookup.get(id), session);
      const state = outcome.state ? 'is-' + outcome.state : '';
      const text = outcome.text;
      return `<button type="button" class="nav-question ${state} ${index === session.index ? 'is-current' : ''}" data-question-index="${index}" aria-label="第 ${index + 1} 题，${text}" ${index === session.index ? 'aria-current="true"' : ''}>${index + 1}</button>`;
    }).join('');
    $('mistake-count').textContent = String(Object.keys(mistakes).length);
  }

  function changeAnswer() {
    if (!session) return;
    const q = currentQuestion();
    if (q.type === 'fill') session.answers[q.id] = [...$('answer-controls').querySelectorAll('textarea')].map(input => input.value);
    else if (q.type === 'function' || q.type === 'program') session.answers[q.id] = [$('code-answer').value];
    else {
      session.answers[q.id] = [...$('answer-controls').querySelectorAll('input:checked')].map(input => input.value);
      for (const row of $('answer-controls').querySelectorAll('.option-row')) row.classList.toggle('is-selected', row.querySelector('input').checked);
    }
    if (session.results[q.id] === 'mastered') {
      delete session.results[q.id];
      $('mark-mastered').setAttribute('aria-pressed', 'false');
      $('feedback').hidden = true;
    }
    delete session.checks[q.id];
    if (core.canScore(q)) checkQuestion(q);
    if (q.judge) {
      stopJudgeRead();
      delete session.judges[q.id];
      $('judge-result').hidden = true;
      $('judge-record').hidden = true;
      $('refresh-judge').hidden = true;
      $('judge-message').textContent = '作答已修改，请重新提交判题。';
      $('submit-judge').disabled = judgeSubmitting;
      $('submit-judge').textContent = judgeSubmitting ? '提交中…' : '提交判题';
    }
    $('reference-verdict').hidden = true;
    for (const row of $('answer-controls').querySelectorAll('.option-row')) row.classList.remove('is-correct', 'is-wrong');
    save();
    $('draft-status').textContent = storageAvailable ? '作答已保存到当前浏览器' : '作答保留在当前页面';
    $('question-message').textContent = !core.canScore(q) && referenceVisible(q) ? '作答已修改，可再次核对。' : '';
    renderReference();
    renderNavigation();
  }

  function assess(value) {
    if (!session || (session.config.mode === 'exam' && !session.done)) return;
    const q = currentQuestion();
    if (core.canScore(q)) {
      checkQuestion(q);
      if (value === 'mastered' && core.checkedGrade(q, session) !== 'correct') {
        $('question-message').textContent = '请先答对这道题，再标记已掌握。';
        return;
      }
      if (value === 'review') {
        session.manualReviews[q.id] = true;
        session.results[q.id] = 'review';
        if (!mistakes[q.id]) mistakes[q.id] = { count: 1, lastWrong: Date.now() };
      } else delete session.manualReviews[q.id];
      checkQuestion(q);
      save();
      renderQuestion();
      return;
    }
    if (value === 'mastered' && !core.complete(q, session.answers[q.id])) {
      $('question-message').textContent = '请先完整填写作答，再标记已掌握。';
      return;
    }
    if (value === 'mastered' && core.checkedGrade(q, session) === 'wrong') {
      $('question-message').textContent = '这次作答与参考答案不同，请修改并重新核对后再标记掌握。';
      return;
    }
    const judge = session.judges?.[q.id];
    const judgeStatus = judge && judge.answerKey === JSON.stringify(session.answers[q.id]) ? judgeCache.get(judge.rid)?.record?.status : undefined;
    if (value === 'mastered' && (core.judgeGrade(q, session) === 'wrong' || failedStatuses.has(judgeStatus))) {
      $('question-message').textContent = '这次代码未通过评测，请修改并重新提交后再标记掌握。';
      return;
    }
    const old = session.results[q.id];
    if (value === 'review') session.manualReviews[q.id] = true;
    else delete session.manualReviews[q.id];
    session.results[q.id] = value;
    if (value === 'mastered') delete mistakes[q.id];
    else if (old !== 'review') mistakes[q.id] = { count: (mistakes[q.id]?.count || 0) + 1, lastWrong: Date.now() };
    save();
    renderQuestion();
  }

  function go(index) {
    if (!session || index < 0 || index >= session.ids.length) return;
    session.index = index;
    save();
    renderQuestion();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function requestFinish() {
    if (!session) return;
    if (session.done) { results(); return; }
    const unanswered = session.ids.filter(id => !core.complete(lookup.get(id), session.answers[id])).length;
    $('finish-dialog-description').textContent = unanswered ? `还有 ${unanswered} 题未完整作答。完成后会保留现有作答，你可以继续回顾、补写和标记。`
      : `本轮 ${session.ids.length} 题已全部作答。接下来逐题核对，并标记掌握情况。`;
    $('finish-dialog').showModal();
  }

  function finish() {
    $('finish-dialog').close();
    if (!session || session.done) return;
    session.done = true;
    session.endedAt = Date.now();
    for (const id of session.ids) checkQuestion(lookup.get(id));
    save();
    results();
  }

  function reviewIds() { return session.ids.filter(id => {
    const failed = core.judgeGrade(lookup.get(id), session) === 'wrong';
    return failed || session.results[id] === 'review' || core.checkedGrade(lookup.get(id), session) === 'wrong';
  }); }

  function results() {
    if (!session?.done) { setup(); return; }
    const answered = session.ids.filter(id => core.complete(lookup.get(id), session.answers[id])).length;
    const mastered = session.ids.filter(id => session.results[id] === 'mastered').length;
    const review = reviewIds().length;
    const scores = core.scoreSummary(bank.questions, session);
    $('result-score').hidden = !scores.eligible;
    $('score-number').textContent = `${scores.correct} / ${scores.checked}`;
    $('score-description').textContent = `已判定 ${scores.checked} 题，答对 ${scores.correct} 题，答错 ${scores.wrong} 题。${scores.pending} 道客观题尚未作答；${scores.manual} 道代码题可提交评测。`;
    $('result-total').textContent = String(session.ids.length);
    $('result-answered').textContent = String(answered);
    $('result-mastered').textContent = String(mastered);
    $('result-review').textContent = String(review);
    $('result-description').textContent = `已完整作答 ${answered} / ${session.ids.length} 题，全部题目现在可以查看参考答案与讲解。${review ? `本轮 ${review} 题需要复习。` : '可以逐题核对作答，或开始下一轮。'}`;
    $('retry-wrong').disabled = !review;
    show('results');
  }

  function renderMistakes() {
    const ids = Object.keys(mistakes).sort((a, b) => mistakes[b].lastWrong - mistakes[a].lastWrong);
    $('mistakes-description').textContent = ids.length ? `有 ${ids.length} 题待复习。核对后标记“已掌握”，即可从错题本移出。` : '目前没有待复习的错题。';
    $('practice-mistakes').disabled = !ids.length;
    $('mistake-list').innerHTML = ids.length ? ids.map(id => {
      const q = lookup.get(id);
      return `<div class="mistake-row"><div class="mistake-info"><span class="source-badge">原题 ${escape(q.label)} · ${escape(q.typeName)}</span><small>累计加入 ${mistakes[id].count} 次</small><p>${escape(q.title)}</p></div><button class="button button-secondary" type="button" data-retry-id="${id}">重练</button></div>`;
    }).join('') : '<div class="empty-state"><strong>错题本是空的</strong><span>练习时点击“加入错题”，把不熟的题留在这里。</span></div>';
    show('mistakes');
  }

  function mistakeSettings(ids) {
    return { types: [...new Set(ids.map(id => lookup.get(id).type))], query: '', limit: 'all', mode: 'practice', shuffleQuestions: true, shuffleOptions: true, review: true };
  }

  function exportRecord() {
    if (!session) return;
    const record = { title: bank.title, exportedAt: new Date().toISOString(), mode: session.config.mode,
      questions: session.ids.map(id => { const q = lookup.get(id); return { id, label: q.label, title: q.title, type: q.typeName,
        answer: answerText(q, session.answers[id]), referenceGrade: core.checkedGrade(q, session), assessment: session.results[id] === 'mastered' ? '已掌握' : session.results[id] === 'review' ? '待复习' : '未标记', sourceUrl: q.sourceUrl }; }) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = '面向对象程序设计-作答记录-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('作答记录已导出');
  }

  function downloadText(filename, value, contentType = 'text/plain;charset=utf-8') {
    const url = URL.createObjectURL(new Blob([value], { type: contentType }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadReferences() {
    if (session && !core.canReveal(session)) { toast('完成自测后可下载参考答案'); return; }
    const parts = ['# 面向对象程序设计 · 204 题参考答案与讲解', bank.referenceNotice, ''];
    for (const q of bank.questions) {
      const ref = q.reference;
      parts.push(`## ${q.label} ${q.title}`, '');
      if (q.context) parts.push('作答前提：' + q.context, '');
      if (['tf', 'single'].includes(q.type)) {
        const text = q.type === 'tf' ? (ref.answerId === 'true' ? '正确' : '错误')
          : core.acceptedAnswers(q).map(id => `原题选项 ${id}：${q.options.find(option => option.id === id).text}`).join('；或 ');
        parts.push('参考答案：' + text, '');
      }
      if (ref.blanks) ref.blanks.forEach((value, index) => parts.push(`第 ${index + 1} 空：`, '```java', value, '```', ''));
      parts.push('讲解：' + ref.explanation, '');
      if (ref.remark) parts.push('题面说明：' + ref.remark, '');
      if (ref.code && q.type !== 'fill') parts.push(ref.codeScope, '```java', ref.code.trimEnd(), '```', '');
      if (ref.validation) parts.push(`验证：JDK 17 编译通过，${ref.validation.passedCases} 个样例和边界用例通过。`, '');
      if (ref.validationNotes?.length) parts.push('运行说明：' + ref.validationNotes.join(' '), '');
    }
    downloadText('面向对象程序设计-204题参考答案与讲解.md', parts.join('\n'), 'text/markdown;charset=utf-8');
    toast('204 题参考答案与讲解已下载');
  }

  $('setup-form').addEventListener('submit', event => { event.preventDefault(); start(); });
  $('setup-form').addEventListener('change', updatePool);
  $('question-search').addEventListener('input', updatePool);
  $('answer-form').addEventListener('submit', event => event.preventDefault());
  $('answer-controls').addEventListener('input', changeAnswer);
  $('answer-controls').addEventListener('keydown', event => {
    if (event.key !== 'Tab' || event.shiftKey || event.ctrlKey || event.metaKey || !event.target.matches('textarea')) return;
    event.preventDefault();
    event.target.setRangeText('    ', event.target.selectionStart, event.target.selectionEnd, 'end');
    changeAnswer();
  });
  $('mark-mastered').addEventListener('click', () => assess('mastered'));
  $('mark-review').addEventListener('click', () => assess('review'));
  $('previous-button').addEventListener('click', () => go(session.index - 1));
  $('next-button').addEventListener('click', () => session.index < session.ids.length - 1 ? go(session.index + 1) : requestFinish());
  $('question-navigation').addEventListener('click', event => { const button = event.target.closest('[data-question-index]'); if (button) go(Number(button.dataset.questionIndex)); });
  $('finish-button').addEventListener('click', requestFinish);
  $('cancel-finish').addEventListener('click', () => $('finish-dialog').close());
  $('confirm-finish').addEventListener('click', finish);
  $('back-results').addEventListener('click', results);
  $('resume-button').addEventListener('click', () => { renderQuestion(); show('quiz'); });
  $('change-settings').addEventListener('click', setup);
  $('results-home').addEventListener('click', setup);
  $('new-round').addEventListener('click', () => start({ ...session.config, review: false }));
  $('review-all').addEventListener('click', () => { session.index = 0; save(); renderQuestion(); show('quiz'); });
  $('retry-wrong').addEventListener('click', () => { const ids = reviewIds(); if (ids.length) start(mistakeSettings(ids), ids); });
  $('open-mistakes').addEventListener('click', renderMistakes);
  $('mistakes-home').addEventListener('click', () => { if (session && !session.done) { renderQuestion(); show('quiz'); } else setup(); });
  $('practice-mistakes').addEventListener('click', () => { const ids = Object.keys(mistakes); if (ids.length) start(mistakeSettings(ids), ids); });
  $('mistake-list').addEventListener('click', event => { const button = event.target.closest('[data-retry-id]'); if (button) start(mistakeSettings([button.dataset.retryId]), [button.dataset.retryId]); });
  $('export-record').addEventListener('click', exportRecord);
  $('copy-answer').addEventListener('click', async () => {
    const value = answerText(currentQuestion(), session.answers[currentQuestion().id]);
    if (!value) { toast('请先写下作答'); return; }
    try { await navigator.clipboard.writeText(value); toast('作答已复制'); }
    catch (_) { toast('请选中作答内容后手动复制'); }
  });
  $('check-answer').addEventListener('click', checkAnswer);
  $('submit-judge').addEventListener('click', submitJudge);
  $('refresh-judge').addEventListener('click', () => {
    if (!session || (session.config.mode === 'exam' && !session.done)) return;
    const q = currentQuestion(), saved = session.judges?.[q.id];
    if (!saved) return;
    stopJudgeRead();
    readJudge(q, judgeCache.get(saved.rid) || { ...saved }, judgeGeneration);
  });
  $('download-references').addEventListener('click', downloadReferences);
  $('copy-reference').addEventListener('click', async () => {
    if (!session || !referenceVisible(currentQuestion())) return;
    try { await navigator.clipboard.writeText(currentQuestion().reference.code); toast('参考代码已复制'); }
    catch (_) { toast('请选中参考代码后手动复制'); }
  });
  $('download-reference-code').addEventListener('click', () => {
    if (!session || !referenceVisible(currentQuestion())) return;
    const q = currentQuestion(), ref = q.reference;
    if (ref.fullCode) downloadText(ref.entry + '.java', ref.fullCode);
    toast(q.label + ' 的完整示例已下载');
  });
  document.addEventListener('keydown', event => {
    if (currentView !== 'quiz' || $('finish-dialog').open || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target.closest('input,textarea,select,button,summary,a')) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); go(session.index - 1); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); go(session.index + 1); }
    else if (/^[1-5]$/.test(event.key)) {
      const input = $('answer-controls').querySelectorAll('input[name="option"]')[Number(event.key) - 1];
      if (input) { event.preventDefault(); input.click(); }
    }
  });
  window.addEventListener('beforeunload', save);
  load();
  $('storage-message').hidden = storageAvailable;
  if (session && !session.done) { renderQuestion(); show('quiz', false); }
  else if (session?.done) results();
  else setup();
})();
