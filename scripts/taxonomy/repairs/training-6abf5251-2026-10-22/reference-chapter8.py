"""Build C++ reference solutions for the final 49 training problems."""
from pathlib import Path
root=Path(__file__).resolve().parent/'references'
root.mkdir(exist_ok=True)
header='#include <bits/stdc++.h>\nusing namespace std;\n'
dsu=r'''
struct DSU{vector<int>p,s;DSU(int n):p(n),s(n,1){iota(p.begin(),p.end(),0);}int find(int x){while(p[x]!=x){p[x]=p[p[x]];x=p[x];}return x;}bool join(int a,int b){a=find(a);b=find(b);if(a==b)return false;if(s[a]<s[b])swap(a,b);p[b]=a;s[a]+=s[b];return true;}};
'''
shortest=r'''
vector<long long> shortest(const vector<vector<pair<int,long long>>>&g,int s){const long long INF=LLONG_MAX/4;vector<long long>d(g.size(),INF);d[s]=0;priority_queue<pair<long long,int>,vector<pair<long long,int>>,greater<pair<long long,int>>>q;q.push({0,s});while(!q.empty()){auto[x,u]=q.top();q.pop();if(x!=d[u])continue;for(auto[v,w]:g[u])if(x+w<d[v]){d[v]=x+w;q.push({d[v],v});}}return d;}
'''
expr=r'''
struct Parser{
    string s;bool power,ok=true;vector<pair<char,long long>>postfix;
    int prec(char c){if(c=='~')return 4;if(c=='^'&&power)return 3;if(c=='*'||c=='/')return 2;if(c=='+'||c=='-')return 1;return 0;}
    long long run(){
        vector<char>ops;bool expect=true;
        for(size_t i=0;i<s.size();){char c=s[i];
            if(c>='0'&&c<='9'){
                if(!expect){ok=false;return 0;}__int128 v=0;
                while(i<s.size()&&isdigit((unsigned char)s[i])){v=v*10+s[i++]-'0';if(v>LLONG_MAX){ok=false;return 0;}}
                postfix.push_back({'n',(long long)v});expect=false;continue;
            }
            i++;
            if(c=='('){if(!expect){ok=false;return 0;}ops.push_back(c);}
            else if(c==')'){
                if(expect){ok=false;return 0;}while(!ops.empty()&&ops.back()!='('){postfix.push_back({ops.back(),0});ops.pop_back();}
                if(ops.empty()){ok=false;return 0;}ops.pop_back();expect=false;
            }else if(prec(c)){
                if(expect){if(c!='-'){ok=false;return 0;}ops.push_back('~');}
                else{while(!ops.empty()&&ops.back()!='('&&prec(ops.back())>=prec(c)){postfix.push_back({ops.back(),0});ops.pop_back();}ops.push_back(c);expect=true;}
            }else{ok=false;return 0;}
        }
        if(expect){ok=false;return 0;}
        while(!ops.empty()){if(ops.back()=='('){ok=false;return 0;}postfix.push_back({ops.back(),0});ops.pop_back();}
        vector<long long>stack;
        for(auto[c,v]:postfix){
            if(c=='n'){stack.push_back(v);continue;}
            if(c=='~'){if(stack.empty()){ok=false;return 0;}stack.back()=-stack.back();continue;}
            if(stack.size()<2){ok=false;return 0;}long long b=stack.back();stack.pop_back();long long a=stack.back();stack.pop_back();__int128 x=0;
            if(c=='+')x=(__int128)a+b;else if(c=='-')x=(__int128)a-b;else if(c=='*')x=(__int128)a*b;
            else if(c=='/'){if(!b){ok=false;return 0;}x=(__int128)a/b;}
            else{if(b<0||b>INT_MAX){ok=false;return 0;}__int128 base=a;x=1;while(b){if(b&1){x*=base;if(x>LLONG_MAX||x<-LLONG_MAX){ok=false;return 0;}}b>>=1;if(b){base*=base;if(base>LLONG_MAX||base<-LLONG_MAX){ok=false;return 0;}}}}
            if(x>LLONG_MAX||x<-LLONG_MAX){ok=false;return 0;}stack.push_back((long long)x);
        }
        if(stack.size()!=1){ok=false;return 0;}return stack[0];
    }
};
'''
programs={};helpers={}
helpers[4023]=dsu
programs[4023]=r'''
int n,m;cin>>n>>m;vector<tuple<long long,int,int>>edges;while(m--){int a,b;long long w;cin>>a>>b>>w;edges.push_back({w,a-1,b-1});}sort(edges.begin(),edges.end());DSU d(n);vector<pair<int,int>>answer;for(auto[w,a,b]:edges)if(d.join(a,b))answer.push_back(minmax(a+1,b+1));sort(answer.begin(),answer.end());for(auto[a,b]:answer)cout<<a<<" "<<b<<"\n";
'''
for pid in [4024,4025]:
    programs[pid]=r'''
int n;cin>>n;vector<vector<long long>>a(n,vector<long long>(n));for(auto&row:a)for(auto&x:row)cin>>x;vector<long long>d(n,LLONG_MAX);vector<bool>used(n);d[0]=0;long long answer=0;for(int k=0;k<n;k++){int u=-1;for(int i=0;i<n;i++)if(!used[i]&&(u<0||d[i]<d[u]))u=i;used[u]=true;answer+=d[u];for(int v=0;v<n;v++)if(!used[v])d[v]=min(d[v],a[u][v]);}cout<<answer<<"\n";
'''
programs[4026]=r'''
int n;cin>>n;vector<vector<int>>g(n);vector<int>degree(n);for(int i=0;i<n;i++){int v;while(cin>>v&&v){g[i].push_back(v-1);degree[v-1]++;}}priority_queue<int,vector<int>,greater<int>>q;for(int i=0;i<n;i++)if(!degree[i])q.push(i);bool first=true;while(!q.empty()){int u=q.top();q.pop();cout<<(first?"":" ")<<u+1;first=false;for(int v:g[u])if(--degree[v]==0)q.push(v);}cout<<"\n";
'''
programs[4027]=r'''
int n,m;cin>>n>>m;vector<vector<int>>g(n);vector<int>degree(n),bonus(n,100);while(m--){int a,b;cin>>a>>b;g[b-1].push_back(a-1);degree[a-1]++;}queue<int>q;for(int i=0;i<n;i++)if(!degree[i])q.push(i);int count=0;while(!q.empty()){int u=q.front();q.pop();count++;for(int v:g[u]){bonus[v]=max(bonus[v],bonus[u]+1);if(--degree[v]==0)q.push(v);}}if(count<n)cout<<"Poor Xed\n";else cout<<accumulate(bonus.begin(),bonus.end(),0LL)<<"\n";
'''
programs[4028]=r'''
string s;cin>>s;int balance=0;bool ok=true;for(char c:s){if(c=='@')break;if(c=='(')balance++;if(c==')')balance--;if(balance<0)ok=false;}cout<<(ok&&!balance?"YES":"NO")<<"\n";
'''
programs[4029]=r'''
string s;cin>>s;vector<char>stack;bool ok=true;for(char c:s){if(c=='('||c=='[')stack.push_back(c);else{char opening=c==')'?'(':'[';if(stack.empty()||stack.back()!=opening){ok=false;break;}stack.pop_back();}}cout<<(ok&&stack.empty()?"OK":"Wrong")<<"\n";
'''
programs[4030]=r'''
int n;cin>>n;map<char,int>rank={{'<',0},{'(',1},{'[',2},{'{',3}};map<char,char>opening={{'>','<'},{')','('},{']','['},{'}','{'}};while(n--){string s;cin>>s;vector<char>stack;bool ok=true;for(char c:s){if(rank.count(c)){if(!stack.empty()&&rank[c]>rank[stack.back()]){ok=false;break;}stack.push_back(c);}else{if(stack.empty()||stack.back()!=opening[c]){ok=false;break;}stack.pop_back();}}cout<<(ok&&stack.empty()?"YES":"NO")<<"\n";}
'''
helpers[4031]=expr;helpers[4033]=expr
programs[4031]=r'string s;cin>>s;Parser p{s,true};long long answer=p.run();if(p.ok)cout<<answer<<"\n";'
programs[4033]=r'''string s;cin>>s;if(s.empty()||s.back()!='@'){cout<<"NO\n";return 0;}s.pop_back();Parser p{s,false};long long answer=p.run();if(p.ok)cout<<answer<<"\n";else cout<<"NO\n";'''
programs[4032]=r'''
int n;cin>>n;vector<int>stack;int next=1;bool ok=true;for(int i=0;i<n;i++){int x;cin>>x;while(next<=n&&(stack.empty()||stack.back()!=x))stack.push_back(next++);if(stack.empty()||stack.back()!=x)ok=false;else stack.pop_back();}cout<<(ok?"YES":"NO")<<"\n";
'''
programs[4034]=r'''
int a[12][12]={};bool seen[12][12]={};for(int i=1;i<=10;i++)for(int j=1;j<=10;j++)cin>>a[i][j];queue<pair<int,int>>q;q.push({0,0});seen[0][0]=true;int dx[]={-1,1,0,0},dy[]={0,0,-1,1};while(!q.empty()){auto[x,y]=q.front();q.pop();for(int k=0;k<4;k++){int u=x+dx[k],v=y+dy[k];if(u>=0&&u<12&&v>=0&&v<12&&!seen[u][v]&&!a[u][v]){seen[u][v]=true;q.push({u,v});}}}int count=0;for(int i=1;i<=10;i++)for(int j=1;j<=10;j++)count+=!a[i][j]&&!seen[i][j];cout<<count<<"\n";
'''
programs[4035]=r'''
int n,a,b;cin>>n>>a>>b;vector<int>step(n+1),d(n+1,-1);for(int i=1;i<=n;i++)cin>>step[i];queue<int>q;q.push(a);d[a]=0;while(!q.empty()){int u=q.front();q.pop();for(int v:{u-step[u],u+step[u]})if(v>=1&&v<=n&&d[v]<0){d[v]=d[u]+1;q.push(v);}}cout<<d[b]<<"\n";
'''
programs[4036]=r'''
string n;int k;cin>>n>>k;bool g[10][10]={};for(int i=0;i<10;i++)g[i][i]=true;while(k--){int a,b;cin>>a>>b;g[a][b]=true;}for(int j=0;j<10;j++)for(int i=0;i<10;i++)for(int l=0;l<10;l++)g[i][l]=g[i][l]||(g[i][j]&&g[j][l]);long long answer=1;for(char c:n)answer*=count(g[c-'0'],g[c-'0']+10,true);cout<<answer<<"\n";
'''
helpers[4037]=dsu
programs[4037]=r'int n,k;cin>>n>>k;DSU d(n);while(k--){int a,b;cin>>a>>b;d.join(a-1,b-1);}set<int>roots;int largest=0;for(int i=0;i<n;i++){int r=d.find(i);roots.insert(r);largest=max(largest,d.s[r]);}cout<<roots.size()<<" "<<largest<<"\n";'
programs[4038]=r'int depth,ball;cin>>depth>>ball;int u=1;for(int i=1;i<depth;i++){if(ball%2){u=u*2;ball=(ball+1)/2;}else{u=u*2+1;ball/=2;}}cout<<u<<"\n";'
programs[4039]=r'''
string inside,level;cin>>inside>>level;function<string(string)>visit=[&](string s){if(s.empty())return string();char root=0;for(char c:level)if(s.find(c)!=string::npos){root=c;break;}int k=s.find(root);return root+visit(s.substr(0,k))+visit(s.substr(k+1));};cout<<visit(inside)<<"\n";
'''
programs[4040]=r'''
int n;string s;cin>>n>>s;function<char(int,int)>visit=[&](int l,int r){char type;if(r-l==1)type=s[l]=='0'?'B':'I';else{int m=(l+r)/2;char a=visit(l,m),b=visit(m,r);type=a==b?a:'F';}cout<<type;return type;};visit(0,s.size());cout<<"\n";
'''
programs[4041]=r'''
string pre,inside;cin>>pre>>inside;struct Node{char c;int left=-1,right=-1,len=0;};vector<Node>nodes;function<int(string,string)>build=[&](string p,string s){if(p.empty())return -1;int i=nodes.size(),k=s.find(p[0]);nodes.push_back({p[0]});int l=build(p.substr(1,k),s.substr(0,k)),r=build(p.substr(k+1),s.substr(k+1));nodes[i].left=l;nodes[i].right=r;nodes[i].len=l<0&&r<0?1:(l<0?0:nodes[l].len)+(r<0?0:nodes[r].len);return i;};int root=build(pre,inside);function<void(int)>print=[&](int i){if(i<0)return;cout<<string(nodes[i].len,nodes[i].c)<<"\n";print(nodes[i].left);print(nodes[i].right);};print(root);
'''
programs[4042]=r'''
int n,target;cin>>n>>target;vector<int>a(n+1),l(n+1),r(n+1);for(int i=1;i<=n;i++)cin>>a[i]>>l[i]>>r[i];int count=0,answer=0;function<void(int)>visit=[&](int u){if(!u)return;visit(l[u]);count++;if(!answer&&a[u]==target)answer=count;visit(r[u]);};visit(1);cout<<answer<<"\n";
'''
programs[4043]=r'''
string s;cin>>s;bool ok=true;for(size_t i=0;i<s.size();i++)if(s[i]!='#'){bool left=2*i+1<s.size()&&s[2*i+1]!='#',right=2*i+2<s.size()&&s[2*i+2]!='#';if(left!=right)ok=false;}cout<<(ok?"Yes":"No")<<"\n";
'''
programs[4044]=r'''
int n;cin>>n;priority_queue<long long,vector<long long>,greater<long long>>q;while(n--){int x;cin>>x;q.push(x);}long long answer=0;while(q.size()>1){long long x=q.top();q.pop();x+=q.top();q.pop();answer+=x;q.push(x);}cout<<answer<<"\n";
'''
programs[4045]=r'''
int n,m;cin>>n>>m;vector<array<long long,3>>a(n);for(auto&row:a)cin>>row[0]>>row[1]>>row[2];auto value=[&](int i,long long x){return a[i][0]*x*x+a[i][1]*x+a[i][2];};priority_queue<tuple<long long,int,int>,vector<tuple<long long,int,int>>,greater<tuple<long long,int,int>>>q;for(int i=0;i<n;i++)q.push({value(i,1),i,1});for(int k=0;k<m;k++){auto[v,i,x]=q.top();q.pop();cout<<(k?" ":"")<<v;q.push({value(i,x+1),i,x+1});}cout<<"\n";
'''
programs[4046]=r'''
int n;cin>>n;priority_queue<pair<long long,string>>q;while(n--){string op;cin>>op;if(op=="push"){string name;long long p;cin>>name>>p;q.push({p,name});}else if(q.empty())cout<<"none\n";else{auto[p,name]=q.top();q.pop();cout<<name<<" "<<p<<"\n";}}
'''
helpers[4047]=r'''
struct FastInput{
    char buffer[1<<16];size_t at=0,length=0;
    int get(){if(at==length){length=fread(buffer,1,sizeof(buffer),stdin);at=0;if(!length)return EOF;}return (unsigned char)buffer[at++];}
    int next(){int c=get();while(c!=EOF&&c<=32)c=get();int x=0;while(c!=EOF&&c>32){x=x*10+c-'0';c=get();}return x;}
};
'''
programs[4047]=r'''
FastInput in;int days=in.next(),id=0;
using Bill=pair<int,int>;
vector<Bill>lowStorage,highStorage;lowStorage.reserve(days*100);highStorage.reserve(days*100);
priority_queue<Bill,vector<Bill>,greater<Bill>>low(greater<Bill>(),move(lowStorage));
priority_queue<Bill,vector<Bill>>high(less<Bill>(),move(highStorage));
vector<char>paid;paid.reserve(days*100);string output;output.reserve(days*22);
while(days--){
    int m=in.next();while(m--){int value=in.next();low.push({value,id});high.push({value,id});paid.push_back(false);id++;}
    while(paid[low.top().second])low.pop();Bill a=low.top();low.pop();paid[a.second]=true;
    while(paid[high.top().second])high.pop();Bill b=high.top();high.pop();paid[b.second]=true;
    output+=to_string(a.first)+" "+to_string(b.first)+"\n";
}
fwrite(output.data(),1,output.size(),stdout);
'''
programs[4048]=r'''
int n;cin>>n;vector<int>f(n),d(n),t(max(0,n-1));for(int&x:f)cin>>x;for(int&x:d)cin>>x;for(int&x:t)cin>>x;int T;cin>>T;long long best=0;int spent=0;for(int last=0;last<n;last++){if(last)spent+=t[last-1];int remaining=T-spent;if(remaining<=0)continue;priority_queue<pair<int,int>>q;for(int i=0;i<=last;i++)q.push({f[i],i});long long answer=0;while(remaining--){auto[x,i]=q.top();q.pop();answer+=x;q.push({max(0,x-d[i]),i});}best=max(best,answer);}cout<<best<<"\n";
'''
programs[4049]=r'''
long long startx,starty;cin>>startx>>starty;long long a,b,c,d;long double distance=0;while(cin>>a>>b>>c>>d)distance+=hypotl((long double)a-c,(long double)b-d);long long minutes=llroundl(distance*2*60/20000);cout<<minutes/60<<":"<<setw(2)<<setfill('0')<<minutes%60<<"\n";
'''
programs[4050]=r'''
int m;cin>>m;vector<multiset<pair<int,int>>>g(501);vector<int>degree(501);for(int i=0;i<m;i++){int a,b;cin>>a>>b;g[a].insert({b,i});g[b].insert({a,i});degree[a]++;degree[b]++;}int start=1;while(!degree[start])start++;for(int i=1;i<=500;i++)if(degree[i]%2){start=i;break;}vector<bool>used(m);vector<int>stack{start},path;while(!stack.empty()){int u=stack.back();while(!g[u].empty()&&used[g[u].begin()->second])g[u].erase(g[u].begin());if(g[u].empty()){path.push_back(u);stack.pop_back();}else{auto[v,id]=*g[u].begin();g[u].erase(g[u].begin());used[id]=true;stack.push_back(v);}}reverse(path.begin(),path.end());for(int x:path)cout<<x<<"\n";
'''
for pid in [4051,4054,4056,4057]:
    helpers[pid]=shortest
    prefix='int n,m,s,t;cin>>n>>m>>s>>t;' if pid==4054 else 'int n,m;cin>>n>>m;int s=1,t=n;'
    suffix='long long answer=*max_element(d.begin(),d.end());' if pid==4051 else 'long long answer=d[t-1];'
    programs[pid]=prefix+r'vector<vector<pair<int,long long>>>g(n);while(m--){int a,b;long long w;cin>>a>>b>>w;g[a-1].push_back({b-1,w});g[b-1].push_back({a-1,w});}auto d=shortest(g,s-1);'+suffix+r'cout<<(answer==LLONG_MAX/4?-1:answer)<<"\n";'
programs[4052]=r'''
int m,n;cin>>m>>n;string line;getline(cin,line);vector<vector<int>>g(n);for(int i=0;i<m;i++){getline(cin,line);istringstream in(line);vector<int>a;int x;while(in>>x)a.push_back(x-1);for(size_t j=0;j<a.size();j++)for(size_t k=j+1;k<a.size();k++)g[a[j]].push_back(a[k]);}vector<int>d(n,-1);queue<int>q;q.push(0);d[0]=0;while(!q.empty()){int u=q.front();q.pop();for(int v:g[u])if(d[v]<0){d[v]=d[u]+1;q.push(v);}}if(d[n-1]<0)cout<<"NO\n";else cout<<max(0,d[n-1]-1)<<"\n";
'''
programs[4053]=r'''
int n,start;cin>>n>>start;const long long INF=LLONG_MAX/4;vector<vector<long long>>d(n,vector<long long>(n,INF));for(int i=0;i<n;i++)for(int j=0;j<n;j++){string s;cin>>s;if(s!="-")d[i][j]=stoll(s);}for(int k=0;k<n;k++)for(int i=0;i<n;i++)if(d[i][k]!=INF)for(int j=0;j<n;j++)if(d[k][j]!=INF)d[i][j]=min(d[i][j],d[i][k]+d[k][j]);for(int i=0;i<n;i++)if(i!=start-1){cout<<"("<<start<<" -> "<<i+1<<") = ";if(d[start-1][i]==INF)cout<<"INF\n";else cout<<d[start-1][i]<<"\n";}
'''
programs[4055]=r'''
int n,p,c;long long m;cin>>n>>p>>c>>m;vector<vector<int>>g(n);while(p--){int a,b;cin>>a>>b;g[a-1].push_back(b-1);g[b-1].push_back(a-1);}vector<int>d(n,-1);queue<int>q;q.push(c-1);d[c-1]=0;while(!q.empty()){int u=q.front();q.pop();for(int v:g[u])if(d[v]<0){d[v]=d[u]+1;q.push(v);}}cout<<*max_element(d.begin(),d.end())+m+1<<"\n";
'''
programs[4058]=r'''
int n;cin>>n;vector<vector<int>>g(n);for(auto&row:g){int v;while(cin>>v&&v)row.push_back(v-1);}vector<int>num(n,-1),low(n),component(n,-1),stack;vector<bool>active(n);int clock=0,count=0;function<void(int)>dfs=[&](int u){num[u]=low[u]=clock++;stack.push_back(u);active[u]=true;for(int v:g[u])if(num[v]<0){dfs(v);low[u]=min(low[u],low[v]);}else if(active[v])low[u]=min(low[u],num[v]);if(low[u]==num[u]){while(true){int v=stack.back();stack.pop_back();active[v]=false;component[v]=count;if(v==u)break;}count++;}};for(int u=0;u<n;u++)if(num[u]<0)dfs(u);vector<bool>incoming(count);for(int u=0;u<n;u++)for(int v:g[u])if(component[u]!=component[v])incoming[component[v]]=true;cout<<std::count(incoming.begin(),incoming.end(),false)<<"\n";
'''
programs[4059]=r'''
int n,m;cin>>n>>m;vector<vector<bool>>r(n,vector<bool>(n));while(m--){int a,b;cin>>a>>b;r[a-1][b-1]=true;}for(int k=0;k<n;k++)for(int i=0;i<n;i++)for(int j=0;j<n;j++)r[i][j]=r[i][j]||(r[i][k]&&r[k][j]);int answer=0;for(int i=0;i<n;i++){int lower=0,upper=0;for(int j=0;j<n;j++){lower+=r[i][j];upper+=r[j][i];}answer+=lower>n/2||upper>n/2;}cout<<answer<<"\n";
'''
helpers[4060]=dsu
programs[4060]=r'''
int n,m;cin>>n>>m;DSU d(2*n);while(m--){int p,a,b;cin>>p>>a>>b;--a;--b;if(!p){d.join(a,b);d.join(a+n,b+n);}else{d.join(a,b+n);d.join(a+n,b);}}set<int>groups;for(int i=0;i<n;i++)groups.insert(d.find(i));cout<<groups.size()<<"\n";
'''
helpers[4061]=dsu
programs[4061]=r'''
int n;cin>>n;vector<vector<int>>g(n);for(int i=0;i<n;i++){int count;cin>>count;while(count--){int v;cin>>v;g[i].push_back(v-1);}}DSU d(n);vector<bool>active(n);int largest=0,answer=0;for(int u=n-1;u>=0;u--){active[u]=true;largest=max(largest,1);for(int v:g[u])if(active[v]){d.join(u,v);largest=max(largest,d.s[d.find(u)]);}if(largest>n/2){answer=u+1;break;}}cout<<answer<<"\n";
'''
helpers[4062]=dsu
programs[4062]=r'''
int n,m,budget;cin>>n>>m>>budget;vector<long long>price(n),value(n);for(int i=0;i<n;i++)cin>>price[i]>>value[i];DSU d(n);while(m--){int a,b;cin>>a>>b;d.join(a-1,b-1);}vector<long long>p(n),v(n);for(int i=0;i<n;i++){int r=d.find(i);p[r]+=price[i];v[r]+=value[i];}vector<long long>dp(budget+1);for(int i=0;i<n;i++)if(d.find(i)==i&&p[i]<=budget)for(int x=budget;x>=p[i];x--)dp[x]=max(dp[x],dp[x-p[i]]+v[i]);cout<<dp[budget]<<"\n";
'''
programs[4063]=r'''
map<string,string>father;string token,current;auto root=[&](string x){while(father[x]!=x)x=father[x];return x;};while(cin>>token&&token!="$"){string name=token.substr(1);if(!father.count(name))father[name]=name;if(token[0]=='#')current=name;else if(token[0]=='+')father[name]=current;else cout<<name<<" "<<root(name)<<"\n";}
'''
helpers[4064]=dsu
programs[4064]=r'''
int n,m;cin>>n>>m;DSU d(n);while(m--){char op;int a;cin>>op>>a;if(op=='M'){int b;cin>>b;d.join(a-1,b-1);}else cout<<d.s[d.find(a-1)]<<"\n";}
'''
helpers[4065]=dsu
programs[4065]=r'''
int n,k;cin>>n>>k;DSU d(3*n);int lies=0;while(k--){int type,a,b;cin>>type>>a>>b;--a;--b;if(a<0||a>=n||b<0||b>=n){lies++;continue;}if(type==1){if(d.find(a)==d.find(b+n)||d.find(a)==d.find(b+2*n))lies++;else for(int j=0;j<3;j++)d.join(a+j*n,b+j*n);}else{if(d.find(a)==d.find(b)||d.find(a)==d.find(b+2*n))lies++;else for(int j=0;j<3;j++)d.join(a+j*n,b+((j+1)%3)*n);}}cout<<lies<<"\n";
'''
for pid in [4066,4067]:
    helpers[pid]=dsu
    tail=r'cout<<total-cost<<"\n";' if pid==4066 else r'cout<<n-1<<" "<<largest<<"\n";'
    programs[pid]=r'int n,m;cin>>n>>m;vector<tuple<long long,int,int>>edges;long long total=0;while(m--){int a,b;long long w;cin>>a>>b>>w;total+=w;edges.push_back({w,a-1,b-1});}sort(edges.begin(),edges.end());DSU d(n);long long cost=0,largest=0;for(auto[w,a,b]:edges)if(d.join(a,b)){cost+=w;largest=max(largest,w);}'+tail
helpers[4068]=dsu
programs[4068]=r'''
int n,m;cin>>n>>m;DSU d(n);long long cost=0;vector<tuple<long long,int,int>>edges;while(m--){int p,a,b;long long w;cin>>p>>a>>b>>w;if(p==1){cost+=w;d.join(a-1,b-1);}else edges.push_back({w,a-1,b-1});}sort(edges.begin(),edges.end());for(auto[w,a,b]:edges)if(d.join(a,b))cost+=w;cout<<cost<<"\n";
'''
helpers[4069]=dsu
programs[4069]=r'''
int m,n;cin>>m>>n;DSU d(m*n);int a,b,c,e;while(cin>>a>>b>>c>>e)d.join((a-1)*n+b-1,(c-1)*n+e-1);long long answer=0;for(int i=0;i+1<m;i++)for(int j=0;j<n;j++)if(d.join(i*n+j,(i+1)*n+j))answer++;for(int i=0;i<m;i++)for(int j=0;j+1<n;j++)if(d.join(i*n+j,i*n+j+1))answer+=2;cout<<answer<<"\n";
'''
programs[4070]=r'''
int n;cin>>n;vector<array<int,4>>a(n);for(auto&row:a)for(int&x:row)cin>>x;vector<vector<int>>g(n);for(int i=0;i<n;i++){int x,y;cin>>x>>y;for(int j=0;j<n;j++)if(a[j][0]<=x&&x<=a[j][1]&&a[j][2]<=y&&y<=a[j][3])g[j].push_back(i);}auto match=[&](int blocku,int blockv,vector<int>&mate){mate.assign(n,-1);function<bool(int,vector<bool>&)>dfs=[&](int u,vector<bool>&used){for(int v:g[u])if(!(u==blocku&&v==blockv)&&!used[v]){used[v]=true;if(mate[v]<0||dfs(mate[v],used)){mate[v]=u;return true;}}return false;};for(int u=0;u<n;u++){vector<bool>used(n);if(!dfs(u,used))return false;}return true;};vector<int>mate,result(n),test;if(!match(-1,-1,mate)){cout<<"None\n";return 0;}for(int v=0;v<n;v++)result[mate[v]]=v;for(int u=0;u<n;u++)if(match(u,result[u],test)){cout<<"None\n";return 0;}for(int u=0;u<n;u++)cout<<char('A'+u)<<" "<<result[u]+1<<"\n";
'''
programs[4071]=r'''
int n;cin>>n;vector<string>words(n);array<bool,26>present{};for(string&s:words){cin>>s;for(char c:s)present[c-'a']=true;}string target;cin>>target;for(char c:target)present[c-'a']=true;bool g[26][26]={};int degree[26]={};for(int i=0;i+1<n;i++){size_t k=0;while(k<words[i].size()&&k<words[i+1].size()&&words[i][k]==words[i+1][k])k++;if(k==min(words[i].size(),words[i+1].size())){if(words[i].size()>words[i+1].size()){cout<<"0\n";return 0;}}else{int a=words[i][k]-'a',b=words[i+1][k]-'a';if(!g[a][b]){g[a][b]=true;degree[b]++;}}}vector<int>order;while(order.size()<count(present.begin(),present.end(),true)){int u=-1,candidates=0;for(int i=0;i<26;i++)if(present[i]&&degree[i]==0){u=i;candidates++;}if(candidates!=1){cout<<"0\n";return 0;}degree[u]=-1;order.push_back(u);for(int v=0;v<26;v++)if(g[u][v])degree[v]--;}char map[26]={};for(size_t i=0;i<order.size();i++)map[order[i]]='a'+i;for(char c:target)cout<<map[c-'a'];cout<<"\n";
'''
assert set(programs)==set(range(4023,4072))
for pid,code in programs.items():
    (root/f'{pid}.cpp').write_text(header+helpers.get(pid,'')+'\nint main(){ios::sync_with_stdio(false);cin.tie(nullptr);\n'+code+'\nreturn 0;\n}\n',encoding='utf-8')
print('TRAINING_CHAPTER8_REFERENCES_READY',len(programs))
