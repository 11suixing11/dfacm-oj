"""Independent Python array, matrix and string oracles."""
from collections import Counter
from decimal import Decimal
import itertools,math,re
def line(text):return text.removesuffix('\n').removesuffix('\r')
def format_matrix(a):return '\n'.join(' '.join(map(str,row)) for row in a)
def solve(pid,text):
    t=text.split();v=lambda:list(map(int,t))
    if pid==3776:
        k=int(t[0]);n=(math.isqrt(8*k+1)-1)//2;return str(n*(n+1)*(2*n+1)//6+(k-n*(n+1)//2)*(n+1))
    if pid==3777:
        a,b,c=v();return str(sum((c-b*y)%a==0 for y in range(c//b+1)))
    if pid==3778:return str(v()[1:-1].count(v()[-1]))
    if pid==4929:return str(sum(x<=v()[-1]+30 for x in v()[:10]))
    if pid==3780:
        amount=sum(x*p for x,p in zip(v(),[289,327,456,780,350,862,278,430,560,650]));return f'{amount//10}.{amount%10}'
    if pid==3781:return ' '.join(map(str,v()[:0:-1]))
    if pid==3782:
        values=v()[1:];return '\n'.join(f'{100*sum(lo<=x<=hi for x in values)/len(values):.2f}%' for lo,hi in [(0,18),(19,35),(36,60),(61,10**9)])
    if pid==4930:
        values=v();l,m=values[:2];removed=set()
        for a,b in zip(values[2::2],values[3::2]):removed.update(range(a,b+1))
        return str(l+1-len(removed))
    if pid==3784:
        vals=v();n=vals[0];return str(sum(a*b for a,b in zip(vals[1:n+1],vals[n+1:])))
    if pid==3785:
        n,m=v();return ','.join(str(x) for x in range(1,n+1) if sum(x%d==0 for d in range(1,m+1))%2)
    if pid==3786:
        a=v()[1:-1];x=v()[-1];return str(a.index(x)+1 if x in a else -1)
    if pid==4931:
        sums=[a+b for a,b in zip(v()[::2],v()[1::2])];return str(sums.index(max(sums))+1 if max(sums)>8 else 0)
    if pid==3788:return str(max(v()[1:])-min(v()[1:]))
    if pid==3789:
        vals=v()[1:];return str(sum(x for x in vals if x!=max(vals)))
    if pid==3790:
        vals=sorted(map(float,t[1:]))[1:-1];mean=sum(vals)/len(vals);err=max(abs(x-mean) for x in vals);return f'{mean:.2f} {err:.2f}'
    if pid==3791:
        vals=v()[1:];c=Counter(vals);return '\n'.join(str(c[x]) for x in range(max(vals)+1))
    if pid==3792:return str(max(len(list(g)) for _,g in itertools.groupby(v()[1:])))
    if pid==3793:return ' '.join(map(str,dict.fromkeys(v()[1:])))
    if pid==3794:
        vals=v();n=vals[0];x,y=vals[-2:];answer=-1
        for i in range(n):
            a,b,g,k=vals[1+4*i:5+4*i]
            if a<=x<=a+g and b<=y<=b+k:answer=i+1
        return str(answer)
    if pid==3795:
        vals=v();a=[vals[i*5:i*5+5] for i in range(5)];m,n=vals[-2:];a[m-1],a[n-1]=a[n-1],a[m-1];return format_matrix(a)
    if pid==3796:
        n,i,j=v();fmt=lambda points:' '.join(f'({x},{y})' for x,y in points)
        allpoints=list(itertools.product(range(1,n+1),repeat=2))
        return '\n'.join([fmt([(i,y) for y in range(1,n+1)]),fmt([(x,j) for x in range(1,n+1)]),fmt([(x,y) for x,y in allpoints if x-y==i-j]),fmt(sorted([(x,y) for x,y in allpoints if x+y==i+j],reverse=True))])
    if pid==3797:
        vals=v();n,m=vals[:2];return str(sum(vals[2+i*m+j] for i in range(n) for j in range(m) if i in [0,n-1] or j in [0,m-1]))
    if pid==3798:
        vals=v();a=[vals[5*i:5*i+5] for i in range(5)]
        for i in range(5):
            for j in range(5):
                if a[i][j]==max(a[i])==min(row[j] for row in a):return f'{i+1} {j+1} {a[i][j]}'
        return 'not found'
    if pid in [3799,3800,3801,3802,3803,3804]:
        vals=v();n,m=vals[:2];a=[vals[2+i*m:2+(i+1)*m] for i in range(n)]
        if pid==3799:return f'{100*sum(x==y for x,y in zip(vals[2:2+n*m],vals[2+n*m:]))/(n*m):.2f}'
        if pid==3800:return format_matrix([[a[i][j]+vals[2+n*m+i*m+j] for j in range(m)] for i in range(n)])
        if pid==3801:
            n,m,k=vals[:3];a=[vals[3+i*m:3+(i+1)*m] for i in range(n)];b=[vals[3+n*m+i*k:3+n*m+(i+1)*k] for i in range(m)];return format_matrix([[sum(a[i][l]*b[l][j] for l in range(m)) for j in range(k)] for i in range(n)])
        if pid==3802:return format_matrix(list(zip(*a)))
        if pid==3803:return format_matrix(list(zip(*a[::-1])))
        if pid==3804:return format_matrix([[a[i][j] if i in [0,n-1] or j in [0,m-1] else int(math.floor((a[i][j]+a[i-1][j]+a[i+1][j]+a[i][j-1]+a[i][j+1])/5+.5)) for j in range(m)] for i in range(n)])
    if pid==3805:return str(sum(c in '0123456789' for c in line(text)))
    if pid==3806:
        c=Counter(t[0]);return next((x for x in t[0] if c[x]==1),'no')
    if pid==3807:
        p,a,b=t;return 'yes' if Decimal(sum(x==y for x,y in zip(a,b)))>=Decimal(p)*len(a) else 'no'
    if pid==3808:
        names=['Rock','Scissors','Paper'];out=[]
        for a,b in zip(t[1::2],t[2::2]):out.append('Tie' if a==b else 'Player1' if (names.index(a)+1)%3==names.index(b) else 'Player2')
        return '\n'.join(out)
    if pid==3809:
        s=line(text);return ''.join(chr(ord(s[i])+ord(s[(i+1)%len(s)])) for i in range(len(s)))
    if pid==3810:return 'yes' if re.fullmatch(r'[A-Za-z_][A-Za-z_0-9]*',t[0]) else 'no'
    if pid==3811:return t[0].translate(str.maketrans('ATGC','TACG'))
    if pid==3812:return line(text).translate(str.maketrans('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ','bcdefghijklmnopqrstuvwxyzaBCDEFGHIJKLMNOPQRSTUVWXYZA'))
    if pid==3813:return t[0][::-1].swapcase().translate(str.maketrans('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ','defghijklmnopqrstuvwxyzabcDEFGHIJKLMNOPQRSTUVWXYZABC'))
    if pid==3814:return line(text).upper()
    if pid==3815:return '\n'.join(s[0].upper()+s[1:].lower() for s in t[1:])
    if pid==3816:
        a,b=t;return f'{a} is substring of {b}' if a in b else f'{b} is substring of {a}' if b in a else 'No substring'
    if pid==3817:
        s=t[0];return next((s[:-len(x)] for x in ['er','ly','ing'] if s.endswith(x) and len(s)>len(x)),s)
    if pid==3818:return ','.join(str(len(s)) for s in t)
    if pid==3819:
        words=re.findall('[A-Za-z]+',text);return max(words,key=len)+'\n'+min(words,key=len)
    if pid==3820:return re.sub(r'[^ ]+',lambda m:m[0][::-1],line(text))
    if pid==3821:return ''.join(str(len(list(g)))+ch for ch,g in itertools.groupby(t[0]))
    if pid==3822:return 'yes' if t[0]==t[0][::-1] else 'no'
    if pid==3823:return max(zip(map(int,t[1::2]),t[2::2]),key=lambda v:v[0])[1]
    if pid==3824:
        k=int(t[0]);return next((c for c,g in itertools.groupby(t[1]) if len(list(g))>=k),'No')
    if pid==3825:return max(line(text)[:-1].split(),key=len)
    raise KeyError(pid)
