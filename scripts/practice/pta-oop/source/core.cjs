(function (root) {
  'use strict';
  const assessments = new Set(['mastered', 'review']);
  const failedStatuses = new Set([2, 3, 4, 5, 6, 7]);
  const pendingStatuses = new Set([0, 20, 21, 22, 23, 24, 25]);

  function shuffle(values, random = Math.random) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function validAnswer(question, answer) {
    if (!Array.isArray(answer) || answer.some(value => typeof value !== 'string' || value.length > 100000)) return false;
    if (question.type === 'single' || question.type === 'tf') {
      return answer.length <= 1 && answer.every(id => question.options.some(option => option.id === id));
    }
    return answer.length <= (question.type === 'fill' ? question.blankCount : 1);
  }

  function complete(question, answer) {
    if (!validAnswer(question, answer)) return false;
    const length = question.type === 'fill' ? question.blankCount : 1;
    return answer.length === length && answer.every(value => value.trim().length > 0);
  }

  function acceptedAnswers(question) {
    const reference = question.reference;
    const ids = reference?.answerIds ?? (typeof reference?.answerId === 'string' ? [reference.answerId] : []);
    return Array.isArray(ids) && ids.length > 0 && new Set(ids).size === ids.length
      && ids.every(id => typeof id === 'string' && question.options.some(option => option.id === id)) ? ids : [];
  }

  function canScore(question) {
    return ['single', 'tf'].includes(question.type) && question.reference?.autoScore === true
      && acceptedAnswers(question).length > 0;
  }

  function grade(question, answer) {
    if (!canScore(question) || !complete(question, answer)) return null;
    return acceptedAnswers(question).includes(answer[0]) ? 'correct' : 'wrong';
  }

  function canReveal(session) {
    return Boolean(session && (session.config.mode === 'practice' || session.done));
  }

  function displayTitle(question) {
    const normalize = value => String(value || '').replace(/\s+/g, '').trim();
    const title = String(question.title || '').trim();
    const stem = normalize(question.stemText);
    if (title && stem.startsWith(normalize(title))) return '';
    const parts = title.split('--');
    if (parts.length === 2 && parts[1].trim() && stem.startsWith(normalize(parts[1]))) return parts[0].trim();
    return title;
  }

  function maskJava(source) {
    // Keep offsets and line breaks while excluding comments and literals from structural edits.
    return source.replace(/"""[\s\S]*?"""|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g,
      value => value.replace(/[^\r\n]/g, ' '));
  }

  function fragmentCode(template, fragment, entry) {
    let prefix = template.prefix;
    const imports = [];
    while (true) {
      const match = /^\s*(import\b[\s\S]*?;)/.exec(maskJava(fragment));
      if (!match) break;
      const end = match[0].length;
      const start = end - match[1].length;
      imports.push(fragment.slice(start, end));
      fragment = fragment.slice(0, start) + fragment.slice(end);
    }
    const prefixOverride = /(@(?:java\.lang\.)?Override)\s*$/.exec(maskJava(prefix));
    if (prefixOverride && /^\s*@(?:java\.lang\.)?Override\b/.test(maskJava(fragment))) {
      prefix = prefix.slice(0, prefixOverride.index) + prefix.slice(prefixOverride.index + prefixOverride[1].length);
    }
    let code = (imports.join('\n') + '\n' + prefix + '\n' + fragment + '\n' + template.suffix).trim() + '\n';
    const masked = maskJava(code);
    const depths = new Uint32Array(masked.length + 1);
    let depth = 0;
    for (let i = 0; i < masked.length; i += 1) {
      depths[i] = depth;
      if (masked[i] === '{') depth += 1;
      else if (masked[i] === '}') depth = Math.max(0, depth - 1);
    }
    const publicTypes = /\bpublic\s+(?:(?:abstract|final|strictfp|sealed|non-sealed)\s+)*(?:class|interface|enum|record)\s+([\w$]+)/g;
    for (const match of masked.matchAll(publicTypes)) {
      if (depths[match.index] === 0 && match[1] !== entry) {
        code = code.slice(0, match.index) + '      ' + code.slice(match.index + 6);
      }
    }
    return code;
  }

  function submissionCode(question, answer) {
    if (!question.judge || !complete(question, answer)) throw new Error('请先完整填写作答。');
    const template = question.judge.template;
    let code;
    if (template.mode === 'blanks') {
      if (template.segments.length !== question.blankCount + 1) throw new Error('填空模板不完整，请刷新页面。');
      code = template.segments.map((segment, index) => segment + (answer[index] || '')).join('');
    } else if (template.mode === 'fragment') {
      code = fragmentCode(template, answer[0], question.judge.entry || 'Main');
    } else code = answer[0];
    if (code.length > 100000) throw new Error('提交代码过长，请缩短到 100000 字符以内。');
    return code;
  }

  function makeCheck(question, answer) {
    return grade(question, answer) ? { answerId: answer[0], referenceVersion: question.reference.referenceVersion } : null;
  }

  function checkedGrade(question, session) {
    if (!canReveal(session)) return null;
    const check = session.checks?.[question.id];
    const answer = session.answers[question.id];
    if (!check || check.referenceVersion !== question.reference?.referenceVersion || check.answerId !== answer?.[0]) return null;
    return grade(question, answer);
  }

  function checkObjective(question, session, mistakes, now = Date.now(), countAttempt = true) {
    if (!canReveal(session)) return null;
    const check = makeCheck(question, session.answers[question.id]);
    if (!check) return null;
    const previous = checkedGrade(question, session);
    session.checks[question.id] = check;
    const value = checkedGrade(question, session);
    const manualReview = session.manualReviews?.[question.id] === true;
    session.results[question.id] = value === 'correct' && !manualReview ? 'mastered' : 'review';
    if (value === 'wrong') {
      if (!mistakes[question.id] || (countAttempt && previous !== 'wrong')) {
        mistakes[question.id] = { count: (mistakes[question.id]?.count || 0) + 1, lastWrong: now };
      }
    } else if (!manualReview) delete mistakes[question.id];
    return value;
  }

  function judgeGrade(question, session) {
    if (!canReveal(session)) return null;
    const entry = session.judges?.[question.id];
    if (!question.judge || !entry || entry.version !== question.judge.version
      || entry.answerKey !== JSON.stringify(session.answers[question.id])) return null;
    return entry.status === 1 ? 'correct' : failedStatuses.has(entry.status) ? 'wrong' : null;
  }

  function navigationState(question, session) {
    const value = checkedGrade(question, session) || judgeGrade(question, session);
    if (value) {
      const text = value === 'wrong' ? '答错' : question.judge ? '通过评测' : '答对';
      return value === 'correct' && session.results[question.id] === 'review'
        ? { state: 'review', text: text + '，待复习' } : { state: value, text };
    }
    const judged = session.judges?.[question.id];
    if (canReveal(session) && question.judge && judged && judged.version === question.judge.version
      && judged.answerKey === JSON.stringify(session.answers[question.id]) && pendingStatuses.has(judged.status)) {
      return { state: 'answered', text: '评测中' };
    }
    const assessment = canReveal(session) ? session.results[question.id] : null;
    if (assessment === 'mastered') return { state: 'correct', text: '已掌握' };
    if (assessment === 'review') return { state: 'review', text: '待复习' };
    return complete(question, session.answers[question.id]) ? { state: 'answered', text: '已答' } : { state: '', text: '未答' };
  }

  function scoreSummary(questions, session) {
    const selected = questions.filter(question => session.ids.includes(question.id) && canScore(question));
    const graded = selected.map(question => checkedGrade(question, session));
    return { eligible: selected.length, checked: graded.filter(Boolean).length,
      correct: graded.filter(value => value === 'correct').length, wrong: graded.filter(value => value === 'wrong').length,
      pending: graded.filter(value => !value).length, manual: session.ids.length - selected.length };
  }

  function pool(questions, config) {
    const term = String(config.query || '').trim().toLocaleLowerCase();
    return questions.filter(question => config.types.includes(question.type)
      && (!term || (question.label + ' ' + question.title + ' ' + question.stemText
        + ' ' + question.options.map(option => option.text).join(' ')).toLocaleLowerCase().includes(term)));
  }

  function createSession(questions, config, forcedIds = null, random = Math.random) {
    let candidates = forcedIds ? questions.filter(question => forcedIds.includes(question.id)) : pool(questions, config);
    if (config.shuffleQuestions) candidates = shuffle(candidates, random);
    const limit = forcedIds || config.limit === 'all' ? candidates.length : Math.min(candidates.length, Number(config.limit) || 30);
    const selected = candidates.slice(0, limit);
    if (!selected.length) return null;
    return {
      ids: selected.map(question => question.id),
      options: Object.fromEntries(selected.map(question => [question.id,
        config.shuffleOptions && question.shuffleOptions
          ? shuffle(question.options.map(option => option.id), random) : question.options.map(option => option.id)])),
      config: { ...config, types: [...config.types] }, answers: {}, results: {}, checks: {}, revealed: {}, judges: {}, manualReviews: {}, index: 0,
      startedAt: Date.now(), endedAt: null, done: false,
    };
  }

  function restore(data, bank) {
    const lookup = new Map(bank.questions.map(question => [question.id, question]));
    const mistakes = {};
    if (data?.version !== bank.version) return { session: null, mistakes };
    for (const [id, item] of Object.entries(data.mistakes || {})) {
      if (lookup.has(id) && Number.isFinite(item?.count) && item.count > 0) {
        mistakes[id] = { count: Math.min(item.count, 1e6), lastWrong: Number(item.lastWrong) || 0 };
      }
    }
    const saved = data.session;
    const invalid = () => ({ session: null, mistakes });
    if (!saved || !Array.isArray(saved.ids) || !saved.ids.length || saved.ids.length > bank.questions.length
      || new Set(saved.ids).size !== saved.ids.length || !saved.ids.every(id => lookup.has(id))
      || !saved.config || !['practice', 'exam'].includes(saved.config.mode)
      || !Array.isArray(saved.config.types) || !saved.config.types.every(type => Object.hasOwn(bank.typeCounts, type))
      || !saved.options || !saved.answers || !saved.results) return invalid();
    const results = {};
    const answers = {};
    const checks = {};
    const revealed = {};
    const judges = {};
    const manualReviews = {};
    for (const id of saved.ids) {
      const q = lookup.get(id);
      const expected = q.options.map(option => option.id);
      const order = saved.options[id];
      if (!Array.isArray(order) || order.length !== expected.length || new Set(order).size !== order.length
        || !order.every(value => expected.includes(value))) return invalid();
      const answer = saved.answers[id];
      if (answer !== undefined) {
        if (!validAnswer(q, answer)) return invalid();
        answers[id] = answer;
      }
      const result = saved.results[id];
      if (result !== undefined) {
        if (!assessments.has(result) || (result === 'mastered' && !complete(q, answer))) return invalid();
        results[id] = result;
      }
      if (saved.manualReviews?.[id] === true || (saved.manualReviews === undefined && result === 'review')) manualReviews[id] = true;
      const judged = saved.judges?.[id];
      if (q.judge && judged && /^[a-f\d]{24}$/i.test(judged.rid) && typeof judged.answerKey === 'string'
        && judged.answerKey === JSON.stringify(answer) && judged.version === q.judge.version && Number.isInteger(judged.uid) && judged.uid > 0) {
        judges[id] = { rid: judged.rid, answerKey: judged.answerKey, version: judged.version, uid: judged.uid, applied: judged.applied === true };
        if ([...pendingStatuses, ...failedStatuses, 1, 8, 9].includes(judged.status)) judges[id].status = judged.status;
      } else if (judged && q.judge) {
        delete results[id];
      }
      if (saved.done === true || saved.config.mode === 'practice') {
        const check = saved.checks?.[id];
        const expectedCheck = makeCheck(q, answer);
        if (check && expectedCheck && check.answerId === expectedCheck.answerId && check.referenceVersion === expectedCheck.referenceVersion) checks[id] = expectedCheck;
        if (saved.revealed?.[id] === true) revealed[id] = true;
      }
    }
    const session = { ...saved, answers, results, checks, revealed, judges, manualReviews,
      index: Math.min(saved.ids.length - 1, Math.max(0, Math.trunc(Number(saved.index) || 0))), done: saved.done === true };
    for (const id of session.ids) {
      const question = lookup.get(id);
      if (canScore(question)) {
        if (canReveal(session)) checkObjective(question, session, mistakes, Date.now(), false);
        else delete session.results[id];
      } else if (question.judge && canReveal(session)) {
        const value = judgeGrade(question, session);
        if (value === 'wrong') {
          if (session.results[id] === 'mastered') delete session.results[id];
          if (!mistakes[id]) mistakes[id] = { count: 1, lastWrong: Date.now() };
        } else if (value === 'correct' && session.results[id] !== 'review') {
          session.results[id] = 'mastered';
          delete mistakes[id];
        } else if (pendingStatuses.has(judges[id]?.status) && session.results[id] === 'mastered') delete session.results[id];
      }
    }
    return { mistakes, session };
  }

  const api = { shuffle, validAnswer, complete, acceptedAnswers, canScore, grade, canReveal, displayTitle, submissionCode,
    makeCheck, checkedGrade, checkObjective, judgeGrade, navigationState, scoreSummary, pool, createSession, restore };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PtaPracticeCore = Object.freeze(api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
