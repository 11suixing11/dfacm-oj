'use strict';

const fs = require('node:fs');
const path = require('node:path');
const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) throw new Error('Usage: node repair-bank.cjs <original-bank.json> <repaired-bank.json>');
const bank = JSON.parse(fs.readFileSync(input, 'utf8'));
const byLabel = new Map(bank.questions.map(q => [q.label, q]));
const version = '2026-11-08.1';
const contexts = {
  '1-3': '这里讨论顶层类声明。',
  '1-4': '“不能变化”指变量保存的值；初始化不要求在字段声明处完成。',
  '1-12': '这里讨论没有方法体的普通接口方法。',
  '1-13': '这里讨论具体类对接口抽象方法的实现。',
  '1-21': '这里讨论显式调用父类构造器的写法，采用 Java 8/17 语法。',
  '1-28': '这里讨论普通外部类之间的访问，不含同一顶层类中的嵌套类。',
  '1-37': '假设这个构造器也没有使用 this(...) 委托给本类其他构造器。',
  '1-38': '这里讨论普通外部类之间的访问，不含同一顶层类中的嵌套类。',
  '2-7': '这里讨论普通外部类之间的访问，不含同一顶层类中的嵌套类。',
  '2-8': '只比较方法签名，题面方法体省略，括号按半角 Java 标点理解。',
  '2-9': '只比较方法签名和访问权限，题面方法体省略。',
  '2-12': '这里讨论顶层接口声明。',
  '2-13': '各选项均视为顶层类声明。此题有多项符合条件，选择其中一项即可。',
  '2-14': '这里讨论传统接口的抽象方法声明。',
  '2-28': '只判断创建并启动线程的语句形式。',
  '2-30': '这里讨论普通接口抽象方法，不含 private 辅助方法。',
  '2-41': '这里讨论普通接口抽象方法。',
  '2-63': '按 Java 规范能保证的行为判断。此题有多项符合条件，选择其中一项即可。',
  '2-67': '这里的“异常类”指 Exception 体系，不包括 Error 体系。',
};
for (const q of bank.questions) {
  if (!['tf', 'single'].includes(q.type)) continue;
  q.reference.autoScore = true;
  q.reference.referenceVersion = version;
  if (contexts[q.label]) q.context = contexts[q.label];
}

const corrections = {
  '1-35': { answerId: 'true', explanation: 'this 可以访问当前对象继承得到的可见成员。例如子类中的 this.x 可以访问父类的 public 或 protected 字段。字段被隐藏或方法被重写时，super 用于显式指定父类版本。', remark: '' },
  '1-42': { answerId: 'false', explanation: 'package 是包声明，不是可执行语句。若编译单元有 package 声明，它位于 import 和类型声明之前，且至多一条；题干称它为“可执行语句”，因此整句错误。', remark: '' },
  '1-51': { answerId: 'false', explanation: '实现接口不意味着必须在本类重写所有接口方法：继承到的 public 实现可以满足接口要求，default 方法可以直接使用，抽象类也可以暂不实现接口抽象方法。', remark: '' },
};
for (const [label, correction] of Object.entries(corrections)) Object.assign(byLabel.get(label).reference, correction);

const alternatives = {
  '2-5': { answerIds: ['B', 'C'], explanation: 'B、C 都不正确。局部变量允许 final 修饰，也允许与成员变量同名；成员变量可用 this.成员名 区分。选择 B 或 C 均算答对。' },
  '2-13': { answerIds: ['A', 'D'], explanation: '按顶层类声明分析，A 同时 extends 两个类，违反单继承规则；D 的顶层类不能使用 private 修饰。选择 A 或 D 均算答对。' },
  '2-40': { answerIds: ['B', 'D'], explanation: 'B 错在抽象类不能直接实例化；D 也不严格，实现全部抽象方法的子类仍可以显式声明为 abstract。选择 B 或 D 均算答对。' },
  '2-63': { answerIds: ['C', 'D'], explanation: '新建线程通常继承创建线程的优先级，不是默认最低，所以 C 错误。Java 规范也不保证优先级与先执行概率成正比，D 不能作为跨平台保证。按本题的规范语境，选择 C 或 D 均算答对。' },
};
for (const [label, correction] of Object.entries(alternatives)) {
  const q = byLabel.get(label);
  Object.assign(q.reference, correction, { remark: '' });
  q.context ||= '此题有多项符合条件，选择其中一项即可。';
}

const list = byLabel.get('2-34');
list.stemHtml = list.stemHtml.replace(/&quot;&quot;ABC&quot;&quot;/g, '&quot;ABC&quot;').replace(/""ABC""/g, '"ABC"');
list.stemText = list.stemText.replace(/""ABC""/g, '"ABC"');
Object.assign(list.reference, { explanation: 'ArrayList 允许重复元素；依次加入三个对象后，size() 返回 3。', remark: '' });
for (const q of bank.questions) {
  if (contexts[q.label]) q.reference.remark = '';
  if (q.type === 'tf') q.reference.answerText = q.reference.answerId === 'true' ? '正确' : '错误';
  if (q.type === 'single') q.reference.answerText = '原题选项 ' + (q.reference.answerIds || [q.reference.answerId]).join(' 或 ');
  if (q.type === 'function' && q.judge) {
    q.judge.version = version;
    q.reference.codeScope = q.reference.codeScope.replace('Main 由裁判提供', (q.judge.entry || 'Main') + ' 由裁判提供');
  }
}
bank.referenceVersion = version;
bank.judgeVersion = version;
bank.referenceNotice = '参考答案按 Java 8/17 语境核对；有特殊前提的题目会在题面注明。部分原单选题有多项合理答案，选择其中一项即可。';
fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
fs.writeFileSync(output, JSON.stringify(bank, null, 2) + '\n');
console.log(JSON.stringify({ questions: bank.questions.length, objective: bank.questions.filter(q => q.reference.autoScore).length,
  correctedKeys: Object.keys(corrections), multipleAnswers: Object.keys(alternatives), clarifiedContexts: Object.keys(contexts) }, null, 2));
