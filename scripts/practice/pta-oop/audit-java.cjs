'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const bank = require('./source/bank.json');
const core = require('./source/core.cjs');

const output = path.resolve(process.argv[2] || 'qa/pta-oop-2026-11-08/java-before');
const jdk = path.resolve(process.argv[3] || 'qa/pta-oop-2026-11-08/tools/jdk-17.0.21+9');
const executable = name => path.join(jdk, 'bin', name + (process.platform === 'win32' ? '.exe' : ''));
fs.mkdirSync(output, { recursive: true });

function decode(value) {
  return value.replace(/&#x([\da-f]+);/gi, (_, v) => String.fromCodePoint(parseInt(v, 16)))
    .replace(/&#(\d+);/g, (_, v) => String.fromCodePoint(Number(v)))
    .replace(/&(lt|gt|quot|apos|nbsp|amp);/g, (_, v) => ({ lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', amp: '&' }[v]));
}

function samples(q) {
  const input = [], expected = [];
  for (const match of q.stemHtml.matchAll(/<pre><code(?: class="language-([^"]+)")?>([\s\S]*?)<\/code><\/pre>/g)) {
    const lang = (match[1] || '').toLowerCase();
    const value = decode(match[2]);
    if (/^in\d*$/.test(lang)) input.push(value);
    if (/^out\d*$/.test(lang)) expected.push(value);
  }
  return input.map((value, index) => ({ input: value, expected: expected[index] })).filter(item => item.expected !== undefined);
}

const entries = bank.questions.filter(q => q.judge).map(q => ({ q, label: q.label, code: core.submissionCode(q,
  q.type === 'fill' ? q.reference.blanks : [q.reference.code]), samples: samples(q) }));
const eq = bank.questions.find(q => q.label === '6-4');
entries.push({ q: eq, label: '6-4-leading-override', code: core.submissionCode(eq, ['@Override\n' + eq.reference.code]), samples: samples(eq) });
const compute = bank.questions.find(q => q.label === '6-21');
entries.push({ q: compute, label: '6-21-import', code: core.submissionCode(compute, ['import java.util.Objects;\n' + compute.reference.code]), samples: samples(compute) });
for (const label of ['6-1', '6-28']) {
  const q = bank.questions.find(q => q.label === label);
  const fragment = q.reference.code.replace(/^class /, 'public class ');
  entries.push({ q, label: label + '-public-helper', code: core.submissionCode(q, [fragment]), samples: samples(q) });
}
entries.push({ q: { judge: { entry: 'LanguageWitness' } }, label: 'language-witness',
  code: fs.readFileSync(path.join(__dirname, 'fixtures', 'LanguageWitness.java'), 'utf8'),
  samples: [{ input: '', expected: 'this, inherited interfaces, default methods, abstract classes and final locals verified\n' }] });
for (const item of entries) {
  const dir = path.join(output, item.label);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, (item.q.judge.entry || 'Main') + '.java'), item.code);
}
fs.writeFileSync(path.join(output, 'directories.txt'), entries.map(item => path.join(output, item.label) + '\t' + (item.q.judge.entry || 'Main')).join('\n'));
fs.writeFileSync(path.join(output, 'CompilerAudit.java'), `import javax.tools.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
public class CompilerAudit {
  public static void main(String[] args) throws Exception {
    JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
    for (String line : Files.readAllLines(Path.of(args[0]), StandardCharsets.UTF_8)) {
      String[] parts = line.split("\\t");
      String dir = parts[0];
      DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
      try (StandardJavaFileManager files = compiler.getStandardFileManager(diagnostics, Locale.ROOT, StandardCharsets.UTF_8)) {
        Iterable<? extends JavaFileObject> units = files.getJavaFileObjects(Path.of(dir, parts[1] + ".java").toFile());
        boolean ok = compiler.getTask(null, files, diagnostics, Arrays.asList("-encoding", "UTF-8", "--release", "17", "-classpath", dir, "-d", dir), null, units).call();
        StringBuilder errors = new StringBuilder();
        for (Diagnostic<?> diagnostic : diagnostics.getDiagnostics()) {
          if (diagnostic.getKind() == Diagnostic.Kind.ERROR) errors.append(diagnostic.getLineNumber()).append(": ").append(diagnostic.getMessage(Locale.ROOT)).append("\\n");
        }
        System.out.println(Path.of(dir).getFileName() + "\\t" + ok + "\\t" + Base64.getEncoder().encodeToString(errors.toString().getBytes(StandardCharsets.UTF_8)));
      }
    }
  }
}
`);
const compiled = spawnSync(executable('javac'), ['-encoding', 'UTF-8', path.join(output, 'CompilerAudit.java')], { encoding: 'utf8', timeout: 30000, windowsHide: true });
if (compiled.status !== 0) throw new Error(compiled.stderr || compiled.error);
const result = spawnSync(executable('java'), ['-Dfile.encoding=UTF-8', '-cp', output, 'CompilerAudit', path.join(output, 'directories.txt')], { encoding: 'utf8', timeout: 120000, windowsHide: true });
if (result.status !== 0) throw new Error(result.stderr || result.error);
const byLabel = new Map(result.stdout.trim().split('\n').map(line => {
  const [label, success, error] = line.trim().split('\t');
  return [label, { compiled: success === 'true', errors: Buffer.from(error || '', 'base64').toString('utf8') }];
}));
const report = [];
for (const item of entries) {
  const compilation = byLabel.get(item.label);
  const runs = [];
  if (compilation.compiled) for (const sample of item.samples) {
    const run = spawnSync(executable('java'), ['-Dfile.encoding=UTF-8', '-cp', path.join(output, item.label), item.q.judge.entry || 'Main'],
      { input: sample.input + '\n', encoding: 'utf8', timeout: 7000, windowsHide: true });
    const normalized = value => value.replace(/\r\n/g, '\n').trimEnd();
    const actualLines = normalized(run.stdout).split('\n'), expectedLines = normalized(sample.expected).split('\n');
    const last = expectedLines.at(-1);
    const placeholder = last === '标识信息' || last === '//这行显示Computer对象toString方法';
    const resolvesPlaceholder = placeholder && run.status === 0 && actualLines.length === expectedLines.length
      && actualLines.slice(0, -1).join('\n') === expectedLines.slice(0, -1).join('\n')
      && (last.startsWith('//') ? actualLines.at(-1) === 'Computer(test stub)'
        : /^[\w$.-]+(?: true)?$/.test(actualLines.at(-1)));
    runs.push({ ...sample, actual: run.stdout, stderr: run.stderr, status: run.status,
      exact: run.status === 0 && normalized(run.stdout) === normalized(sample.expected),
      resolvesPlaceholder, passed: run.status === 0 && (normalized(run.stdout) === normalized(sample.expected) || resolvesPlaceholder) });
  }
  report.push({ label: item.label, ...compilation, samples: runs });
}
fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ total: report.length, compiled: report.filter(r => r.compiled).length,
  sampleCount: report.flatMap(r => r.samples).length, exactMatches: report.flatMap(r => r.samples).filter(r => r.exact).length,
  resolvedPlaceholders: report.flatMap(r => r.samples).filter(r => r.resolvesPlaceholder).length,
  failures: report.filter(r => !r.compiled || r.samples.some(s => !s.passed)) }, null, 2));
