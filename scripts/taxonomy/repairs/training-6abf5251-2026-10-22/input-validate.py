"""Validate language-basics inputs against structure and stated constraints."""
from pathlib import Path
import argparse
import gzip
import hashlib
import json
import math
import re

def validate(pid,text):
    if 4023<=pid<=4071:
        from importlib.util import spec_from_file_location,module_from_spec
        spec=spec_from_file_location('chapter8',Path(__file__).with_name('input-chapter8.py'));mod=module_from_spec(spec);spec.loader.exec_module(mod)
        return mod.validate(pid,text)
    if 3973<=pid<=4022:
        from importlib.util import spec_from_file_location,module_from_spec
        spec=spec_from_file_location('chapter7',Path(__file__).with_name('input-chapter7.py'));mod=module_from_spec(spec);spec.loader.exec_module(mod)
        return mod.validate(pid,text)
    if 3923<=pid<=3972:
        from importlib.util import spec_from_file_location,module_from_spec
        spec=spec_from_file_location('chapter6',Path(__file__).with_name('input-chapter6.py'));mod=module_from_spec(spec);spec.loader.exec_module(mod)
        return mod.validate(pid,text)
    if 3874<=pid<=3922:
        from importlib.util import spec_from_file_location,module_from_spec
        spec=spec_from_file_location('chapter5',Path(__file__).with_name('input-chapter5.py'));mod=module_from_spec(spec);spec.loader.exec_module(mod)
        return mod.validate(pid,text)
    if 3826<=pid<=3873:
        from importlib.util import spec_from_file_location,module_from_spec
        spec=spec_from_file_location('chapter4',Path(__file__).with_name('input-chapter4.py'));mod=module_from_spec(spec);spec.loader.exec_module(mod)
        return mod.validate(pid,text)
    if 3776<=pid<=3825 or pid in [4929,4930,4931]:
        from importlib.util import spec_from_file_location,module_from_spec
        spec=spec_from_file_location('chapter3',Path(__file__).with_name('input-chapter3.py'));mod=module_from_spec(spec);spec.loader.exec_module(mod)
        return mod.validate(pid,text)
    if 3726<=pid<=3775 or pid==4928:
        from importlib.util import spec_from_file_location,module_from_spec
        spec=spec_from_file_location('chapter2',Path(__file__).with_name('input-chapter2.py'));mod=module_from_spec(spec);spec.loader.exec_module(mod)
        return mod.validate(pid,text)
    tokens=text.split()
    count={3676:2,3678:3,3679:3,3681:4,3682:1,3683:3,3684:3,3685:2,3686:2,3687:2,3688:5,3689:1,3690:1,3691:2,3695:1,3697:1,3698:1,3700:1,3701:1,3702:4,3703:1,3705:2,3706:1,3707:1,3708:2,3709:4,3710:6,3711:3,3712:2,3713:1,3714:3,3715:1,3716:1,3717:1,3719:2,3720:1,3721:2,3722:1,3723:1,3724:2,3725:1}
    if pid in [3677,3692,3693,3694,3699]:
        assert not tokens,'no input expected';return
    if pid in [3680,3696,3704,3718]:
        assert len(tokens)==1 and len(tokens[0])==1 and 33<=ord(tokens[0])<=126,'one visible ASCII character expected';return
    assert len(tokens)==count[pid],f'{count[pid]} tokens expected, got {len(tokens)}'
    integers={3676,3678,3679,3681,3683,3684,3685,3686,3687,3697,3698,3707,3708,3711,3712,3713,3714,3715,3717,3719,3720,3721,3722,3723,3724,3725}
    if pid in integers:
        assert all(re.fullmatch(r'[+-]?\d+',x) for x in tokens),'integer token expected'
        values=list(map(int,tokens))
    elif pid==3702:
        assert len(tokens[0])==1 and 33<=ord(tokens[0])<=126
        assert re.fullmatch(r'[+-]?\d+',tokens[1])
        assert -2**31<=int(tokens[1])<2**31
        assert all(math.isfinite(float(x)) for x in tokens[2:])
        return
    else:
        values=list(map(float,tokens));assert all(math.isfinite(x) for x in values),'finite numbers expected'
    if pid==3678:assert all(-2**31<=x<2**31 for x in values)
    if pid==3681:
        x,a,y,b=values;assert all(1<=z<=10000 for z in values) and x>y and a<b and a*x<b*y
    if pid==3682:assert values[0]!=0
    if pid in [3683,3684]:assert all(-10000<x<10000 for x in values)
    if pid==3684:assert values[2]!=0
    if pid in [3685,3686]:assert values[1]!=0
    if pid==3687:assert values[0]>0 and 0<=values[1]<=values[0]
    if pid==3688:assert all(abs(x)<=100 for x in values)
    if pid==3689:assert values[0]>=-459.67
    if pid==3690:assert 0<values[0]<=10000
    if pid==3691:assert all(x>0 for x in values)
    if pid==3695:assert -2**31<values[0]<2**31
    if pid==3697:assert 33<=values[0]<=126
    if pid==3698:assert -2**31<=values[0]<2**31
    if pid==3705:assert values[1]>0
    if pid==3706:assert 0<=values[0]<=100
    if pid==3707:assert 100<=values[0]<=999
    if pid==3708:assert all(x>0 for x in values)
    if pid==3709:assert all(abs(x)<=10000 for x in values)
    if pid==3711:assert -100<=values[0]<=100 and -100<=values[1]<=100 and 1<=values[2]<=1000
    if pid==3712:assert all(1<=x<=50000 for x in values)
    if pid==3713:assert 0<=values[0]<31
    if pid==3714:assert values[0]>=0 and values[1]>0 and values[2]>=0
    if pid==3715:assert abs(values[0])<=10**9
    if pid==3716:assert abs(values[0])<=10000
    if pid==3717:assert values[0]>0
    if pid==3719:assert 0<=values[0]<2**32 and -2**31<=values[1]<2**31
    if pid==3720:assert 1<=values[0]<=1000
    if pid==3721:assert all(x>=0 for x in values)
    if pid==3722:assert -1000000<values[0]<1000000
    if pid==3724:assert all(0<=x<=100 for x in values)
    if pid==3725:assert 1<=values[0]<=7

def main():
    p=argparse.ArgumentParser();p.add_argument('snapshot',type=Path);p.add_argument('--from-order',type=int,default=1);p.add_argument('--to-order',type=int,default=50);a=p.parse_args()
    rows=json.loads(gzip.decompress((a.snapshot/'inventory.json.gz').read_bytes()))['problems']
    results=[]
    for row in rows:
        if not a.from_order<=row['order']<=a.to_order:continue
        files=[];issues=[]
        for path in sorted((a.snapshot/'data'/str(row['docId'])/'testdata').glob('*.in')):
            raw=path.read_bytes();item=dict(name=path.name,sha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw),passed=True)
            try:validate(row['docId'],raw.decode('utf-8'))
            except Exception as e:item['passed']=False;issues.append(dict(name=path.name,error=str(e)))
            files.append(item)
        assert files,('data not downloaded',row['docId'])
        result=dict(order=row['order'],pid=row['docId'],files=files,issues=issues)
        results.append(result);print('TRAINING_INPUT',row['order'],row['docId'],'issues',issues,flush=True)
    out=a.snapshot/f'input-validation-{a.from_order}-{a.to_order}.json'
    out.write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
    print('TRAINING_INPUT_COMPLETE',len(results),'files',sum(len(r['files']) for r in results),'issues',sum(len(r['issues']) for r in results))

if __name__=='__main__':main()
