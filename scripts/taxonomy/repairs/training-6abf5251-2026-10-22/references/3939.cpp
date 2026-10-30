#include <bits/stdc++.h>
using namespace std;
int peak(vector<int>a){int n=a.size();vector<int>l(n,1),r(n,1);for(int i=0;i<n;i++)for(int j=0;j<i;j++)if(a[j]<a[i])l[i]=max(l[i],l[j]+1);for(int i=n-1;i>=0;i--)for(int j=n-1;j>i;j--)if(a[j]<a[i])r[i]=max(r[i],r[j]+1);int best=0;for(int i=0;i<n;i++)best=max(best,l[i]+r[i]-1);return best;}int main(){int n;cin>>n;vector<int>a(n);for(int&x:a)cin>>x;cout<<n-peak(a)<<"\n";}
