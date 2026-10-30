#include <bits/stdc++.h>
using namespace std;

struct DSU{vector<int>p,s;DSU(int n):p(n),s(n,1){iota(p.begin(),p.end(),0);}int find(int x){while(p[x]!=x){p[x]=p[p[x]];x=p[x];}return x;}bool join(int a,int b){a=find(a);b=find(b);if(a==b)return false;if(s[a]<s[b])swap(a,b);p[b]=a;s[a]+=s[b];return true;}};

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n,k;cin>>n>>k;DSU d(3*n);int lies=0;while(k--){int type,a,b;cin>>type>>a>>b;--a;--b;if(a<0||a>=n||b<0||b>=n){lies++;continue;}if(type==1){if(d.find(a)==d.find(b+n)||d.find(a)==d.find(b+2*n))lies++;else for(int j=0;j<3;j++)d.join(a+j*n,b+j*n);}else{if(d.find(a)==d.find(b)||d.find(a)==d.find(b+2*n))lies++;else for(int j=0;j<3;j++)d.join(a+j*n,b+((j+1)%3)*n);}}cout<<lies<<"\n";

return 0;
}
