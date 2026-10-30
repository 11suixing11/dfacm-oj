"""Build guarded statement repairs from recovered official sources and current snapshots."""
from pathlib import Path
import argparse
import base64
import hashlib
import html
import json
import re

ROOT = Path(__file__).resolve().parents[4]
DEST = Path(__file__).resolve().parent
LOJ_IDS = {
    629: 113, 640: 526, 641: 528, 643: 541, 647: 552, 648: 555,
    659: 2031, 662: 2042, 664: 2045, 667: 2058, 672: 2083,
    673: 2085, 675: 2093, 677: 2098, 679: 2104, 685: 2117,
    687: 2122, 691: 2128, 692: 2131, 708: 2183, 710: 2191,
    717: 2213, 722: 2220, 732: 2253, 735: 2273, 736: 2280,
    737: 2290, 739: 2304, 741: 2314, 743: 2318, 746: 2325,
    748: 2331, 751: 2340, 752: 2356, 758: 2378, 770: 6017,
    773: 6024, 774: 6026, 783: 6053, 808: 6172, 816: 6206,
    825: 6229, 836: 6257, 838: 6268,
}


def digest(value):
    if isinstance(value, str):
        value = value.encode('utf-8')
    return hashlib.sha256(value).hexdigest()


def lf(text):
    return text.replace('\r\n', '\n').replace('\r', '\n')


def dump(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def code_block(text, language):
    text = lf(text)
    fence = '`' * max(3, max((len(m.group(0)) + 1 for m in re.finditer(r'`+', text)), default=3))
    return f'{fence}{language}\n{text}' + ('' if text.endswith('\n') else '\n') + fence


def source_markdown(source, local):
    sections = source['localizedContentsOfLocale']['contentSections']
    samples = source.get('samples', [])
    rendered = []
    used_samples = set()
    attachments = {entry['name'] for entry in local.get('additional_file', [])}
    for section in sections:
        rendered.append('## ' + section['sectionTitle'])
        if section['type'] == 'Sample':
            sample_id = section['sampleId']
            assert 0 <= sample_id < len(samples), (local['docId'], sample_id)
            sample = samples[sample_id]
            assert 'inputData' in sample and 'outputData' in sample
            number = len(used_samples) + 1
            assert sample_id not in used_samples
            used_samples.add(sample_id)
            rendered.extend([code_block(sample['inputData'], f'input{number}'), code_block(sample['outputData'], f'output{number}')])
        else:
            assert section['type'] == 'Text', section['type']
        text = lf(section.get('text', '')).strip()
        # This historical link points at a sample absent from the imported package.
        # The recovered API sample above is complete and remains visible instead.
        if local['docId'] == 751 and not any('walk2' in name for name in attachments):
            text = text.replace('见附加文件下的 `walk/walk2.in` 与 `walk/walk2.ans`。', '')
        if local['docId'] == 643 and not attachments:
            text = text.replace('（也可以在附加文件中下载）', '')
            text = text.replace('请在页面上方的附加文件中下载。', '')
        if text:
            rendered.append(text)
    assert len(used_samples) == len(samples), (local['docId'], 'Unused samples')
    rendered.extend(['## 来源', f"[LibreOJ #{source['meta']['displayId']}](https://loj.ac/p/{source['meta']['displayId']})"])
    return '\n\n'.join(rendered) + '\n'


def repaired_poj(doc_id, raw):
    languages = json.loads(raw)
    body = languages['en']
    if doc_id in [38, 180]:
        body, count = re.subn(r'<p>\ufffd(.*?)</p>', r'<li>\1</li>', body, flags=re.S)
        assert count == 2
        body = re.sub(r'(<li>.*?</li><li>.*?</li>)', r'<ul>\1</ul>', body, count=1, flags=re.S)
        if doc_id == 38:
            body = body.replace('di\x0berent', 'different').replace('doesn抰', "doesn't")
    elif doc_id == 115:
        grammar = """<formula> ::= [<number>] <sequence> { '+' [<number>] <sequence> }
<sequence> ::= <element> [<number>] { <element> [<number>] }
<element> ::= <chem> | '(' <sequence> ')'
<chem> ::= <uppercase_letter> [ <lowercase_letter> ]
<uppercase_letter> ::= 'A'..'Z'
<lowercase_letter> ::= 'a'..'z'
<number> ::= '1'..'9' { '0'..'9' }"""
        first = body.index('<p>\ufffd<formula>')
        end = body.index('<p>Every distinct chemical element', first)
        body = body[:first] + '<pre><code>' + html.escape(grammar, quote=False) + '</code></pre>' + body[end:]
    elif doc_id == 266:
        assert '揹x dy\ufffdof' in body and '揝cenario #i:\ufffd' in body
        body = body.replace('揹x dy\ufffdof', '"dx dy" of').replace('揝cenario #i:\ufffd', '"Scenario #i:"')
        body = body.replace('competitor抯', "competitor's").replace('satisfying .-100', 'satisfying -100')
    elif doc_id == 347:
        assert '2, 3, \ufffd 2N' in body
        body = body.replace('2, 3, \ufffd 2N', '2, 3, ..., 2N')
    elif doc_id == 452:
        assert 'decimal digits 2\ufffd' in body
        body = body.replace('decimal digits 2\ufffd', 'decimal digits 2 through 9')
        body = body.replace('These words are iven', 'These words are given')
    elif doc_id == 470:
        assert 'courses \ufffdfrom course 1 to course P, each' in body
        body = body.replace('courses \ufffdfrom course 1 to course P, each', 'courses (from course 1 to course P), each')
        body = body.replace('you抣l', "you'll")
        body = body.replace('<p><ul></ul></p>', '<ul>').replace('</li></p><p><li>', '</li><li>')
        body = body.replace('<p><li>', '<li>').replace('</li></p><p></p>', '</li></ul>')
    elif doc_id == 523:
        assert 'only the value \ufffd.' in body
        body = body.replace('only the value \ufffd.', 'only the value -1.')
    else:
        raise ValueError(doc_id)
    assert '\ufffd' not in body
    languages['en'] = body
    return json.dumps(languages, ensure_ascii=False, separators=(',', ':'))


def repaired_4160(qa):
    sample_input = (qa / 'p4160-fixed-input1.txt').read_bytes().decode('utf-8')
    sample_output = (qa / 'p4160-original-output1.txt').read_bytes().decode('utf-8')
    return '\n\n'.join([
        '## 题目描述',
        '给你一段 C++ 代码，将其中的注释去除后输出剩余的代码。注释有以下两种形式：',
        '1. 行注释：以 `//` 开头，直到该行行尾。\n2. 块注释：以 `/*` 开头，以 `*/` 结束，可以跨越多行。',
        '输入的程序保证合法。除注释部分以外的字符都要保留，包括空格和换行符。行注释后的换行符需要保留；块注释内部的换行符随注释一起去除，块注释前后的换行符保留。',
        '## 输入格式', '一段 C++ 程序代码，读至输入结束。',
        '## 输出格式', '输出去掉注释部分后的程序。',
        '## 样例', code_block(sample_input, 'input1'), code_block(sample_output, 'output1'),
        '## 提示', '样例中块注释前后各有一个换行符，因此删除该注释后仍保留空行。',
        '## 来源', '蓝桥杯 算法提高：去注释（原始题目文档与测试数据）。',
    ]) + '\n'


YBT_4576 = r"""## 说明

约翰最近买了一个书架用来存放奶牛养殖书籍，但书架很快被存满了，只剩最顶层有空余。

约翰共有 $N$ 头奶牛（$1 \lt N \lt 20000$），每头奶牛有自己的高度 $h_i$（$1 \lt h_i \lt 10000$），$N$ 头奶牛的总高度为 $S$。书架高度为 $B$（$1 \lt B \lt S \lt 2000000007$）。

为了到达书架顶层，奶牛可以踩着其他奶牛的背，像叠罗汉一样，直到他们的总高度不低于书架高度。当然，奶牛越多，危险性越大。请找出达到书架顶层所需奶牛数目最少的方案。

## 输入格式

第 $1$ 行包含以空格隔开的整数 $N$ 和 $B$。

第 $2 \sim N+1$ 行，第 $i+1$ 行为整数 $h_i$。

## 输出格式

能达到书架高度所使用奶牛的最少数目。

## 样例

```input1
6 40
6
18
11
13
19
11
```

```output1
3
```
"""

YBT_4733 = r"""## 说明

已知长度最大为 $200$ 位的正整数 $n$，请求出 $2011^n$ 的后四位。

## 输入格式

第一行为一个正整数 $k$，代表有 $k$ 组数据（$k \leq 200$）。接下来的 $k$ 行，每行都有一个正整数 $n$，$n$ 的位数不超过 $200$。

## 输出格式

每一个 $n$ 的结果为一个整数，占一行。若不足 $4$ 位，去除高位多余的 $0$。

## 样例

```input1
3
5
28
792
```

```output1
1051
81
5521
```
"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--snapshots', type=Path, default=ROOT / 'qa')
    args = parser.parse_args()
    qa = args.snapshots
    changes, sources = [], {}

    def snapshot(domain, doc_id):
        return json.loads((qa / f'problem-current-{domain}-{doc_id}.json').read_text(encoding='utf-8'))

    def add(local, content, category, source, as_html=False, files=None):
        assert content != local['content']
        assert '\ufffd' not in content and '\x0b' not in content
        changes.append({
            'domainId': local['domainId'], 'docId': local['docId'], 'pid': local.get('pid'),
            'title': local['title'], 'category': category, 'source': source,
            'expected': {'contentSha256': digest(local['content']), 'html': local.get('html')},
            'content': content, 'html': as_html, 'newContentSha256': digest(content),
            **({'testdata': files} if files else {}),
        })

    for doc_id, source_id in LOJ_IDS.items():
        local = snapshot('system', doc_id)
        original = json.loads((qa / f'problem-loj-official-{doc_id}.json').read_text(encoding='utf-8'))
        assert original['meta']['displayId'] == source_id
        assert local['title'].startswith(f'#{source_id}.')
        sources[str(doc_id)] = original
        add(local, source_markdown(original, local), 'loj-math', f'https://loj.ac/p/{source_id}')

    for doc_id in [38, 115, 180, 266, 347, 452, 470, 523]:
        local = snapshot('poj', doc_id)
        add(local, repaired_poj(doc_id, local['content']), 'poj-encoding', 'http://poj.org/problem?id=' + local['pid'][1:], as_html=True)

    local = snapshot('system', 4160)
    current_files = {file['name']: file for file in local['files']}
    fixed_files = []
    for number in [1, 3]:
        name = f'{number}.in'
        before = base64.b64decode(current_files[name]['rawBase64'])
        after = (qa / f'p4160-fixed-input{number}.txt').read_bytes()
        fixed_files.append({'name': name, 'expectedSha256': digest(before), 'sha256': digest(after), 'base64': base64.b64encode(after).decode('ascii')})
    add(local, repaired_4160(qa), 'lanqiao-encoding', '蓝桥杯原始去注释.docx、input1.txt、input3.txt', files=fixed_files)

    assert [pow(2011, n, 10000) for n in [5, 28, 792]] == [1051, 81, 5521]
    assert sum(sorted([6, 18, 11, 13, 19, 11], reverse=True)[:2]) < 40
    assert sum(sorted([6, 18, 11, 13, 19, 11], reverse=True)[:3]) >= 40
    for doc_id, body in [(4576, YBT_4576), (4733, YBT_4733)]:
        add(snapshot('system', doc_id), json.dumps({'zh': body}, ensure_ascii=False, separators=(',', ':')), 'ybt-math', f'ybtbas/{snapshot("system", doc_id)["pid"]}')
    dump(DEST / 'loj-sources.json', sources)
    dump(DEST / 'statements.json', {'version': 1, 'date': '2026-10-22', 'problems': changes})
    print('BUILT', len(changes), 'statements;', sum(len(p.get('testdata', [])) for p in changes), 'testdata replacements')


if __name__ == '__main__':
    main()
