"""Independent C++ references for functions, arithmetic, sorting and basic DP."""
from pathlib import Path

HEADER = '#include <bits/stdc++.h>\nusing namespace std;\n'
BIG = r'''
using Big=vector<long long>;
const long long BASE=1000000000;
void mul(Big&a,int k){long long c=0;for(auto&x:a){c+=x*k;x=c%BASE;c/=BASE;}while(c){a.push_back(c%BASE);c/=BASE;}}
void add(Big&a,const Big&b){a.resize(max(a.size(),b.size()),0);long long c=0;for(size_t i=0;i<a.size();i++){c+=a[i]+(i<b.size()?b[i]:0);a[i]=c%BASE;c/=BASE;}if(c)a.push_back(c);}
void print(const Big&a){cout<<a.back();for(int i=int(a.size())-2;i>=0;i--)cout<<setw(9)<<setfill('0')<<a[i];cout<<"\n";}
'''
PROGRAMS = {
3826:r'int main(){int n;cin>>n;vector<int>s(n+1);for(int d=1;d<=n/2;d++)for(int x=2*d;x<=n;x+=d)s[x]+=d;for(int x=2;x<=n;x++)if(s[x]==x)cout<<x<<"\n";}',
3827:r'int main(){int n;cin>>n;vector<bool>p(n+1,true);p[0]=p[1]=false;for(int d=2;d*d<=n;d++)if(p[d])for(int x=d*d;x<=n;x+=d)p[x]=false;cout<<count(p.begin(),p.end(),true)<<"\n";}',
3828:r'int main(){long double a,b,c;cin>>a>>b>>c;cout<<fixed<<setprecision(3)<<max({a,b,c})/(max({a+b,b,c})*max({a,b,b+c}))<<"\n";}',
3829:r'bool p(int x){if(x<2)return false;for(int d=2;d*d<=x;d++)if(x%d==0)return false;return true;}int main(){for(int x=10;x<100;x++)if(p(x)&&p(x%10*10+x/10))cout<<x<<"\n";}',
3830:r'int sum(int x){int s=0;for(int d=1;d<x;d++)if(x%d==0)s+=d;return s;}int main(){for(int a=2;;a++){int b=sum(a);if(b>a&&sum(b)==a){cout<<a<<" "<<b<<"\n";break;}}}',
3831:r'bool p(int x){for(int d=2;d*d<=x;d++)if(x%d==0)return false;return true;}int main(){for(int x=100;x<1000;x++)if(x/100==x%10&&p(x))cout<<x<<"\n";}',
3832:r'int main(){long double x=1/sqrtl(3),power=x,s=0;for(int d=1;abs(power/d)>=1e-6L;d+=2){s+=power/d;power*=-x*x;}cout<<fixed<<setprecision(10)<<6*s<<"\n";}',
3833:r'bool p(int x){if(x<2)return false;for(int d=2;d*d<=x;d++)if(x%d==0)return false;return true;}int main(){for(int n=6;n<=100;n+=2)for(int a=2;a<=n/2;a++)if(p(a)&&p(n-a)){cout<<n<<"="<<a<<"+"<<n-a<<"\n";break;}}',
3834:r'long long sum(long long n){if(n<=1)return n;long long k=n/2;return 2*sum(k)+k*k+(n%2?n:0);}int main(){long long n;cin>>n;cout<<sum(n)<<"\n";}',
3835:r'int main(){int n;cin>>n;unsigned long long a=0,b=1;for(int i=1;i<n;i++){auto c=a+b;a=b;b=c;}cout<<a<<"\n";}',
3836:r'int main(){string s;cin>>s;reverse(s.begin(),s.end());cout<<s<<"\n";}',
3837:r'void out(unsigned long long n,int m){if(n>=unsigned(m))out(n/m,m);cout<<"0123456789ABCDEF"[n%m];}int main(){unsigned long long n;int m;cin>>n>>m;out(n,m);cout<<"\n";}',
3838:r'int main(){string s;getline(cin,s,\'!\');reverse(s.begin(),s.end());cout<<s<<"\n";}',
3839:r'int ack(int m,int n){if(m==0)return n+1;if(m==1)return n+2;if(m==2)return 2*n+3;return n==0?ack(m-1,1):ack(m-1,ack(m,n-1));}int main(){int m,n;cin>>m>>n;cout<<ack(m,n)<<"\n";}',
3840:r'int main(){string n;int k;cin>>n>>k;cout<<(k>int(n.size())?\'0\':n[n.size()-k])<<"\n";}',
3841:r'int main(){int n;long long x;cin>>n>>x;long long a=1,b=2*x;for(int i=2;i<=n;i++){auto c=2*x*b-2*(i-1)*a;a=b;b=c;}cout<<(n?b:a)<<".00\n";}',
3842:r'int main(){long double x;int n;cin>>x>>n;for(int i=1;i<=n;i++)x=sqrtl(i+x);cout<<fixed<<setprecision(2)<<x<<"\n";}',
3843:r'int main(){long double x;int n;cin>>x>>n;long double f=x;for(int i=1;i<=n;i++)f=x/(i+f);cout<<fixed<<setprecision(2)<<f<<"\n";}',
3844:r'int main(){string a,b,s;cin>>a>>b;int carry=0;reverse(a.begin(),a.end());reverse(b.begin(),b.end());for(size_t i=0;i<max(a.size(),b.size())||carry;i++){int x=carry+(i<a.size()?a[i]-\'0\':0)+(i<b.size()?b[i]-\'0\':0);s+=char(x%10+\'0\');carry=x/10;}while(s.size()>1&&s.back()==\'0\')s.pop_back();reverse(s.begin(),s.end());cout<<s<<"\n";}',
3845:r'int main(){string a,b;cin>>a>>b;reverse(a.begin(),a.end());reverse(b.begin(),b.end());int borrow=0;for(size_t i=0;i<a.size();i++){int x=a[i]-\'0\'-borrow-(i<b.size()?b[i]-\'0\':0);borrow=x<0;a[i]=char((x+10)%10+\'0\');}while(a.size()>1&&a.back()==\'0\')a.pop_back();reverse(a.begin(),a.end());cout<<a<<"\n";}',
3846:BIG+r'int main(){int n;cin>>n;Big a{1};while(n--)mul(a,2);print(a);}',
3847:r'int main(){string s;cin>>s;bool first=true;for(int d=2;d<=9;d++){int r=0;for(char c:s)r=(r*10+c-\'0\')%d;if(!r){if(!first)cout<<" ";cout<<d;first=false;}}if(first)cout<<"none";cout<<"\n";}',
3848:BIG+r'int main(){int n;cin>>n;Big a{1};for(int i=2;i<=n;i++)mul(a,i);print(a);}',
3849:BIG+r'int main(){int n;cin>>n;Big a{1},s{0};for(int i=1;i<=n;i++){mul(a,i);add(s,a);}print(s);}',
3850:r'int main(){string a,b;cin>>a>>b;vector<int>c(a.size()+b.size()+1);reverse(a.begin(),a.end());reverse(b.begin(),b.end());for(size_t i=0;i<a.size();i++)for(size_t j=0;j<b.size();j++)c[i+j]+=(a[i]-\'0\')*(b[j]-\'0\');for(size_t i=0;i+1<c.size();i++){c[i+1]+=c[i]/10;c[i]%=10;}while(c.size()>1&&c.back()==0)c.pop_back();for(auto it=c.rbegin();it!=c.rend();it++)cout<<*it;cout<<"\n";}',
3851:r'int main(){string s,q;cin>>s;int r=0;for(char c:s){r=r*10+c-\'0\';q+=char(r/13+\'0\');r%=13;}auto p=q.find_first_not_of(\'0\');cout<<(p==string::npos?"0":q.substr(p))<<"\n"<<r<<"\n";}',
3852:r'int main(){int n,k;cin>>n>>k;vector<pair<double,long long>>a(n);for(auto&x:a)cin>>x.second>>x.first;sort(a.rbegin(),a.rend());cout<<a[k-1].second<<" "<<setprecision(6)<<a[k-1].first<<"\n";}',
3853:r'int main(){int n,x;cin>>n;vector<int>a;while(n--){cin>>x;if(x%2)a.push_back(x);}sort(a.begin(),a.end());for(size_t i=0;i<a.size();i++)cout<<(i?",":"")<<a[i];cout<<"\n";}',
3854:r'int main(){int n;cin>>n;vector<pair<string,int>>a(n);for(auto&x:a)cin>>x.first>>x.second;sort(a.begin(),a.end(),[](auto&x,auto&y){return x.second!=y.second?x.second>y.second:x.first<y.first;});for(auto&x:a)cout<<x.first<<" "<<x.second<<"\n";}',
3855:r'int main(){int n;cin>>n;vector<tuple<int,int,int>>a;for(int id=1;id<=n;id++){int c,m,e;cin>>c>>m>>e;a.emplace_back(-(c+m+e),-c,id);}sort(a.begin(),a.end());for(int i=0;i<5;i++)cout<<get<2>(a[i])<<" "<<-get<0>(a[i])<<"\n";}',
3856:r'int main(){int n,m;cin>>n>>m;vector<pair<int,int>>a(n);for(auto&x:a){cin>>x.second>>x.first;x.first=-x.first;}sort(a.begin(),a.end());int cut=-a[m*3/2-1].first,k=0;while(k<n&&-a[k].first>=cut)k++;cout<<cut<<" "<<k<<"\n";for(int i=0;i<k;i++)cout<<a[i].second<<" "<<-a[i].first<<"\n";}',
3857:r'int main(){vector<int>a(10);for(auto&x:a)cin>>x;sort(a.begin(),a.end(),[](int x,int y){if(x%2!=y%2)return x%2>y%2;return x%2?x>y:x<y;});for(int i=0;i<10;i++)cout<<(i?" ":"")<<a[i];cout<<"\n";}',
3858:r'int main(){int n;cin>>n;vector<double>a,b;while(n--){string sex;double h;cin>>sex>>h;(sex=="male"?a:b).push_back(h);}sort(a.begin(),a.end());sort(b.rbegin(),b.rend());a.insert(a.end(),b.begin(),b.end());for(size_t i=0;i<a.size();i++)cout<<(i?" ":"")<<fixed<<setprecision(2)<<a[i];cout<<"\n";}',
3859:r'int main(){int n;cin>>n;vector<pair<string,int>>a(n);for(auto&x:a)cin>>x.first>>x.second;stable_sort(a.begin(),a.end(),[](auto&x,auto&y){if((x.second>=60)!=(y.second>=60))return x.second>=60;return x.second>=60?x.second>y.second:false;});for(auto&x:a)cout<<x.first<<"\n";}',
3860:r'int main(){int n,x;cin>>n;set<int>a;while(n--){cin>>x;a.insert(x);}cout<<a.size()<<"\n";bool first=true;for(int x:a){cout<<(first?"":" ")<<x;first=false;}cout<<"\n";}',
3861:r'int main(){string s;set<string>a;while(cin>>s)a.insert(s);for(auto&x:a)cout<<x<<"\n";}',
3862:r'int main(){int n;cin>>n;vector<int>a(n);for(auto&x:a)cin>>x;sort(a.begin(),a.end());if(count(a.begin(),a.end(),a[n/2])>n/2)cout<<a[n/2];else cout<<"no";cout<<"\n";}',
3863:r'int main(){string s;cin>>s;int c[26]={};for(char x:s)c[x-\'a\']++;int k=max_element(c,c+26)-c;cout<<char(\'a\'+k)<<" "<<c[k]<<"\n";}',
3864:r'int main(){int n;cin>>n;vector<int>a(1000001);a[1]=a[2]=1;for(int i=3;i<=1000000;i++)a[i]=(a[i-1]+a[i-2])%1000;while(n--){int x;cin>>x;cout<<a[x]<<"\n";}}',
3865:r'int main(){int n;cin>>n;vector<int>a(1000000);a[1]=1;a[2]=2;for(int i=3;i<1000000;i++)a[i]=(2*a[i-1]+a[i-2])%32767;while(n--){int x;cin>>x;cout<<a[x]<<"\n";}}',
3866:r'int main(){long long a[71]={1,1,2};for(int i=3;i<=70;i++)a[i]=a[i-1]+a[i-2]+a[i-3];int n;while(cin>>n&&n)cout<<a[n]<<"\n";}',
3867:r'int main(){int n,m;cin>>n;vector<string>a(n);for(auto&s:a)cin>>s;cin>>m;for(int d=1;d<m;d++){auto b=a;for(int i=0;i<n;i++)for(int j=0;j<n;j++)if(a[i][j]==\'@\')for(auto [di,dj]:{pair{1,0},pair{-1,0},pair{0,1},pair{0,-1}}){int r=i+di,c=j+dj;if(r>=0&&r<n&&c>=0&&c<n&&a[r][c]==\'.\')b[r][c]=\'@\';}a=b;}int s=0;for(auto&r:a)s+=count(r.begin(),r.end(),\'@\');cout<<s<<"\n";}',
3868:r'int f(int m,int n){if(!m||n==1)return 1;if(n>m)return f(m,m);return f(m,n-1)+f(m-n,n);}int main(){int t;cin>>t;while(t--){int m,n;cin>>m>>n;cout<<f(m,n)<<"\n";}}',
3869:r'int main(){int n;cin>>n;int a=1,b=1;for(int i=1;i<=n;i++){int c=a+b;a=b;b=c;}cout<<a<<"\n";}',
3870:r'int main(){int m,n;cin>>m>>n;vector<long long>a(n,1);for(int i=1;i<m;i++)for(int j=1;j<n;j++)a[j]+=a[j-1];cout<<a.back()<<"\n";}',
3871:r'int main(){int n,k,x;cin>>n>>k;vector<bool>a(k);a[0]=true;while(n--){cin>>x;x%=k;vector<bool>b(k);for(int i=0;i<k;i++)if(a[i]){b[(i+x)%k]=true;b[(i-x+k)%k]=true;}a=b;}cout<<(a[0]?"YES":"NO")<<"\n";}',
3872:r'int main(){int n;cin>>n;long long all=1,north=1,east=0,west=0;for(int i=0;i<n;i++){auto nn=all,ee=north+east,ww=north+west;north=nn;east=ee;west=ww;all=north+east+west;}cout<<all<<"\n";}',
3873:r'int main(){int m,n;cin>>m>>n;vector<long long>x(m+1);for(int i=2;i<=m;i++){cin>>x[i];x[i]+=x[i-1];}vector<vector<long long>>c(m+1,vector<long long>(m+1));for(int l=1;l<=m;l++)for(int r=l+1;r<=m;r++)c[l][r]=c[l][r-1]+x[r]-x[(l+r)/2];const long long INF=LLONG_MAX/4;vector<long long>a(m+1,INF);a[0]=0;for(int schools=1;schools<=n;schools++){vector<long long>b(m+1,INF);for(int r=schools;r<=m;r++)for(int l=schools-1;l<r;l++)b[r]=min(b[r],a[l]+c[l+1][r]);a=b;}cout<<a[m]<<"\n";}',
}

if __name__ == '__main__':
    root = Path(__file__).resolve().parent / 'references'
    root.mkdir(exist_ok=True)
    for pid, code in PROGRAMS.items():
        (root / f'{pid}.cpp').write_text(HEADER + code.replace("\\'", "'") + '\n', encoding='utf-8')
    print('TRAINING_REFERENCES_WRITTEN', len(PROGRAMS))
