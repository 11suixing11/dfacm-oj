"""Self-written, ordered reference implementations for the second chapter."""
from pathlib import Path
HEADER='#include <bits/stdc++.h>\nusing namespace std;\n'
PROGRAMS={
3726:r'int main(){long long d;cin>>d;cout<<(d>100?"Bike":d<100?"Walk":"All")<<"\n";}',
3727:r'int main(){double x;cin>>x;double y=x<5?2.5-x:x<10?2-1.5*(x-3)*(x-3):x/2-1.5;cout<<fixed<<setprecision(3)<<y<<"\n";}',
3728:r'int main(){long long w;char c;cin>>w>>c;cout<<8+4*((max(0LL,w-1000)+499)/500)+(c==\'y\'?5:0)<<"\n";}',
3729:r'int main(){long long a,b,c;cin>>a>>b>>c;cout<<max({a,b,c})<<"\n";}',
3730:r'int main(){long long a[3];for(auto &x:a)cin>>x;sort(a,a+3);cout<<(a[0]+a[1]>a[2]?"yes":"no")<<"\n";}',
3731:r'int main(){int y;cin>>y;cout<<(y%400==0||(y%4==0&&y%100!=0)?"Y":"N")<<"\n";}',
3732:r'int main(){long long x,y;cin>>x>>y;cout<<(-1<=x&&x<=1&&-1<=y&&y<=1?"yes":"no")<<"\n";}',
3733:r'int main(){long long a,b;char c;cin>>a>>b>>c;switch(c){case \'+\':cout<<a+b;break;case \'-\':cout<<a-b;break;case \'*\':cout<<a*b;break;case \'/\':if(!b)cout<<"Divided by zero!";else cout<<a/b;break;default:cout<<"Invalid operator!";}cout<<"\n";}',
3734:r'''string fmt(long double v){if(v==0)v=0;ostringstream out;out<<fixed<<setprecision(5)<<v;string s=out.str();return s=="-0.00000"?"0.00000":s;}
int main(){long double a,b,c;cin>>a>>b>>c;long double d=b*b-4*a*c;if(d<0){cout<<"No answer!\n";return 0;}if(d==0){cout<<"x1=x2="<<fmt(-b/(2*a))<<"\n";return 0;}long double q=-0.5L*(b+copysignl(sqrtl(d),b));long double u=q/a,v=c/q;if(u>v)swap(u,v);cout<<"x1="<<fmt(u)<<";x2="<<fmt(v)<<"\n";}''',
3735:r'int main(){int n,x;cin>>n;long long sum=0;for(int i=0;i<n;i++){cin>>x;sum+=x;}cout<<fixed<<setprecision(2)<<double(sum)/n<<"\n";}',
3736:r'int main(){int n;cin>>n;double x,s=0;for(int i=0;i<n;i++){cin>>x;s+=x;}cout<<fixed<<setprecision(4)<<s/n<<"\n";}',
3737:r'int main(){int n;cin>>n;long long x,s=0;for(int i=0;i<n;i++){cin>>x;s+=x;}cout<<s<<" "<<fixed<<setprecision(5)<<double(s)/n<<"\n";}',
3738:r'int main(){int n,x,best=0;cin>>n;while(n--){cin>>x;best=max(best,x);}cout<<best<<"\n";}',
3739:r'int main(){int n,x,lo=INT_MAX,hi=INT_MIN;cin>>n;while(n--){cin>>x;lo=min(lo,x);hi=max(hi,x);}cout<<hi-lo<<"\n";}',
3740:r'int main(){int n;cin>>n;long long s[3]={};while(n--)for(int i=0;i<3;i++){long long x;cin>>x;s[i]+=x;}cout<<s[0]<<" "<<s[1]<<" "<<s[2]<<" "<<s[0]+s[1]+s[2]<<"\n";}',
3741:r'int main(){int m,n,s=0;cin>>m>>n;for(int x=m;x<=n;x++)if(x%2)s+=x;cout<<s<<"\n";}',
3742:r'int main(){int m,n,s=0;cin>>m>>n;for(int x=m;x<=n;x++)if(x%17==0)s+=x;cout<<s<<"\n";}',
3743:r'int main(){int n,x,c[11]={};cin>>n;while(n--){cin>>x;c[x]++;}cout<<c[1]<<"\n"<<c[5]<<"\n"<<c[10]<<"\n";}',
3744:r'int main(){int n,m,x,c=0;cin>>n>>m;while(n--){cin>>x;c+=x==m;}cout<<c<<"\n";}',
3745:r'int main(){long long a,r=1;int n;cin>>a>>n;while(n--)r*=a;cout<<r<<"\n";}',
3746:r'int main(){double x;int n;cin>>x>>n;while(n--)x*=1.001;cout<<fixed<<setprecision(4)<<x<<"\n";}',
3747:r'int main(){int k;cin>>k;long long a=0,b=1;for(int i=0;i<k;i++){long long c=a+b;a=b;b=c;}cout<<a<<"\n";}',
3748:r'int main(){int n;long long a,b,c,d;cin>>n>>a>>b;while(--n){cin>>c>>d;long long diff=20*(d*a-b*c),base=a*c;cout<<(diff>base?"better":diff<-base?"worse":"same")<<"\n";}}',
3749:r'int main(){int n;cin>>n;long double sum=0,x,y;long long p;while(n--){cin>>x>>y>>p;sum+=hypotl(x,y)/25+1.5L*p;}cout<<(long long)ceill(sum)<<"\n";}',
4928:r'int main(){int cash=0,saved=0;for(int month=1;month<=12;month++){int budget;cin>>budget;cash+=300-budget;if(cash<0){cout<<-month<<"\n";return 0;}saved+=cash/100*100;cash%=100;}cout<<cash+saved*6/5<<"\n";}',
3751:r'int main(){long long m,x;int n,fail=0;cin>>m>>n;while(n--){cin>>x;if(x<=m)m-=x;else fail++;}cout<<fail<<"\n";}',
3752:r'int main(){int n,s,d,run=0,best=0;cin>>n;while(n--){cin>>s>>d;run=90<=s&&s<=140&&60<=d&&d<=90?run+1:0;best=max(best,run);}cout<<best<<"\n";}',
3753:r'int main(){int n,x,c=0;cin>>n;while(n--){cin>>x;int a=x%10,b=x/10%10,d=x/100%10,e=x/1000;c+=a>b+d+e;}cout<<c<<"\n";}',
3754:r'int main(){int n;cin>>n;long long p=1,q=2;double s=0;while(n--){s+=double(q)/p;long long next=p+q;p=q;q=next;}cout<<fixed<<setprecision(4)<<s<<"\n";}',
3755:r'int main(){int n;cin>>n;double s=0;for(int i=1;i<=n;i++)s+=(i%2?1.0:-1.0)/i;cout<<fixed<<setprecision(4)<<s<<"\n";}',
3756:r'int main(){long long a,b,c;cin>>a>>b>>c;long long g=gcd(abs(a-b),abs(a-c));if(g==0){cout<<2<<"\n";return 0;}for(long long p=2;p*p<=g;p++)if(g%p==0){cout<<p<<"\n";return 0;}cout<<g<<"\n";}',
3757:r'int main(){long long n;cin>>n;cout<<n*(n+1)/2<<"\n";}',
3758:r'int main(){int a,b,n;cin>>a>>b>>n;int digit=0;for(int i=0;i<n;i++){a*=10;digit=a/b;a%=b;}cout<<digit<<"\n";}',
3759:r'int main(){int a,b,r=1;cin>>a>>b;while(b--){r=r*a%7;}const char* day[]={"Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"};cout<<day[r]<<"\n";}',
3760:r'int main(){int a,b,r=1;cin>>a>>b;while(b--)r=r*a%1000;cout<<setw(3)<<setfill(\'0\')<<r<<"\n";}',
3761:r'int main(){long double h;cin>>h;cout<<h*(3-1.0L/256)<<"\n"<<h/1024<<"\n";}',
3762:r'int main(){long long n;cin>>n;while(n!=1){long long next=n%2?3*n+1:n/2;cout<<n<<(n%2?"*3+1=":"/2=")<<next<<"\n";n=next;}cout<<"End\n";}',
3763:r'int main(){int k,n=0;cin>>k;long double s=0;while(s<=k)s+=1.0L/++n;cout<<n<<"\n";}',
3764:r'int main(){string s;cin>>s;reverse(s.begin(),s.end());for(size_t i=0;i<s.size();i++){if(i)cout<<" ";cout<<s[i];}cout<<"\n";}',
3765:r'int main(){long long n;cin>>n;bool neg=n<0;n=abs(n);long long r=0;while(n){r=r*10+n%10;n/=10;}cout<<(neg?-r:r)<<"\n";}',
3766:r'int main(){long long m;int k;cin>>m>>k;cout<<(m%19==0&&count(to_string(m).begin(),to_string(m).end(),\'3\')==k?"YES":"NO")<<"\n";}',
3767:r'int main(){int n;cin>>n;long long f=1,s=0;for(int i=1;i<=n;i++){f*=i;s+=f;}cout<<s<<"\n";}',
3768:r'int main(){int n;cin>>n;long double f=1,s=1;for(int i=1;i<=n;i++){f*=i;s+=1/f;}cout<<fixed<<setprecision(10)<<s<<"\n";}',
3769:r'int main(){long double x;int n;cin>>x>>n;long double p=1,s=1;for(int i=1;i<=n;i++){p*=x;s+=p;}cout<<fixed<<setprecision(2)<<s<<"\n";}',
3770:r'int main(){int n,s=0;cin>>n;for(int x=1;x<=n;x++)if(x%7&&to_string(x).find(\'7\')==string::npos)s+=x*x;cout<<s<<"\n";}',
3771:r'int main(){int n,c=0;cin>>n;for(int x=1;x<=n;x++)for(char d:to_string(x))c+=d==\'1\';cout<<c<<"\n";}',
3772:r'''long long count2(long long n){long long ans=0;for(long long f=1;f<=n;f*=10){long long high=n/f/10,cur=n/f%10,low=n%f;ans+=high*f+(cur>2?f:cur==2?low+1:0);if(f>n/10)break;}return ans;}
int main(){long long l,r;cin>>l>>r;cout<<count2(r)-count2(l-1)<<"\n";}''',
3773:r'int main(){int h,w,t;char c;cin>>h>>w>>c>>t;for(int i=0;i<h;i++){for(int j=0;j<w;j++)cout<<(t||i==0||i==h-1||j==0||j==w-1?c:\' \');cout<<"\n";}}',
3774:r'int main(){long long n;cin>>n;for(long long d=2;d*d<=n;d++)if(n%d==0){cout<<n/d<<"\n";break;}}',
3775:r'int main(){int n;cin>>n;const int limit=110000;vector<bool> composite(limit+1);for(int i=2,c=0;i<=limit;i++){if(!composite[i]){if(++c==n){cout<<i<<"\n";return 0;}if(1LL*i*i<=limit)for(int j=i*i;j<=limit;j+=i)composite[j]=true;}}}',
}
# Quotes in the raw Python source are unescaped before emitting valid C++.
PROGRAMS={pid:code.replace("\\'", "'") for pid,code in PROGRAMS.items()}
PROGRAMS[3766]=r'int main(){long long m;int k;cin>>m>>k;string s=to_string(m);cout<<(m%19==0&&count(s.begin(),s.end(),\'3\')==k?"YES":"NO")<<"\n";}'.replace("\\'", "'")
if __name__=='__main__':
    root=Path(__file__).resolve().parent/'references';root.mkdir(exist_ok=True)
    for pid,body in PROGRAMS.items():(root/f'{pid}.cpp').write_text(HEADER+body+'\n',encoding='utf-8')
    print('TRAINING_REFERENCES_WRITTEN',len(PROGRAMS))
