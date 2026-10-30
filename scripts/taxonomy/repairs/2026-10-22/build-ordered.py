"""Restore imported sample blocks and image MIME types in problem-number order."""
from pathlib import Path
from collections import Counter
import argparse
import base64
import gzip
import hashlib
import html
import json
import re
import sys

from bs4 import BeautifulSoup, NavigableString
from build import source_markdown

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]


def sha(value):
    return hashlib.sha256(value.encode('utf-8') if isinstance(value,str) else value).hexdigest()


def unpack(content):
    try:
        parsed=json.loads(content)
        if isinstance(parsed,dict):
            key=next(iter(parsed))
            return parsed[key],lambda value:json.dumps({**parsed,key:value},ensure_ascii=False,separators=(',',':'))
    except ValueError:
        pass
    return content,lambda value:value


def pre_text(pre):
    # The source <br> means a newline; inline spans are individual text fragments.
    copy=BeautifulSoup(str(pre),'html.parser').find('pre')
    for br in copy.find_all('br'):
        br.replace_with(NavigableString('\n'))
    return copy.get_text()


def fix_cf_samples(source):
    soup=BeautifulSoup(source,'html.parser')
    containers=soup.select('.sample-tests')
    if not containers:
        return source,[],False
    recovered=[]
    for container in containers:
        inputs=[pre_text(box.find('pre')) for box in container.select('.input') if box.find('pre')]
        outputs=[pre_text(box.find('pre')) for box in container.select('.output') if box.find('pre')]
        assert len(inputs)==len(outputs),(inputs,outputs)
        parts=['<h2>Examples</h2>']
        if not inputs:
            parts=['<p>原始题目未提供输入输出样例。</p>']
        for inp,out in zip(inputs,outputs):
            assert inp.strip() and out.strip()
            recovered.append({'input':inp,'output':out})
            number=len(recovered)
            parts.extend([f'<pre><code class="language-input{number}">'+html.escape(inp,quote=False)+'</code></pre>',f'<pre><code class="language-output{number}">'+html.escape(out,quote=False)+'</code></pre>'])
        container.replace_with(BeautifulSoup('\n'.join(parts),'html.parser'))
    for code in list(soup.select('pre code')):
        if not code.get_text().strip():
            code.parent.decompose()
    for header in soup.select('.problem-statement > .header'):
        header.decompose()
    for title in list(soup.select('.section-title')):
        title.name='h2'
        title.attrs={}
    new=str(soup)
    actual=BeautifulSoup(new,'html.parser')
    for number,sample in enumerate(recovered,start=1):
        for kind in ['input','output']:
            assert actual.select_one(f'code.language-{kind}{number}').get_text()==sample[kind]
    return new,recovered,not recovered


def fix_code_fences(source):
    pattern=r'(?m)^[ \t]*(`{3,})[ \t]*\n([\s\S]*?)^[ \t]*\1[ \t]*(?=\n|$)'
    count=0
    def replace(match):
        nonlocal count
        count+=1
        code=match[2].replace(r'\[','[').replace(r'\]',']')
        return '<pre><code>'+html.escape(code,quote=False)+'</code></pre>'
    result=re.sub(pattern,replace,source)
    assert count>0
    return result


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    parser=argparse.ArgumentParser()
    parser.add_argument('--sources',type=Path,default=ROOT/'qa/ordered-system-sources.json.gz')
    parser.add_argument('--assets',type=Path,default=ROOT/'qa/ordered-assets.json')
    args=parser.parse_args()
    rows=json.loads(gzip.decompress(args.sources.read_bytes()))
    assets=json.loads(args.assets.read_text(encoding='utf-8'))
    by_id={}
    for file in assets:
        by_id.setdefault(file['docId'],[]).append(file)
    changes=[];recovery=[];counts=Counter();official={}
    fences={3894,3899,3923,3930,3993,4018}
    for row in sorted(rows,key=lambda row:row['docId']):
        doc_id=row['docId'];source,pack=unpack(row['content']);body=source
        reasons=[];samples=[];no_samples=False;native=False
        if doc_id in [698,731,822]:
            original=json.loads((ROOT/'qa'/f'problem-loj-ordered-{doc_id}.json').read_text(encoding='utf-8'))
            official[str(doc_id)]=original
            body=source_markdown(original,row)
            # Keep the stored original illustration, independently verified by file signature.
            if doc_id==822:
                match=re.search(r'!\[[^\]]*\]\(([^)]+)\)',body)
                assert match
                body=body[:match.start()]+'![深海机器人网格示意图](file://3fiMjX3Vpng)'+body[match.end():]
            native=True;reasons.append('loj-table-formula')
        if 843<=doc_id<=3675:
            repaired,samples,no_samples=fix_cf_samples(body)
            if repaired!=body:
                body=repaired;reasons.append('cf-sample-blocks')
                recovery.append({'docId':doc_id,'pairs':len(samples),'sha256':sha(json.dumps(samples,ensure_ascii=False,separators=(',',':'))),'noSourceSamples':no_samples})
        if doc_id in fences:
            body=fix_code_fences(body.replace('\r\n','\n').replace('\r','\n'))
            if doc_id==3894:
                body=body.replace(r'\[a/b\]','<code>floor(a/b)</code>')
            if doc_id==3899:
                body=body.replace('1×11×1','1×1').replace('N2个整数','N²个整数')
            if doc_id==3923:
                body=re.sub(r'`([^`\n]+)`',lambda m:'<code>'+html.escape(m[1],quote=False)+'</code>',body)
                body=body.replace('一组测试测试数据','一组测试数据')
            if doc_id==4018:
                body=body.replace(r'\*','*')
                # Original animated GIF is restored as an attachment in a later source-specific step.
            reasons.append('code-fence')
        if doc_id==4111:
            match=re.search(r'\n([.$]{100,})\n',body)
            assert match and len(match[1])==17*17
            diagram='\n'.join(match[1][offset:offset+17] for offset in range(0,len(match[1]),17))
            body=body[:match.start(1)]+'<pre><code>'+diagram+'</code></pre>'+body[match.end(1):]
            reasons.append('ascii-diagram')
        if doc_id==4194:
            start=body.index('---------------------------------------------------COUNTRY',body.index('<h2>说明/提示'))
            end=body.index('注意：输出时',start)
            body=body[:start]+'\n<p>格式与上方样例一致。</p>\n'+body[end:]
            reasons.append('duplicate-table')
        copies=[]
        if doc_id==4018:
            image=(ROOT/'qa/cow-1343-http.body').read_bytes()
            assert image[:3]==b'GIF'
            body=body.replace('![](pic/1343.gif)','<img src="/p/4018/file/cow-1343-20261022.gif" alt="两个牧场的坐标与道路示意图">')
            copies.append({'name':'cow-1343-20261022.gif','expectedSha256':None,'sha256':sha(image),'size':len(image),'base64':base64.b64encode(image).decode('ascii')})
            reasons.append('original-ybt-figure')
        for file in by_id.get(doc_id,[]):
            old=file['sourceName'];new=file['name']
            if f'file://{old}' not in body:
                continue
            body=body.replace(f'file://{old}',f'/p/{doc_id}/file/{new}')
            copies.append({'name':new,'sourceName':old,'sourceSha256':file['sha256'],'expectedSha256':None,'sha256':file['sha256'],'size':file['size']})
        if copies:
            reasons.append('image-content-type')
        if not reasons:
            continue
        content=pack(body)
        assert content!=row['content']
        patch={'domainId':'system','docId':doc_id,'pid':row.get('pid'),'title':row['title'],'category':'ordered-import-repair',
               'source':'Stored original CF samples and original image bytes; official LOJ content where indicated',
               'reasons':reasons,'expected':{'contentSha256':sha(row['content']),'html':row.get('html')},
               'content':content,'html':False if native else row.get('html'),
               'newContentSha256':sha(content),
               'preserveTestdata':[{key:file.get(key) for key in ['name','size','etag']} for file in row.get('data',[])],
               'preserveConfig':row.get('config')}
        if copies:
            patch['additionalFiles']=copies
        if no_samples:
            patch['allowNoSamples']=True
        if 'language-input' in source:
            soup=BeautifulSoup(body,'html.parser')
            input_codes=soup.select('pre code[class*=language-input]')
            if input_codes and all(not code.get_text().strip() for code in input_codes):
                patch['allowEmptyInput']=True
        if doc_id in [1131,1353,3518]:
            patch['allowLiteralDollar']=True
        counts.update(reasons)
        changes.append(patch)
    batch={'version':1,'date':'2026-10-22','order':'system/docId ascending','problems':changes}
    compressed=gzip.compress(json.dumps(batch,ensure_ascii=False,separators=(',',':')).encode(),compresslevel=9,mtime=0)
    (HERE/'ordered-statements.json.gz').write_bytes(compressed)
    manifest={'version':1,'date':'2026-10-22','batchSha256':sha(compressed),'problems':[]}
    for row in changes:
        manifest['problems'].append({key:value for key,value in row.items() if key not in ['content','preserveTestdata','preserveConfig']})
    (HERE/'ordered-statements.manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (HERE/'ordered-sample-recovery.json').write_text(json.dumps(recovery,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (HERE/'ordered-loj-sources.json').write_text(json.dumps(official,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('BUILT_ORDERED',len(changes),'problems',dict(counts),'samplePairs',sum(r['pairs'] for r in recovery),'bytes',len(compressed),'imageCopies',sum(len(p.get('additionalFiles',[])) for p in changes))


if __name__=='__main__':
    main()
