#include <bits/stdc++.h>
using namespace std;

struct DSU{vector<int>p,s;DSU(int n):p(n),s(n,1){iota(p.begin(),p.end(),0);}int find(int x){while(p[x]!=x){p[x]=p[p[x]];x=p[x];}return x;}bool join(int a,int b){a=find(a);b=find(b);if(a==b)return false;if(s[a]<s[b])swap(a,b);p[b]=a;s[a]+=s[b];return true;}};

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);
int n,k;cin>>n>>k;DSU d(n);while(k--){int a,b;cin>>a>>b;d.join(a-1,b-1);}set<int>roots;int largest=0;for(int i=0;i<n;i++){int r=d.find(i);roots.insert(r);largest=max(largest,d.s[r]);}cout<<roots.size()<<" "<<largest<<"\n";
return 0;
}
