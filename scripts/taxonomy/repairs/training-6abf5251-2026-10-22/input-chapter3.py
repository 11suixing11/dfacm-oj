"""Structural and semantic input validation for chapter 3."""
import math,re
def validate(pid,text):
    assert '\x00' not in text,'NUL byte';t=text.split();line=text.removesuffix('\n').removesuffix('\r');v=lambda:list(map(int,t))
    if pid in [3790,3807]:assert all(math.isfinite(float(x)) for x in (t if pid==3790 else t[:1]))
    if pid<3805 or pid in [4929,4930,4931]:
        if pid!=3790:assert all(re.fullmatch(r'[+-]?\d+',x) for x in t),'integer token expected'
    fixed={3776:1,3777:3,4929:11,3780:10,3785:2,4931:14,3795:27,3796:3,3798:25}
    if pid in fixed:assert len(t)==fixed[pid],'fixed token count'
    if pid==3776:assert 1<=v()[0]<=10000
    if pid==3777:assert all(1<=x<=1000 for x in v())
    arrays={3778:(0,100),3781:(2,99),3782:(1,100),3784:(1,1000),3786:(1,10000),3788:(1,10000),3789:(1,100),3790:(3,300),3791:(1,10000),3792:(1,100000),3793:(1,20000)}
    if pid in arrays:
        assert t and re.fullmatch(r'\d+',t[0]);n=int(t[0]);lo,hi=arrays[pid];assert lo<=n<=hi,'array length range'
        count=2*n+1 if pid==3784 else n+2 if pid in [3778,3786] else n+1;assert len(t)==count,f'{count} tokens expected, got {len(t)}'
        vals=list(map(float if pid==3790 else int,t[1:]))
        if pid==3782:assert all(x>=0 for x in vals)
        if pid in [3784,3786,3788]:assert all(abs(x)<=1000 if pid==3784 else abs(x)<=10000 for x in vals)
        if pid==3789:assert all(abs(x)<=1000000 for x in vals)
        if pid==3790:assert all(x>=0 for x in vals)
        if pid==3791:assert all(0<=x<10000 for x in vals)
        if pid==3792:assert vals==sorted(vals),'array must be sorted'
        if pid==3793:assert all(10<=x<=5000 for x in vals)
    if pid==4929:assert all(100<=x<=200 for x in v()[:10]) and 100<=v()[-1]<=120
    if pid==3780:assert all(0<=x<=100 for x in v())
    if pid==4930:
        l,m,*a=v();assert 1<=l<=10000 and 1<=m<=100 and len(a)==2*m;assert all(0<=x<y<=l for x,y in zip(a[::2],a[1::2]))
    if pid==3785:
        n,m=v();assert 1<=m<=n<=5000
    if pid==4931:assert all(0<=x<10 for x in v())
    if pid==3794:
        n=int(t[0]);assert 1<=n<=10000 and len(t)==4*n+3
        vals=v()[1:-2];assert all(a>=0 and b>=0 and g>0 and k>0 for a,b,g,k in zip(vals[::4],vals[1::4],vals[2::4],vals[3::4]));assert all(x>=0 for x in v()[-2:])
    if pid==3795:assert all(1<=x<=5 for x in v()[-2:])
    if pid==3796:
        n,i,j=v();assert 1<=n<=10 and 1<=i<=n and 1<=j<=n
    if pid==3798:
        a=[v()[5*i:5*i+5] for i in range(5)];assert all(row.count(max(row))==1 for row in a),'row maximum must be unique';assert all(col.count(min(col))==1 for col in zip(*a)),'column minimum must be unique'
    if pid in [3797,3799,3800,3801,3802,3803,3804]:
        n,m=map(int,t[:2]);assert 1<=n<=100 and 1<=m<=100
        count=2+n*m*(2 if pid in [3799,3800] else 1)
        if pid==3801:
            k=int(t[2]);assert 1<=n<100 and 1<=m<100 and 1<=k<100;count=3+n*m+m*k
        if pid==3797:assert n<100 and m<100
        assert len(t)==count,'matrix length mismatch';vals=v()[3 if pid==3801 else 2:]
        if pid==3799:assert all(x in [0,1] for x in vals)
        if pid in [3800,3802]:assert all(1<=x<=1000 for x in vals)
        if pid==3801:assert all(abs(x)<=1000 for x in vals)
        if pid in [3803,3804]:assert all(0<=x<=255 for x in vals)
    if 3805<=pid<=3825:
        assert '\n' not in line if pid in [3805,3809,3812,3814,3818,3819,3820,3825] else True
        if pid==3805:assert len(line)<=255
        if pid==3806:assert len(t)==1 and 1<=len(t[0])<100000 and re.fullmatch('[a-z]+',t[0])
        if pid==3807:assert len(t)==3 and 0<=float(t[0])<=1 and 1<=len(t[1])==len(t[2])<=500 and all(set(x)<=set('ATGC') for x in t[1:])
        if pid==3808:assert 1<=int(t[0])<=100 and len(t)==1+2*int(t[0]) and all(x in ['Rock','Scissors','Paper'] for x in t[1:])
        if pid==3809:assert 2<=len(line)<=100 and all(32<=ord(x)<=63 for x in line)
        if pid==3810:assert len(t)==1 and 1<=len(t[0])<=20
        if pid==3811:assert len(t)==1 and 1<=len(t[0])<=255 and set(t[0])<=set('ATGC')
        if pid==3812:assert len(line)<80
        if pid==3813:assert len(t)==1 and 1<=len(t[0])<50 and re.fullmatch('[A-Za-z]+',t[0])
        if pid==3814:assert len(line)<=100
        if pid==3815:assert 1<=int(t[0])<=100 and len(t)==1+int(t[0]) and all(1<=len(x)<=20 and re.fullmatch('[A-Za-z0-9-]+',x) for x in t[1:])
        if pid==3816:assert len(t)==2 and all(1<=len(x)<=200 for x in t)
        if pid==3817:
            assert len(t)==1 and 1<=len(t[0])<=32
            assert not any(t[0]==suffix for suffix in ['er','ly','ing']),'suffix removal must leave a nonempty word'
        if pid==3818:assert len(line)<=1000 and 1<=len(t)<=300
        if pid==3819:assert set(line)<=set('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ ,') and 1<=len(re.findall('[A-Za-z]+',line))<=200 and all(len(w)<=100 for w in re.findall('[A-Za-z]+',line))
        if pid==3820:assert len(line)<=500
        if pid==3821:assert len(t)==1 and 1<=len(t[0])<=1000 and t[0].isdigit()
        if pid==3822:assert len(t)==1 and 1<=len(t[0])<=100
        if pid==3823:
            n=int(t[0]);assert 1<=n<=100 and len(t)==2*n+1;scores=list(map(int,t[1::2]));assert all(0<=x<=100 for x in scores) and scores.count(max(scores))==1,'unique highest score required';assert all(1<=len(x)<=20 for x in t[2::2])
        if pid==3824:assert len(t)==2 and 1<=int(t[0])<=1000 and 1<=len(t[1])<=2500
        if pid==3825:assert len(line)<=500 and re.fullmatch(r'[A-Za-z]+(?: +[A-Za-z]+)*\.',line)
