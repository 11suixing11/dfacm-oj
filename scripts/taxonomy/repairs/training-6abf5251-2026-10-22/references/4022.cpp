#include <bits/stdc++.h>
using namespace std;

struct DSU{vector<int>p,s;DSU(int n):p(n),s(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}bool join(int a,int b){a=find(a);b=find(b);if(a==b)return false;if(s[a]<s[b])swap(a,b);p[b]=a;s[a]+=s[b];return true;}};

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n,m;cin>>n>>m;DSU d(n*n);int answer=0;for(int step=1;step<=m;step++){int x,y;char kind;cin>>x>>y>>kind;--x;--y;int a=x*n+y,b=(x+(kind=='D'))*n+y+(kind=='R');if(!answer&&!d.join(a,b))answer=step;}if(answer)cout<<answer<<"\n";else cout<<"draw\n";

return 0;
}
