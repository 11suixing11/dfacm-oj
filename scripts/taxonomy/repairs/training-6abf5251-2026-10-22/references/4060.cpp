#include <bits/stdc++.h>
using namespace std;

struct DSU{vector<int>p,s;DSU(int n):p(n),s(n,1){iota(p.begin(),p.end(),0);}int find(int x){while(p[x]!=x){p[x]=p[p[x]];x=p[x];}return x;}bool join(int a,int b){a=find(a);b=find(b);if(a==b)return false;if(s[a]<s[b])swap(a,b);p[b]=a;s[a]+=s[b];return true;}};

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n,m;cin>>n>>m;DSU d(2*n);while(m--){int p,a,b;cin>>p>>a>>b;--a;--b;if(!p){d.join(a,b);d.join(a+n,b+n);}else{d.join(a,b+n);d.join(a+n,b);}}set<int>groups;for(int i=0;i<n;i++)groups.insert(d.find(i));cout<<groups.size()<<"\n";

return 0;
}
