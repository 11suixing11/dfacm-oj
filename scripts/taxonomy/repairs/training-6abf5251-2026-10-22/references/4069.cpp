#include <bits/stdc++.h>
using namespace std;

struct DSU{vector<int>p,s;DSU(int n):p(n),s(n,1){iota(p.begin(),p.end(),0);}int find(int x){while(p[x]!=x){p[x]=p[p[x]];x=p[x];}return x;}bool join(int a,int b){a=find(a);b=find(b);if(a==b)return false;if(s[a]<s[b])swap(a,b);p[b]=a;s[a]+=s[b];return true;}};

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int m,n;cin>>m>>n;DSU d(m*n);int a,b,c,e;while(cin>>a>>b>>c>>e)d.join((a-1)*n+b-1,(c-1)*n+e-1);long long answer=0;for(int i=0;i+1<m;i++)for(int j=0;j<n;j++)if(d.join(i*n+j,(i+1)*n+j))answer++;for(int i=0;i<m;i++)for(int j=0;j+1<n;j++)if(d.join(i*n+j,i*n+j+1))answer+=2;cout<<answer<<"\n";

return 0;
}
