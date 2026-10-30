"""Inspect the actual production renderer output before permitting writes."""
from pathlib import Path
import argparse
import hashlib
import gzip
import json
import re
import sys

from bs4 import BeautifulSoup

HERE = Path(__file__).resolve().parent


def plain_content(content):
    try:
        value = json.loads(content)
        return next(iter(value.values())) if isinstance(value, dict) else value
    except ValueError:
        return content


def normalize_newlines(value):
    return value.replace('\r\n', '\n').replace('\r', '\n')


def markdown_samples(content):
    result = {}
    for match in re.finditer(r'(?m)^(`{3,})(input|output)(\d+)\n([\s\S]*?)^\1\s*$', content):
        result[(match[2], int(match[3]))] = match[4]
    return result


def html_samples(content):
    soup = BeautifulSoup(content, 'lxml')
    result = {}
    for code in soup.select('pre code'):
        for name in code.get('class', []):
            match = re.fullmatch(r'language-(input|output)(\d+)', name)
            if match:
                result[(match[1], int(match[2]))] = normalize_newlines(code.get_text())
    return result


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser()
    parser.add_argument('rendered', type=Path)
    parser.add_argument('--batch', type=Path, default=HERE / 'statements.json')
    parser.add_argument('--out', type=Path)
    parser.add_argument('--served', action='store_true')
    args = parser.parse_args()
    batch_bytes = args.batch.read_bytes()
    batch = json.loads(gzip.decompress(batch_bytes) if args.batch.suffix == '.gz' else batch_bytes)
    render_bytes = args.rendered.read_bytes()
    rendered = json.loads(gzip.decompress(render_bytes) if args.rendered.suffix == '.gz' else render_bytes)
    by_id = {(row['domainId'], row['docId']): row for row in rendered}
    problems, errors = [], []
    for patch in batch['problems']:
        key = (patch['domainId'], patch['docId'])
        row = by_id[key]
        assert row['content'] == patch['content'], key
        fragment = row['html']
        if args.served:
            page = BeautifulSoup(fragment, 'lxml')
            description = page.select_one('[data-fragment-id="problem-description"]')
            assert description is not None, (key, 'No statement fragment')
            fragment = str(description)
        soup = BeautifulSoup(fragment, 'lxml')
        failures = []
        katex_errors = soup.select('.katex-error')
        if katex_errors:
            failures.append({'kind': 'katex-error', 'details': [(e.get('title'), e.get_text()) for e in katex_errors]})
        if soup.select('code.swpu-math'):
            failures.append({'kind': 'flattened-math'})
        if '\ufffd' in soup.get_text() or '\x0b' in soup.get_text():
            failures.append({'kind': 'bad-character'})
        actual_samples = html_samples(fragment)
        source = plain_content(patch['content'])
        expected_samples = html_samples(source)
        if not patch['html']:
            for sample, value in markdown_samples(source).items():
                if sample in expected_samples and expected_samples[sample] != value:
                    failures.append({'kind': 'duplicate-source-sample', 'sample': sample})
                expected_samples[sample] = value
        if not expected_samples and not patch.get('allowNoSamples'):
            failures.append({'kind': 'no-samples'})
        for sample, expected in expected_samples.items():
            actual = actual_samples.get(sample)
            if actual is None or (actual != expected and actual != expected + '\n'):
                failures.append({'kind': 'sample-bytes', 'sample': sample, 'expectedLength': len(expected), 'actualLength': len(actual or '')})
            if not expected.strip() and not (sample[0] == 'input' and patch.get('allowEmptyInput')) and patch['docId'] not in [3677]:
                failures.append({'kind': 'empty-sample', 'sample': sample})
        if set(expected_samples) != set(actual_samples):
            failures.append({'kind': 'sample-count'})
        if patch['domainId'] == 'poj' and patch['docId'] == 115:
            grammar = next((code.get_text() for code in soup.select('pre code') if '<formula>' in code.get_text()), '')
            if '<number>' not in grammar or '<sequence>' not in grammar or len(grammar.splitlines()) != 7:
                failures.append({'kind': 'grammar-not-visible'})
        math_count = len(soup.select('.katex-html'))
        sample_count = len(actual_samples) // 2
        if patch['category'] in ['loj-math', 'ybt-math'] and math_count == 0:
            failures.append({'kind': 'no-rendered-math'})
        images = [img.get('src') for img in soup.select('img')]
        for element in soup.select('pre, code, .katex, .katex-mathml, script, style'):
            element.decompose()
        visible = soup.get_text()
        if '$' in visible and not patch.get('allowLiteralDollar'):
            snippets = [visible[max(0, m.start()-55):m.start()+100] for m in re.finditer(r'\$', visible)][:10]
            failures.append({'kind': 'literal-math-delimiter', 'details': snippets})
        if '\\frac' in visible or '\\sum' in visible or '\\begin' in visible:
            failures.append({'kind': 'literal-tex'})
        if '```' in visible:
            failures.append({'kind': 'literal-code-fence'})
        report = {'domainId': key[0], 'docId': key[1], 'math': math_count, 'samples': sample_count, 'images': images, 'failures': failures}
        problems.append(report)
        if failures:
            errors.extend([{'domainId': key[0], 'docId': key[1], **failure} for failure in failures])
            print('FAILED', key, json.dumps(failures, ensure_ascii=False))
    if len(rendered) != len(batch['problems']):
        errors.append({'kind': 'problem-count'})
    report = {'batchSha256': hashlib.sha256(batch_bytes).hexdigest(), 'problems': len(problems), 'errors': len(errors), 'results': problems, 'failures': errors}
    batch_stem = re.sub(r'\.json(?:\.gz)?$', '', args.batch.name)
    output = args.out or args.rendered.with_name(batch_stem + '-validated.json')
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('VALIDATED', len(problems), 'problems;', sum(p['math'] for p in problems), 'math expressions;', sum(p['samples'] for p in problems), 'sample pairs;', len(errors), 'errors')
    if errors:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
