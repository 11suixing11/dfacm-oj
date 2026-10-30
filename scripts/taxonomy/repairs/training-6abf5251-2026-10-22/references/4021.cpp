#include <bits/stdc++.h>
using namespace std;

struct DSU{vector<int>p,s;DSU(int n):p(n),s(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}bool join(int a,int b){a=find(a);b=find(b);if(a==b)return false;if(s[a]<s[b])swap(a,b);p[b]=a;s[a]+=s[b];return true;}};

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n,m;cin>>n>>m;DSU d(n+1);while(m--){int a,b;cin>>a>>b;d.join(a,b);}int q;cin>>q;while(q--){int a,b;cin>>a>>b;cout<<(d.find(a)==d.find(b)?"Yes":"No")<<"\n";}

return 0;
}
