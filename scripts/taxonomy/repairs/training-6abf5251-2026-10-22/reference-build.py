"""Self-written reference programs for the requested training, added in DAG order."""
from pathlib import Path

HERE = Path(__file__).resolve().parent
HEADER = '#include <bits/stdc++.h>\nusing namespace std;\n'
PROGRAMS = {
    3676: 'int main(){long long a,b;cin>>a>>b;cout<<a+b<<"\\n";}',
    3677: 'int main(){cout<<"Hello,World!\\n";}',
    3678: 'int main(){long long a,b,c;cin>>a>>b>>c;cout<<b<<"\\n";}',
    3679: 'int main(){long long a,b,c;cin>>a>>b>>c;cout<<setw(8)<<a<<" "<<setw(8)<<b<<" "<<setw(8)<<c<<"\\n";}',
    3680: 'int main(){char c;cin>>c;for(int n=1;n<=5;n+=2)cout<<string((5-n)/2,\' \')<<string(n,c)<<"\\n";}',
    3681: 'int main(){long long x,a,y,b;cin>>x>>a>>y>>b;cout<<fixed<<setprecision(2)<<double(y*b-x*a)/(b-a)<<"\\n";}',
    3682: 'int main(){string s;cin>>s;if(s[0]==\'+\')s.erase(s.begin());if(s[0]!=\'-\')cout<<"-";cout<<s<<"\\n";}',
    3683: 'int main(){long long a,b,c;cin>>a>>b>>c;cout<<(a+b)*c<<"\\n";}',
    3684: 'int main(){long long a,b,c;cin>>a>>b>>c;cout<<(a+b)/c<<"\\n";}',
    3685: 'int main(){long long a,b;cin>>a>>b;cout<<a/b<<" "<<a%b<<"\\n";}',
    3686: 'int main(){double a,b;cin>>a>>b;cout<<fixed<<setprecision(9)<<a/b<<"\\n";}',
    3687: 'int main(){double a,b;cin>>a>>b;cout<<fixed<<setprecision(3)<<100*b/a<<"%\\n";}',
    3688: 'int main(){double x,a,b,c,d;cin>>x>>a>>b>>c>>d;double z=a*x*x*x+b*x*x+c*x+d;cout<<fixed<<setprecision(7)<<z<<"\\n";}',
    3689: 'int main(){double f;cin>>f;cout<<fixed<<setprecision(5)<<5*(f-32)/9<<"\\n";}',
    3690: 'int main(){double r;cin>>r;cout<<fixed<<setprecision(4)<<2*r<<" "<<2*3.14159*r<<" "<<3.14159*r*r<<"\\n";}',
    3691: 'int main(){double a,b;cin>>a>>b;cout<<fixed<<setprecision(2)<<1/(1/a+1/b)<<"\\n";}',
    3692: 'int main(){cout<<sizeof(int)<<" "<<sizeof(short)<<"\\n";}',
    3693: 'int main(){cout<<sizeof(float)<<" "<<sizeof(double)<<"\\n";}',
    3694: 'int main(){cout<<sizeof(bool)<<" "<<sizeof(char)<<"\\n";}',
    3695: 'int main(){float x;cin>>x;cout<<int(x)<<"\\n";}',
    3696: 'int main(){unsigned char c;char x;cin>>x;c=x;cout<<int(c)<<"\\n";}',
    3697: 'int main(){int c;cin>>c;cout<<char(c)<<"\\n";}',
    3698: 'int main(){long long x;cin>>x;cout<<(x!=0)<<"\\n";}',
    3699: 'int main(){cout<<sizeof("Hello, World!")<<"\\n";}',
    3700: 'int main(){float x;cin>>x;cout<<fixed<<setprecision(3)<<x<<"\\n";}',
    3701: 'int main(){double x;cin>>x;cout<<fixed<<setprecision(12)<<x<<"\\n";}',
    3702: 'int main(){char c;int n;float f;double d;cin>>c>>n>>f>>d;cout<<c<<" "<<n<<" "<<fixed<<setprecision(6)<<f<<" "<<d<<"\\n";}',
    3703: 'int main(){double x;cin>>x;printf("%f\\n%.5f\\n%e\\n%g\\n",x,x,x,x);}',
    3704: 'int main(){char c;cin>>c;for(int n:{1,3,5,3,1})cout<<string((5-n)/2,\' \')<<string(n,c)<<"\\n";}',
    3705: 'int main(){double a,b;cin>>a>>b;double r=fmod(a,b);if(r<0)r+=b;cout<<r<<"\\n";}',
    3706: 'int main(){double r;cin>>r;cout<<fixed<<setprecision(2)<<4*3.14*r*r*r/3<<"\\n";}',
    3707: 'int main(){string s;cin>>s;reverse(s.begin(),s.end());cout<<s<<"\\n";}',
    3708: 'int main(){double h,r;cin>>h>>r;cout<<(long long)ceil(20000/(3.14159*r*r*h))<<"\\n";}',
    3709: 'int main(){double x1,y1,x2,y2;cin>>x1>>y1>>x2>>y2;cout<<fixed<<setprecision(3)<<hypot(x1-x2,y1-y2)<<"\\n";}',
    3710: 'int main(){double x1,y1,x2,y2,x3,y3;cin>>x1>>y1>>x2>>y2>>x3>>y3;double z=abs((x2-x1)*(y3-y1)-(x3-x1)*(y2-y1))/2;cout<<fixed<<setprecision(2)<<z<<"\\n";}',
    3711: 'int main(){long long a,b,n;cin>>a>>b>>n;cout<<a+(n-1)*(b-a)<<"\\n";}',
    3712: 'int main(){long long a,b;cin>>a>>b;cout<<a*b<<"\\n";}',
    3713: 'int main(){int n;cin>>n;cout<<(1LL<<n)<<"\\n";}',
    3714: 'int main(){long long n,x,y;cin>>n>>x>>y;cout<<max(0LL,n-(y+x-1)/x)<<"\\n";}',
    3715: 'int main(){long long x;cin>>x;cout<<(x>0?"positive":x<0?"negative":"zero")<<"\\n";}',
    3716: 'int main(){double x;cin>>x;cout<<fixed<<setprecision(2)<<abs(x)<<"\\n";}',
    3717: 'int main(){long long x;cin>>x;cout<<(x%2?"odd":"even")<<"\\n";}',
    3718: 'int main(){char c;cin.get(c);cout<<((unsigned char)c%2?"YES":"NO")<<"\\n";}',
    3719: 'int main(){long long x,y;cin>>x>>y;cout<<(x>y?">":x<y?"<":"=")<<"\\n";}',
    3720: 'int main(){int n;cin>>n;cout<<(10<=n&&n<=99)<<"\\n";}',
    3721: 'int main(){long long x,y;cin>>x>>y;cout<<(x>=10||y>=20)<<"\\n";}',
    3722: 'int main(){long long x;cin>>x;cout<<(x%15==0?"YES":"NO")<<"\\n";}',
    3723: 'int main(){long long x;cin>>x;bool found=false;for(int d:{3,5,7})if(x%d==0){if(found)cout<<" ";cout<<d;found=true;}if(!found)cout<<"n";cout<<"\\n";}',
    3724: 'int main(){int a,b;cin>>a>>b;cout<<((a<60)!=(b<60))<<"\\n";}',
    3725: 'int main(){int d;cin>>d;cout<<(d==1||d==3||d==5?"NO":"YES")<<"\\n";}',
}

def main():
    destination=HERE/'references'
    destination.mkdir(exist_ok=True)
    for pid,body in PROGRAMS.items():
        (destination/f'{pid}.cpp').write_text(HEADER+body+'\n',encoding='utf-8')
    print('TRAINING_REFERENCES_WRITTEN',len(PROGRAMS))

if __name__=='__main__':main()
