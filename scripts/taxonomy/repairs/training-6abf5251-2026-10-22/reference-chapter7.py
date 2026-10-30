"""Build independent C++ references for all 50 chapter 7 problems."""
from pathlib import Path

root=Path(__file__).resolve().parent/'references'
root.mkdir(exist_ok=True)
header='#include <bits/stdc++.h>\nusing namespace std;\n'
big=r'''
struct Big {
    static const unsigned B=1000000000;
    vector<unsigned> a;
    Big(unsigned x=0){if(x)a.push_back(x);}
    Big operator+(const Big&b)const{Big c;unsigned long long carry=0;for(size_t i=0;i<max(a.size(),b.a.size())||carry;i++){unsigned long long v=carry+(i<a.size()?a[i]:0ULL)+(i<b.a.size()?b.a[i]:0ULL);c.a.push_back(v%B);carry=v/B;}return c;}
    Big times(unsigned k)const{Big c;unsigned long long carry=0;for(size_t i=0;i<a.size()||carry;i++){unsigned long long v=carry+(i<a.size()?(unsigned long long)a[i]*k:0ULL);c.a.push_back(v%B);carry=v/B;}while(!c.a.empty()&&!c.a.back())c.a.pop_back();return c;}
    string str()const{if(a.empty())return "0";ostringstream s;s<<a.back();for(int i=(int)a.size()-2;i>=0;i--)s<<setw(9)<<setfill('0')<<a[i];return s.str();}
};
'''
inversion=r'''
long long sortCount(vector<int>&a,int l,int r){if(r-l<=1)return 0;int m=(l+r)/2;long long z=sortCount(a,l,m)+sortCount(a,m,r);vector<int>b;int i=l,j=m;while(i<m||j<r){if(j==r||(i<m&&a[i]<=a[j]))b.push_back(a[i++]);else{z+=m-i;b.push_back(a[j++]);}}copy(b.begin(),b.end(),a.begin()+l);return z;}
'''
programs={}
helpers={}
programs[3973]=r'''
int T;cin>>T;while(T--){string a,b;cin>>a>>b;vector<int>d(b.size()+1);iota(d.begin(),d.end(),0);for(int i=1;i<=(int)a.size();i++){int diagonal=d[0];d[0]=i;for(int j=1;j<=(int)b.size();j++){int old=d[j];d[j]=min({d[j]+1,d[j-1]+1,diagonal+(a[i-1]!=b[j-1])});diagonal=old;}}cout<<d.back()<<"\n";}
'''
programs[3974]=r'''
int n,k;cin>>n>>k;const long long NEG=LLONG_MIN/4;vector<long long>d(k,NEG);d[0]=0;while(n--){int x;cin>>x;vector<long long>b=d;for(int j=0;j<k;j++)if(d[j]!=NEG)b[(j+x)%k]=max(b[(j+x)%k],d[j]+x);d=b;}cout<<d[0]<<"\n";
'''
programs[3975]=r'''
int n,k;while(cin>>n>>k){vector<int>d(k+1);int moves=0;while(d[k]<n){moves++;for(int j=k;j;j--)d[j]=min(n,d[j]+d[j-1]+1);}cout<<moves<<"\n";}
'''
programs[3976]=r'''
int T;cin>>T;while(T--){int n;cin>>n;long long skip=0,take=LLONG_MIN/4;while(n--){int x;cin>>x;long long nextTake=skip+x;skip=max(skip,take);take=nextTake;}cout<<max(skip,take)<<"\n";}
'''
programs[3977]=r'''
int T;cin>>T;while(T--){int n;cin>>n;vector<int>a(n);for(int&x:a)cin>>x;vector<long long>left(n);long long minimum=a[0],best=0;for(int i=0;i<n;i++){minimum=min(minimum,(long long)a[i]);best=max(best,a[i]-minimum);left[i]=best;}long long maximum=a.back(),right=0,answer=0;for(int i=n-1;i>=0;i--){maximum=max(maximum,(long long)a[i]);right=max(right,maximum-a[i]);answer=max(answer,right+left[i]);}cout<<answer<<"\n";}
'''
programs[3978]=r'''
int T;cin>>T;while(T--){int m,n;cin>>m>>n;vector<long long>d(m+1);d[0]=1;for(int x=1;x<=n;x++)for(int s=x;s<=m;s++)d[s]+=d[s-x];cout<<d[m]<<"\n";}
'''
programs[3979]=r'''
int n,k;cin>>n>>k;vector<long long>d(n-k+1);d[0]=1;for(int x=1;x<=k;x++)for(int s=x;s<=n-k;s++)d[s]+=d[s-x];cout<<d[n-k]<<"\n";
'''
programs[3980]=r'''
int T;cin>>T;while(T--){int n;cin>>n;vector<long long>a(n),left(n),right(n);for(auto&x:a)cin>>x;long long ending=a[0];left[0]=ending;for(int i=1;i<n;i++){ending=max(a[i],ending+a[i]);left[i]=max(left[i-1],ending);}ending=a.back();right.back()=ending;for(int i=n-2;i>=0;i--){ending=max(a[i],ending+a[i]);right[i]=max(right[i+1],ending);}long long answer=LLONG_MIN;for(int i=0;i+1<n;i++)answer=max(answer,left[i]+right[i+1]);cout<<answer<<"\n";}
'''
programs[3981]=r'''
int n,m;cin>>n;vector<int>a(n);for(int&x:a)cin>>x;cin>>m;vector<int>b(m);for(int&x:b)cin>>x;
struct Node{int value,parent;};vector<Node>nodes;vector<int>d(m),last(m,-1);
for(int x:a){int length=0,parent=-1;for(int j=0;j<m;j++){if(b[j]<x&&d[j]>length){length=d[j];parent=last[j];}else if(b[j]==x&&length+1>d[j]){d[j]=length+1;nodes.push_back({x,parent});last[j]=nodes.size()-1;}}}
int endpoint=max_element(d.begin(),d.end())-d.begin();vector<int>s;for(int p=last[endpoint];p!=-1;p=nodes[p].parent)s.push_back(nodes[p].value);reverse(s.begin(),s.end());cout<<s.size()<<"\n";for(size_t i=0;i<s.size();i++)cout<<(i?" ":"")<<s[i];cout<<"\n";
'''
programs[3982]=r'''
string a,b;cin>>a>>b;vector<int>d(a.size()+b.size()+1);for(int i=0;i<(int)a.size();i++)for(int j=0;j<(int)b.size();j++)d[i+j]+=(a[a.size()-1-i]-'0')*(b[b.size()-1-j]-'0');for(size_t i=0;i+1<d.size();i++){d[i+1]+=d[i]/10;d[i]%=10;}while(d.size()>1&&!d.back())d.pop_back();for(int i=d.size()-1;i>=0;i--)cout<<d[i];cout<<"\n";
'''
helpers[3983]=r'''
string trim(string s){size_t i=s.find_first_not_of('0');return i==string::npos?"0":s.substr(i);}
bool ge(const string&a,const string&b){return a.size()!=b.size()?a.size()>b.size():a>=b;}
string subtract(string a,const string&b){int carry=0;for(int i=a.size()-1,j=b.size()-1;i>=0;i--,j--){int x=a[i]-'0'-carry-(j>=0?b[j]-'0':0);carry=x<0;if(carry)x+=10;a[i]='0'+x;}return trim(a);}
'''
programs[3983]=r'''
string a,b;cin>>a>>b;a=trim(a);b=trim(b);string quotient,remainder="0";for(char ch:a){remainder=trim(remainder+ch);int digit=0;while(ge(remainder,b)){remainder=subtract(remainder,b);digit++;}quotient+='0'+digit;}cout<<trim(quotient)<<"\n"<<remainder<<"\n";
'''
programs[3984]=r'''
int base;string text;cin>>base>>text;vector<int>a;for(auto it=text.rbegin();it!=text.rend();++it){char c=toupper(*it);a.push_back(isdigit(c)?c-'0':c-'A'+10);}int step=0;while(true){bool palindrome=true;for(size_t i=0;i<a.size();i++)if(a[i]!=a[a.size()-1-i])palindrome=false;if(palindrome){cout<<step<<"\n";break;}if(step==30){cout<<"Impossible\n";break;}vector<int>b(a.rbegin(),a.rend());int carry=0;for(size_t i=0;i<a.size();i++){int sum=a[i]+b[i]+carry;a[i]=sum%base;carry=sum/base;}if(carry)a.push_back(carry);step++;}
'''
for pid in [3985,3986,4003]:
    helpers[pid]=inversion
    programs[pid]=r'int n;cin>>n;vector<int>a(n);for(int&x:a)cin>>x;cout<<sortCount(a,0,n)<<"\n";'
helpers[3987]=big
programs[3987]=r'''
int x,y,z;cin>>x>>y>>z;vector<Big>adult(z+2),egg(z+2);adult[0]=Big(1);for(int month=0;month<=z;month++){if(month){adult[month]=adult[month-1];if(month>=2)adult[month]=adult[month]+egg[month-2];}if(month>=x)egg[month]=adult[month-x].times(y);}cout<<adult[z].str()<<"\n";
'''
programs[3988]=r'''
int n;cin>>n;int even=8,odd=1;for(int i=1;i<n;i++){int a=(even*9+odd)%12345,b=(odd*9+even)%12345;even=a;odd=b;}cout<<even<<"\n";
'''
programs[3989]=r'''
int n,m,x,y;cin>>n>>m>>x>>y;vector<vector<bool>>blocked(n+1,vector<bool>(m+1));vector<pair<int,int>>moves={{0,0},{1,2},{1,-2},{-1,2},{-1,-2},{2,1},{2,-1},{-2,1},{-2,-1}};for(auto [a,b]:moves)if(x+a>=0&&x+a<=n&&y+b>=0&&y+b<=m)blocked[x+a][y+b]=true;vector<vector<long long>>d(n+1,vector<long long>(m+1));for(int i=0;i<=n;i++)for(int j=0;j<=m;j++)if(!blocked[i][j]){if(i==0&&j==0)d[i][j]=1;else d[i][j]=(i?d[i-1][j]:0)+(j?d[i][j-1]:0);}cout<<d[n][m]<<"\n";
'''
helpers[3990]=big
programs[3990]=r'''
int n,k;cin>>n>>k;vector<vector<Big>>d(n+1,vector<Big>(k+1));d[0][0]=Big(1);for(int i=1;i<=n;i++)for(int j=1;j<=min(i,k);j++)d[i][j]=d[i-1][j-1]+d[i-1][j].times(j);cout<<d[n][k].str()<<"\n";
'''
programs[3991]=r'''
int n;cin>>n;vector<long long>d(n+1,1),prefix(n+1);for(int i=1;i<=n;i++){d[i]=1+prefix[i/2];prefix[i]=prefix[i-1]+d[i];}cout<<d[n]<<"\n";
'''
programs[3992]=r'''
int n,r;cin>>n>>r;vector<int>path;function<void(int)>dfs=[&](int next){if((int)path.size()==r){for(int x:path)cout<<setw(3)<<x;cout<<"\n";return;}int remaining=r-path.size();for(int x=next;x<=n-remaining+1;x++){path.push_back(x);dfs(x+1);path.pop_back();}};dfs(1);
'''
programs[3993]=r'''
int n;cin>>n;vector<int>path;function<void(int,int)>dfs=[&](int remaining,int minimum){if(!remaining){if(path.size()>1){cout<<n<<"=";for(size_t i=0;i<path.size();i++)cout<<(i?"+":"")<<path[i];cout<<"\n";}return;}for(int x=minimum;x<=remaining;x++){path.push_back(x);dfs(remaining-x,x);path.pop_back();}};dfs(n,1);
'''
programs[3994]=r'''
int n;cin>>n;vector<pair<long long,int>>a(n);for(int i=0;i<n;i++){cin>>a[i].first;a[i].second=i+1;}sort(a.begin(),a.end());long long time=0,wait=0;for(int i=0;i<n;i++){cout<<(i?" ":"")<<a[i].second;wait+=time;time+=a[i].first;}cout<<"\n"<<fixed<<setprecision(2)<<(long double)wait/n<<"\n";
'''
programs[3995]=r'''
int n;cin>>n;vector<long long>a(n);for(auto&x:a)cin>>x;long long average=accumulate(a.begin(),a.end(),0LL)/n;int answer=0;for(int i=0;i+1<n;i++)if(a[i]!=average){a[i+1]+=a[i]-average;answer++;}cout<<answer<<"\n";
'''
programs[3996]=r'''
string digits;int s;cin>>digits>>s;string answer;for(char ch:digits){while(s&&!answer.empty()&&answer.back()>ch){answer.pop_back();s--;}answer+=ch;}if(s)answer.resize(answer.size()-s);auto p=answer.find_first_not_of('0');cout<<(p==string::npos?"0":answer.substr(p))<<"\n";
'''
programs[3997]=r'''
vector<int>tops;int x;while(cin>>x){auto it=lower_bound(tops.begin(),tops.end(),x);if(it==tops.end())tops.push_back(x);else *it=x;}cout<<tops.size()<<"\n";
'''
for pid in [3998,3999]:
    programs[pid]=r'int n;cin>>n;vector<pair<int,int>>a(n);for(auto&[end,start]:a)cin>>start>>end;sort(a.begin(),a.end());int last=-1,answer=0;for(auto[end,start]:a)if(start'+('>=' if pid==3998 else '>')+r'last){last=end;answer++;}cout<<answer<<"\n";'
programs[4000]=r'''
int m;cin>>m;int n=1<<m;vector<vector<int>>a(n,vector<int>(n));a[0][0]=1;for(int width=1;width<n;width*=2)for(int i=0;i<width;i++)for(int j=0;j<width;j++){a[i][j+width]=a[i][j]+width;a[i+width][j]=a[i][j]+width;a[i+width][j+width]=a[i][j];}for(auto&row:a){for(int j=0;j<n;j++)cout<<(j?" ":"")<<row[j];cout<<"\n";}
'''
programs[4001]=r'''
long long b,p,k;cin>>b>>p>>k;long long original=b,exponent=p,result=1%k;b%=k;while(p){if(p&1)result=result*b%k;b=b*b%k;p>>=1;}cout<<original<<"^"<<exponent<<" mod "<<k<<"="<<result<<"\n";
'''
programs[4002]=r'''
int n;cin>>n;string a=string(n,'o')+string(n,'*')+"--";int gap=2*n,step=0;auto print=[&](){cout<<"step"<<setw(2)<<step++<<":"<<a<<"\n";};auto move=[&](int source){source--;a[gap]=a[source];a[gap+1]=a[source+1];a[source]=a[source+1]='-';gap=source;print();};function<void(int)>solve=[&](int m){if(m==4){for(int x:{4,8,2,7,1})move(x);}else{move(m);move(2*m-1);solve(m-1);}};print();solve(n);
'''
for pid in [4004,4010]:
    reader=r'for(auto&row:a)cin>>row;' if pid==4004 else r'''for(auto&row:a)for(char&ch:row){int x;cin>>x;ch=char('0'+x);}'''
    programs[pid]=r'''int n,m;cin>>n>>m;vector<string>a(n,string(m,'0'));'''+reader+r'''
int answer=0;for(int i=0;i<n;i++)for(int j=0;j<m;j++)if(a[i][j]!='0'){answer++;queue<pair<int,int>>q;q.push({i,j});a[i][j]='0';while(!q.empty()){auto[x,y]=q.front();q.pop();for(auto[dx,dy]:vector<pair<int,int>>{{0,1},{0,-1},{1,0},{-1,0}}){int r=x+dx,c=y+dy;if(r>=0&&r<n&&c>=0&&c<m&&a[r][c]!='0'){a[r][c]='0';q.push({r,c});}}}}cout<<answer<<"\n";
'''
programs[4005]=r'''
vector<vector<int>>d(101,vector<int>(101,-1));queue<pair<int,int>>q;q.push({1,1});d[1][1]=0;while(!q.empty()){auto[x,y]=q.front();q.pop();for(auto[a,b]:vector<pair<int,int>>{{1,2},{2,1},{2,2}})for(int sx:{-1,1})for(int sy:{-1,1}){int r=x+sx*a,c=y+sy*b;if(r>=1&&r<=100&&c>=1&&c<=100&&d[r][c]==-1){d[r][c]=d[x][y]+1;q.push({r,c});}}}int x,y;while(cin>>x>>y)cout<<d[x][y]<<"\n";
'''
helpers[4006]=r'''
string decimal(__int128 x){if(!x)return "0";bool negative=x<0;if(negative)x=-x;string s;while(x){s+=char('0'+x%10);x/=10;}if(negative)s+='-';reverse(s.begin(),s.end());return s;}
'''
programs[4006]=r'''
string s;getline(cin,s);vector<__int128>stack;for(size_t i=0;i<s.size();){char c=s[i];if(c=='@')break;if(isspace((unsigned char)c)){i++;continue;}if(isdigit((unsigned char)c)){__int128 x=0;while(i<s.size()&&isdigit((unsigned char)s[i]))x=x*10+s[i++]-'0';stack.push_back(x);}else{__int128 b=stack.back();stack.pop_back();__int128 a=stack.back();stack.pop_back();stack.push_back(c=='+'?a+b:c=='-'?a-b:c=='*'?a*b:a/b);i++;}}cout<<decimal(stack.back())<<"\n";
'''
programs[4007]=r'''
long long a,b,k;cin>>a>>b>>k;for(long long i=0;i<k;i++)cout<<i%a+1<<" "<<i%b+1<<"\n";
'''
programs[4008]=r'''
int a,n;while(cin>>a>>n){vector<long long>d(n);d[0]=a;int i=0,j=0;for(int k=1;k<n;k++){long long x=2*d[i]+1,y=3*d[j]+1;d[k]=min(x,y);if(d[k]==x)i++;if(d[k]==y)j++;}cout<<d[n-1]<<"\n";}
'''
programs[4009]=r'''
int n;long long m;cin>>n>>m;vector<int>a(n);iota(a.begin(),a.end(),1);size_t index=0;bool first=true;while(!a.empty()){index=(index+(m-1)%a.size())%a.size();cout<<(first?"":" ")<<a[index];first=false;a.erase(a.begin()+index);}cout<<"\n";
'''
programs[4011]=r'''
int n,m;cin>>n>>m;map<int,vector<int>>children;set<int>nodes,nonroots;for(int i=0;i<m;i++){int a,b;cin>>a>>b;nodes.insert(a);nodes.insert(b);nonroots.insert(b);children[a].push_back(b);}if(n==1)nodes.insert(1);int root=0,best=*nodes.begin();for(int x:nodes){if(!nonroots.count(x))root=x;if(children[x].size()>children[best].size())best=x;}sort(children[best].begin(),children[best].end());cout<<root<<"\n"<<best<<"\n";for(size_t i=0;i<children[best].size();i++)cout<<(i?" ":"")<<children[best][i];cout<<"\n";
'''
programs[4012]=r'''
vector<array<int,26>>tree(1);string s;while(cin>>s){int node=0;for(char ch:s){int c=ch-'A';if(!tree[node][c]){int next=tree.size();tree[node][c]=next;tree.emplace_back();}node=tree[node][c];}}cout<<tree.size()<<"\n";
'''
programs[4013]=r'''
int n;cin>>n;vector<long long>population(n);vector<vector<int>>graph(n);for(int i=0;i<n;i++){int a,b;cin>>population[i]>>a>>b;for(int x:{a,b})if(x){graph[i].push_back(x-1);graph[x-1].push_back(i);}}long long answer=LLONG_MAX;for(int start=0;start<n;start++){vector<int>d(n,-1);d[start]=0;queue<int>q;q.push(start);long long sum=0;while(!q.empty()){int u=q.front();q.pop();sum+=population[u]*d[u];for(int v:graph[u])if(d[v]<0){d[v]=d[u]+1;q.push(v);}}answer=min(answer,sum);}cout<<answer<<"\n";
'''
programs[4014]=r'''
string pre,inside;cin>>pre>>inside;function<void(int,int,int)>visit=[&](int p,int l,int r){if(l==r)return;int m=inside.find(pre[p]);visit(p+1,l,m);visit(p+1+m-l,m+1,r);cout<<pre[p];};visit(0,0,inside.size());cout<<"\n";
'''
programs[4015]=r'''
string s;cin>>s;size_t index=0;string inside,post;function<void()>visit=[&](){char ch=s[index++];if(ch=='.')return;visit();inside+=ch;visit();post+=ch;};visit();cout<<inside<<"\n"<<post<<"\n";
'''
programs[4016]=r'''
int n,m;cin>>n>>m;vector<vector<pair<int,int>>>graph(n+1);for(int i=0;i<m;i++){int a,b;cin>>a>>b;graph[a].push_back({b,i});graph[b].push_back({a,i});}int start=1;while(graph[start].empty())start++;for(int i=1;i<=n;i++)if(graph[i].size()%2){start=i;break;}vector<int>position(n+1),stack{start},path;vector<bool>used(m);while(!stack.empty()){int u=stack.back();while(position[u]<(int)graph[u].size()&&used[graph[u][position[u]].second])position[u]++;if(position[u]==(int)graph[u].size()){path.push_back(u);stack.pop_back();}else{auto[v,id]=graph[u][position[u]++];used[id]=true;stack.push_back(v);}}reverse(path.begin(),path.end());for(size_t i=0;i<path.size();i++)cout<<(i?" ":"")<<path[i];cout<<"\n";
'''
programs[4017]=r'''
int n;cin>>n;vector<pair<int,int>>a(n);for(auto&[x,y]:a)cin>>x>>y;const long double INF=numeric_limits<long double>::infinity();vector<vector<long double>>d(n,vector<long double>(n,INF));for(int i=0;i<n;i++)d[i][i]=0;int m;cin>>m;while(m--){int u,v;cin>>u>>v;--u;--v;d[u][v]=d[v][u]=hypotl((long double)a[u].first-a[v].first,(long double)a[u].second-a[v].second);}for(int k=0;k<n;k++)for(int i=0;i<n;i++)for(int j=0;j<n;j++)d[i][j]=min(d[i][j],d[i][k]+d[k][j]);int s,t;cin>>s>>t;cout<<fixed<<setprecision(2)<<d[s-1][t-1]<<"\n";
'''
programs[4018]=r'''
int n;cin>>n;vector<pair<int,int>>a(n);for(auto&[x,y]:a)cin>>x>>y;const long double INF=numeric_limits<long double>::infinity();vector<vector<long double>>d(n,vector<long double>(n,INF));auto distance=[&](int i,int j){return hypotl((long double)a[i].first-a[j].first,(long double)a[i].second-a[j].second);};for(int i=0;i<n;i++){string s;cin>>s;for(int j=0;j<n;j++)if(i==j)d[i][j]=0;else if(s[j]=='1')d[i][j]=distance(i,j);}for(int k=0;k<n;k++)for(int i=0;i<n;i++)for(int j=0;j<n;j++)d[i][j]=min(d[i][j],d[i][k]+d[k][j]);vector<long double>ecc(n);long double original=0;for(int i=0;i<n;i++){for(int j=0;j<n;j++)if(isfinite(d[i][j]))ecc[i]=max(ecc[i],d[i][j]);original=max(original,ecc[i]);}long double answer=INF;for(int i=0;i<n;i++)for(int j=0;j<i;j++)if(!isfinite(d[i][j]))answer=min(answer,max(original,ecc[i]+distance(i,j)+ecc[j]));if(!isfinite(answer))answer=original;cout<<fixed<<setprecision(6)<<answer<<"\n";
'''
programs[4019]=r'''
int n,m;cin>>n>>m;vector<vector<pair<int,int>>>graph(n+1);while(m--){int u,v,z;cin>>u>>v>>z;graph[u].push_back({v,z});graph[v].push_back({u,z});}int start,end;cin>>start>>end;vector<long double>d(n+1);d[start]=1;priority_queue<pair<long double,int>>q;q.push({1,start});while(!q.empty()){auto[p,u]=q.top();q.pop();if(p<d[u])continue;if(u==end)break;for(auto[v,z]:graph[u]){long double next=p*(100-z)/100;if(next>d[v]){d[v]=next;q.push({next,v});}}}cout<<fixed<<setprecision(8)<<100/d[end]<<"\n";
'''
programs[4020]=r'''
int n,p,m;cin>>n>>p>>m;vector<int>count(p);for(int i=0;i<n;i++){int x;cin>>x;count[x-1]++;}vector<vector<pair<int,int>>>graph(p);while(m--){int a,b,w;cin>>a>>b>>w;--a;--b;graph[a].push_back({b,w});graph[b].push_back({a,w});}const long long INF=LLONG_MAX/8;long long answer=INF;for(int start=0;start<p;start++){vector<long long>d(p,INF);d[start]=0;priority_queue<pair<long long,int>,vector<pair<long long,int>>,greater<pair<long long,int>>>q;q.push({0,start});while(!q.empty()){auto[distance,u]=q.top();q.pop();if(distance!=d[u])continue;for(auto[v,w]:graph[u])if(distance+w<d[v]){d[v]=distance+w;q.push({d[v],v});}}long long sum=0;bool possible=true;for(int i=0;i<p;i++)if(count[i]){if(d[i]==INF){possible=false;break;}sum+=count[i]*d[i];}if(possible)answer=min(answer,sum);}cout<<answer<<"\n";
'''
for pid in [4021,4022]:
    helpers[pid]=r'''
struct DSU{vector<int>p,s;DSU(int n):p(n),s(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}bool join(int a,int b){a=find(a);b=find(b);if(a==b)return false;if(s[a]<s[b])swap(a,b);p[b]=a;s[a]+=s[b];return true;}};
'''
programs[4021]=r'''
int n,m;cin>>n>>m;DSU d(n+1);while(m--){int a,b;cin>>a>>b;d.join(a,b);}int q;cin>>q;while(q--){int a,b;cin>>a>>b;cout<<(d.find(a)==d.find(b)?"Yes":"No")<<"\n";}
'''
programs[4022]=r'''
int n,m;cin>>n>>m;DSU d(n*n);int answer=0;for(int step=1;step<=m;step++){int x,y;char kind;cin>>x>>y>>kind;--x;--y;int a=x*n+y,b=(x+(kind=='D'))*n+y+(kind=='R');if(!answer&&!d.join(a,b))answer=step;}if(answer)cout<<answer<<"\n";else cout<<"draw\n";
'''
assert set(programs)==set(range(3973,4023))
for pid,body in programs.items():
    code=header+helpers.get(pid,'')+'\nint main(){ios::sync_with_stdio(false);cin.tie(nullptr);\n'+body+'\nreturn 0;\n}\n'
    # The strings use literal C++ quotes, including character literals.
    code=code.replace("\\'", "'")
    (root/f'{pid}.cpp').write_text(code,encoding='utf-8')
print('TRAINING_CHAPTER7_REFERENCES',len(programs),flush=True)
