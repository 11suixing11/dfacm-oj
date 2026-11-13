'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const bank = require('./source/bank.json');
const core = require('./source/core.cjs');
const question = label => bank.questions.find(q => q.label === label);
function round(labels, mode = 'practice', random = () => 0) {
  return core.createSession(bank.questions, { types: Object.keys(bank.typeCounts), query: '', limit: 'all', mode,
    shuffleQuestions: false, shuffleOptions: true }, labels.map(label => question(label).id), random);
}

test('all 122 objective questions have valid answer sets and 82 code questions retain judge mappings', () => {
  const objective = bank.questions.filter(q => ['tf', 'single'].includes(q.type));
  assert.equal(objective.length, 122);
  assert.ok(objective.every(core.canScore));
  assert.equal(bank.questions.filter(q => q.judge).length, 82);
  assert.equal(new Set(bank.questions.map(q => q.id)).size, 204);
  for (const q of objective) {
    for (const id of core.acceptedAnswers(q)) assert.equal(core.grade(q, [id]), 'correct', q.label + ' ' + id);
  }
});

test('Java counterexamples correct the three contradictory true/false keys', () => {
  assert.equal(core.grade(question('1-35'), ['true']), 'correct');
  assert.equal(core.grade(question('1-42'), ['false']), 'correct');
  assert.equal(core.grade(question('1-51'), ['false']), 'correct');
});

test('non-unique single-choice questions accept each defensible option and reject unrelated options', () => {
  for (const [label, accepted, rejected] of [['2-5', ['B', 'C'], ['A', 'D']], ['2-13', ['A', 'D'], ['B', 'C', 'E']],
    ['2-40', ['B', 'D'], ['A', 'C']], ['2-63', ['C', 'D'], ['A', 'B']]]) {
    for (const id of accepted) assert.equal(core.grade(question(label), [id]), 'correct', label + ' ' + id);
    for (const id of rejected) assert.equal(core.grade(question(label), [id]), 'wrong', label + ' ' + id);
  }
});

test('option shuffling preserves original answer identities', () => {
  const q = question('2-1');
  const session = round(['2-1']);
  assert.deepEqual(session.options[q.id], ['B', 'C', 'D', 'A']);
  session.answers[q.id] = ['A'];
  core.checkObjective(q, session, {});
  assert.equal(core.checkedGrade(q, session), 'correct');
});

test('objective feedback, navigation and the mistake book agree when an answer changes', () => {
  const q = question('2-1'), session = round(['2-1']), mistakes = {};
  session.answers[q.id] = ['B'];
  assert.equal(core.checkObjective(q, session, mistakes, 10), 'wrong');
  assert.equal(core.navigationState(q, session).state, 'wrong');
  assert.equal(mistakes[q.id].count, 1);
  core.checkObjective(q, session, mistakes, 20);
  assert.equal(mistakes[q.id].count, 1);
  session.answers[q.id] = ['C'];
  core.checkObjective(q, session, mistakes, 30);
  assert.equal(mistakes[q.id].count, 2);
  session.answers[q.id] = ['A'];
  core.checkObjective(q, session, mistakes, 40);
  assert.equal(core.navigationState(q, session).state, 'correct');
  assert.equal(session.results[q.id], 'mastered');
  assert.equal(mistakes[q.id], undefined);
});

test('self-test mode reveals neither objective grades nor manually saved mastery before finishing', () => {
  const q = question('1-35'), session = round(['1-35'], 'exam');
  session.answers[q.id] = ['true'];
  session.results[q.id] = 'mastered';
  assert.equal(core.checkObjective(q, session, {}), null);
  assert.equal(core.checkedGrade(q, session), null);
  assert.equal(core.navigationState(q, session).state, 'answered');
  session.done = true;
  core.checkObjective(q, session, {});
  assert.equal(core.checkedGrade(q, session), 'correct');
});

test('restoring old answers regrades them with the corrected key and keeps draft text and review preferences', () => {
  const correct = question('1-35'), wrong = question('1-42'), session = round(['1-35', '1-42']);
  session.answers[correct.id] = ['true'];
  session.answers[wrong.id] = ['true'];
  session.results[correct.id] = 'review';
  session.manualReviews[correct.id] = true;
  session.results[wrong.id] = 'mastered';
  session.checks[wrong.id] = { answerId: 'true', referenceVersion: '2026-11-06.1' };
  const restored = core.restore({ version: bank.version, session, mistakes: { [correct.id]: { count: 3, lastWrong: 10 } } }, bank);
  assert.deepEqual(restored.session.answers, session.answers);
  assert.equal(core.checkedGrade(correct, restored.session), 'correct');
  assert.equal(restored.session.manualReviews[correct.id], true);
  assert.equal(core.navigationState(correct, restored.session).text, '答对，待复习');
  assert.equal(restored.mistakes[correct.id].count, 3);
  assert.equal(core.checkedGrade(wrong, restored.session), 'wrong');
  assert.equal(restored.session.results[wrong.id], 'review');
  assert.equal(restored.mistakes[wrong.id].count, 1);
  const again = core.restore({ version: bank.version, ...restored }, bank);
  assert.equal(again.mistakes[wrong.id].count, 1);
});

test('manual review preferences do not turn a correct answer into an incorrect grade', () => {
  const q = question('2-1'), session = round(['2-1']), mistakes = {};
  session.answers[q.id] = ['A'];
  session.manualReviews[q.id] = true;
  mistakes[q.id] = { count: 1, lastWrong: 10 };
  core.checkObjective(q, session, mistakes, 20);
  assert.equal(core.checkedGrade(q, session), 'correct');
  assert.equal(core.scoreSummary(bank.questions, session).correct, 1);
  assert.equal(core.navigationState(q, session).state, 'review');
  delete session.manualReviews[q.id];
  core.checkObjective(q, session, mistakes, 30);
  assert.equal(core.navigationState(q, session).state, 'correct');
  assert.equal(mistakes[q.id], undefined);
});

test('a restored active self-test keeps all objective grades hidden', () => {
  const q = question('1-35'), session = round(['1-35'], 'exam');
  session.answers[q.id] = ['true'];
  session.results[q.id] = 'mastered';
  session.checks[q.id] = core.makeCheck(q, ['true']);
  session.revealed[q.id] = true;
  const { session: restored } = core.restore({ version: bank.version, session }, bank);
  assert.equal(core.checkedGrade(q, restored), null);
  assert.equal(restored.results[q.id], undefined);
  assert.equal(restored.revealed[q.id], undefined);
});

test('persisted judge failures stay red after reload and obsolete submissions stop grading', () => {
  const q = question('6-1'), session = round(['6-1']);
  session.answers[q.id] = [q.reference.code];
  session.results[q.id] = 'mastered';
  session.judges[q.id] = { rid: '0123456789abcdef01234567', uid: 9, version: q.judge.version,
    answerKey: JSON.stringify(session.answers[q.id]), status: 2, applied: true };
  const restored = core.restore({ version: bank.version, session }, bank);
  assert.equal(core.judgeGrade(q, restored.session), 'wrong');
  assert.equal(core.navigationState(q, restored.session).state, 'wrong');
  assert.equal(restored.session.results[q.id], undefined);
  restored.session.answers[q.id] = ['class Rectangle {}'];
  assert.equal(core.judgeGrade(q, restored.session), null);
  session.judges[q.id].version = 'old';
  const stale = core.restore({ version: bank.version, session }, bank);
  assert.equal(stale.session.judges[q.id], undefined);
  assert.equal(stale.session.results[q.id], undefined);
});

test('system errors and cancellations do not classify a student answer as wrong', () => {
  const q = question('6-1'), session = round(['6-1']);
  session.answers[q.id] = [q.reference.code];
  for (const status of [0, 8, 9, 20, 21, 22, 23, 24, 25]) {
    session.judges[q.id] = { answerKey: JSON.stringify(session.answers[q.id]), version: q.judge.version, status };
    assert.equal(core.judgeGrade(q, session), null, String(status));
    assert.notEqual(core.navigationState(q, session).state, 'wrong', String(status));
  }
});

test('fragment assembly accepts a leading Override and imports after provided types', () => {
  const equality = question('6-4');
  const code = core.submissionCode(equality, ['@Override\n' + equality.reference.code]);
  assert.doesNotMatch(code, /@Override\s*@Override/);
  const compute = question('6-21');
  const imported = core.submissionCode(compute, ['// student comment\nimport java.util.Objects;\n' + compute.reference.code]);
  assert.ok(imported.indexOf('import java.util.Objects;') < imported.indexOf('interface ICompute'));
});

test('fragment assembly preserves nested public types and string/comment contents', () => {
  const q = question('6-1');
  const fragment = q.reference.code.replace('class Rectangle', 'public class Rectangle').replace('private double width;',
    'private double width; public class Nested {}\nString marker = "public class Rectangle";\n// public class Comment {}');
  const code = core.submissionCode(q, [fragment]);
  assert.match(code, /public class Main/);
  assert.match(code, /public class Nested/);
  assert.match(code, /"public class Rectangle"/);
  assert.match(code, /\/\/ public class Comment/);
  assert.doesNotMatch(code, /\npublic class Rectangle/);
});

test('fragment assembly keeps the actual TestAdmin entry public', () => {
  const q = question('6-28');
  const code = core.submissionCode(q, [q.reference.code.replace('class Admin', 'public class Admin')]);
  assert.match(code, /public class TestAdmin/);
  assert.doesNotMatch(code, /\npublic class Admin/);
});

test('incomplete and excessively long submissions cannot silently pass through assembly', () => {
  assert.throws(() => core.submissionCode(question('5-1'), ['', '', '']), /完整填写/);
  assert.throws(() => core.submissionCode(question('6-1'), ['a'.repeat(100001)]), /完整填写|过长/);
});
