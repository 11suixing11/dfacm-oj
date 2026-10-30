"""Report concrete statement-rendering issues in domain and problem-number order."""
from pathlib import Path
from collections import Counter
import argparse
import gzip
import json
import re
import sys
from html.parser import HTMLParser

HERE=Path(__file__).resolve().parent


class StatementParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack=[]
        self.visible=[]
        self.samples=[]
        self.katex_errors=[]

    def handle_starttag(self,tag,attributes):
        attrs=dict(attributes)
        classes=set((attrs.get('class') or '').split())
        inherited=self.stack[-1]['skip'] if self.stack else False
        frame={'tag':tag,'skip':inherited or tag in ['pre','code','script','style'] or 'katex' in classes,'sample':None,'error':None}
        if tag=='code' and any(re.fullmatch(r'language-(input|output)\d+',name) for name in classes):
            frame['sample']={'class':attrs.get('class'),'text':[]}
            self.samples.append(frame['sample'])
        if 'katex-error' in classes:
            frame['error']={'title':attrs.get('title'),'text':[]}
            self.katex_errors.append(frame['error'])
        if tag not in ['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']:
            self.stack.append(frame)

    def handle_endtag(self,tag):
        for i in range(len(self.stack)-1,-1,-1):
            if self.stack[i]['tag']==tag:
                del self.stack[i:]
                return

    def handle_data(self,data):
        if not self.stack or not self.stack[-1]['skip']:
            self.visible.append(data)
        for frame in self.stack:
            if frame['sample'] is not None:
                frame['sample']['text'].append(data)
            if frame['error'] is not None:
                frame['error']['text'].append(data)

    def handle_startendtag(self,tag,attributes):
        self.handle_starttag(tag,attributes)
        self.handle_endtag(tag)


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    parser=argparse.ArgumentParser()
    parser.add_argument('inventory',type=Path)
    parser.add_argument('--out',type=Path,default=HERE/'ordered-audit.json')
    args=parser.parse_args()
    rows=json.loads(gzip.decompress(args.inventory.read_bytes()))
    issues=[]
    counts=Counter()
    for row in rows:
        problems=[]
        if row.get('renderError'):
            problems.append({'kind':'render-error','evidence':row['renderError']})
        dom=StatementParser()
        dom.feed(row['rendered'] or '<div></div>')
        if dom.katex_errors:
            problems.append({'kind':'katex-error','evidence':[dict(title=e['title'],text=''.join(e['text'])[:160]) for e in dom.katex_errors]})
        empty=[e['class'] for e in dom.samples if not ''.join(e['text']).strip()]
        if empty:
            problems.append({'kind':'empty-samples','evidence':empty})
        source=row.get('selected') or ''
        files={e.get('name') or e.get('_id') for e in row.get('additional_file',[])+row.get('data',[])}
        missing=[]
        for match in re.finditer(r'<img\b[^>]*\bsrc=["\']([^"\']+)',source,re.I):
            src=match[1]
            if src.startswith('file:') or (src.startswith('/p/') and '/file/' in src and src.rsplit('/',1)[-1] not in files):
                missing.append(src)
        if missing:
            problems.append({'kind':'missing-image','evidence':missing})
        visible=''.join(dom.visible)
        if '\ufffd' in visible:
            problems.append({'kind':'replacement-character','evidence':visible.count('\ufffd')})
        math_markers=list(re.finditer(r'\$|\\(?:frac|sum|sqrt|begin|mathbb|cdot|times|leq|geq|text|mathrm|tfrac)\b',visible))
        if math_markers:
            snippets=[visible[max(0,m.start()-35):m.start()+140].replace('\n',' ') for m in math_markers[:8]]
            problems.append({'kind':'literal-math-candidate','evidence':snippets})
        if '```' in visible or re.search(r'(?m)^#{1,4}\s',visible):
            snippets=[visible[max(0,m.start()-40):m.start()+120].replace('\n',' ') for m in re.finditer(r'```|(?m:^#{1,4}\s)',visible)][:5]
            problems.append({'kind':'literal-markdown','evidence':snippets})
        if problems:
            entry={'domainId':row['domainId'],'docId':row['docId'],'pid':row.get('pid'),'title':row['title'],'hidden':row.get('hidden',False),'issues':problems}
            issues.append(entry)
            counts.update(p['kind'] for p in problems)
    issues.sort(key=lambda e:(0 if e['domainId']=='system' else 1,e['docId']))
    report={'date':'2026-10-22','order':'system/docId ascending, then poj/docId ascending','scanned':len(rows),'counts':dict(sorted(counts.items())),'issues':issues}
    args.out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('ORDERED_AUDIT',len(rows),'problems',len(issues),'candidates',json.dumps(dict(counts),ensure_ascii=False))
    serious=[e for e in issues if any(p['kind'] in ['katex-error','render-error','replacement-character','literal-markdown','empty-samples'] for p in e['issues'])]
    print('STRUCTURAL_CANDIDATES',len(serious))
    for entry in serious[:30]:
        print(json.dumps(entry,ensure_ascii=False))
    print('FIRST_CANDIDATES')
    for entry in issues[:22]:
        print(json.dumps(entry,ensure_ascii=False))


if __name__=='__main__':
    main()
