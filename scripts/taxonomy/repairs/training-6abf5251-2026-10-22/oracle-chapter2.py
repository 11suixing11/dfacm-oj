"""Independent calculations for chapter 2, using exact integers/Decimal."""
from decimal import Decimal, localcontext
from fractions import Fraction
import functools, math

def polynomial(x,n):
    with localcontext() as ctx:
        ctx.prec=420
        x=Decimal(x)
        if x==1:return Decimal(n+1)
        return (x**(n+1)-1)/(x-1)

@functools.lru_cache(None)
def harmonic_threshold(k):
    n=0;s=0.0
    while s<=k:
        n+=1;s+=1/n
    return n

@functools.lru_cache(None)
def primes():
    sieve=bytearray(b'\1')*110001;sieve[:2]=b'\0\0'
    for i in range(2,math.isqrt(110000)+1):
        if sieve[i]:sieve[i*i::i]=b'\0'*len(sieve[i*i::i])
    return [i for i in range(2,len(sieve)) if sieve[i]]

def count_digit(n,digit=2):
    ans=0;place=1
    while place<=n:
        high,cur=divmod(n//place,10);low=n%place
        ans+=high*place+(place if cur>digit else low+1 if cur==digit else 0)
        place*=10
    return ans

def solve(pid,text):
    t=text.split();ints=lambda:list(map(int,t));floats=lambda:list(map(float,t))
    if pid==3726:
        d=int(t[0]);return 'Bike' if Fraction(d,3)+50<Fraction(d*5,6) else 'Walk' if Fraction(d,3)+50>Fraction(d*5,6) else 'All'
    if pid==3727:
        x=float(t[0]);return f'{2.5-x if x<5 else 2-1.5*(x-3)**2 if x<10 else x/2-1.5:.3f}'
    if pid==3728:
        w=int(t[0]);return str(8+4*math.ceil(max(0,w-1000)/500)+(5 if t[1]=='y' else 0))
    if pid==3729:return str(max(ints()))
    if pid==3730:
        v=sorted(ints());return 'yes' if v[0]+v[1]>v[2] else 'no'
    if pid==3731:
        y=int(t[0]);return 'Y' if y%400==0 or y%4==0 and y%100!=0 else 'N'
    if pid==3732:return 'yes' if all(-1<=v<=1 for v in ints()) else 'no'
    if pid==3733:
        a,b=map(int,t[:2]);op=t[2]
        if op=='+':return str(a+b)
        if op=='-':return str(a-b)
        if op=='*':return str(a*b)
        if op=='/':return 'Divided by zero!' if not b else str((1 if a*b>=0 else -1)*(abs(a)//abs(b)))
        return 'Invalid operator!'
    if pid==3734:
        with localcontext() as ctx:
            ctx.prec=80;a,b,c=map(Decimal,t);d=b*b-4*a*c
            def fmt(v):
                s=f'{v:.5f}';return '0.00000' if s=='-0.00000' else s
            if d<0:return 'No answer!'
            if d==0:return 'x1=x2='+fmt(-b/(2*a))
            roots=sorted([(-b-d.sqrt())/(2*a),(-b+d.sqrt())/(2*a)])
            return f'x1={fmt(roots[0])};x2={fmt(roots[1])}'
    if pid in [3735,3736,3737]:
        n=int(t[0]);v=list(map(float if pid==3736 else int,t[1:]));total=sum(v)
        if pid==3737:return f'{total} {total/n:.5f}'
        return f'{total/n:.{2 if pid==3735 else 4}f}'
    if pid==3738:return str(max(ints()[1:]))
    if pid==3739:return str(max(ints()[1:])-min(ints()[1:]))
    if pid==3740:
        v=ints()[1:];s=[sum(v[i::3]) for i in range(3)];return ' '.join(map(str,s+[sum(s)]))
    if pid in [3741,3742]:
        m,n=ints();return str(sum(x for x in range(m,n+1) if x%2 if pid==3741)) if pid==3741 else str(sum(x for x in range(m,n+1) if not x%17))
    if pid==3743:
        v=ints()[1:];return '\n'.join(str(v.count(k)) for k in [1,5,10])
    if pid==3744:
        n,m,*v=ints();return str(v.count(m))
    if pid==3745:
        a,n=ints();return str(a**n)
    if pid==3746:
        with localcontext() as ctx:
            ctx.prec=60;x,n=ints();return f'{Decimal(x)*Decimal("1.001")**n:.4f}'
    if pid==3747:
        n=int(t[0]);a,b=0,1
        for _ in range(n):a,b=b,a+b
        return str(a)
    if pid==3748:
        v=ints();a,b=v[1:3];out=[]
        for c,d in zip(v[3::2],v[4::2]):
            delta=Fraction(d,c)-Fraction(b,a);out.append('better' if delta>Fraction(1,20) else 'worse' if delta<Fraction(-1,20) else 'same')
        return '\n'.join(out)
    if pid==3749:
        with localcontext() as ctx:
            ctx.prec=80;s=Decimal(0)
            for i in range(int(t[0])):
                x,y,p=map(Decimal,t[1+i*3:4+i*3]);s+=(x*x+y*y).sqrt()/25+Decimal('1.5')*p
            return str(math.ceil(s))
    if pid==4928:
        cash=saved=0
        for m,b in enumerate(ints(),1):
            cash+=300-b
            if cash<0:return str(-m)
            saved+=cash//100*100;cash%=100
        return str(cash+saved*6//5)
    if pid==3751:
        m,n,*v=ints();fails=0
        for x in v:
            if x<=m:m-=x
            else:fails+=1
        return str(fails)
    if pid==3752:
        v=ints()[1:];best=run=0
        for a,b in zip(v[::2],v[1::2]):
            run=run+1 if 90<=a<=140 and 60<=b<=90 else 0;best=max(best,run)
        return str(best)
    if pid==3753:return str(sum(int(str(x)[-1])>sum(map(int,str(x)[:3])) for x in ints()[1:]))
    if pid==3754:
        p,q=1,2;s=Fraction(0)
        for _ in range(int(t[0])):s+=Fraction(q,p);p,q=q,p+q
        return f'{float(s):.4f}'
    if pid==3755:return f'{math.fsum((1 if i%2 else -1)/i for i in range(1,int(t[0])+1)):.4f}'
    if pid==3756:
        a,b,c=ints();g=math.gcd(a-b,a-c)
        if not g:return '2'
        for x in range(2,math.isqrt(g)+1):
            if g%x==0:return str(x)
        return str(g)
    if pid==3757:
        n=int(t[0]);return str(n*(n+1)//2)
    if pid==3758:
        a,b,n=ints();return str((a*pow(10,n,b*10)//b)%10)
    if pid==3759:
        a,b=ints();return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][pow(a,b,7)]
    if pid==3760:
        a,b=ints();return f'{pow(a,b,1000):03d}'
    if pid==3761:
        h=int(t[0]);return f'{h*(3-1/256):g}\n{h/1024:g}'
    if pid==3762:
        n=int(t[0]);out=[]
        while n!=1:
            new=3*n+1 if n%2 else n//2;out.append(f'{n}{"*3+1=" if n%2 else "/2="}{new}');n=new
        return '\n'.join(out+['End'])
    if pid==3763:return str(harmonic_threshold(int(t[0])))
    if pid==3764:return ' '.join(t[0][::-1])
    if pid==3765:return str((-1 if int(t[0])<0 else 1)*int(str(abs(int(t[0])))[::-1]))
    if pid==3766:
        m,k=ints();return 'YES' if m%19==0 and str(m).count('3')==k else 'NO'
    if pid==3767:return str(sum(math.factorial(i) for i in range(1,int(t[0])+1)))
    if pid==3768:
        with localcontext() as ctx:
            ctx.prec=60;return f'{sum(Decimal(1)/math.factorial(i) for i in range(int(t[0])+1)):.10f}'
    if pid==3769:return f'{polynomial(t[0],int(t[1])):.2f}'
    if pid==3770:return str(sum(i*i for i in range(1,int(t[0])+1) if i%7 and '7' not in str(i)))
    if pid==3771:return str(sum(str(i).count('1') for i in range(1,int(t[0])+1)))
    if pid==3772:
        l,r=ints();return str(count_digit(r)-count_digit(l-1))
    if pid==3773:
        h,w=int(t[0]),int(t[1]);c=t[2];solid=int(t[3]);return '\n'.join(''.join(c if solid or i in [0,h-1] or j in [0,w-1] else ' ' for j in range(w)) for i in range(h))
    if pid==3774:
        n=int(t[0]);return str(n//next(i for i in range(2,math.isqrt(n)+1) if n%i==0))
    if pid==3775:return str(primes()[int(t[0])-1])
    raise KeyError(pid)
