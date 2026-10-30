#include <bits/stdc++.h>
using namespace std;
int main(){int t;cin>>t;while(t--){int n,k;cin>>n>>k;vector<int>a(n),p(n);for(int&x:a)cin>>x;for(int&x:p)cin>>x;vector<long long>d(n+1);for(int i=0;i<n;i++){d[i+1]=d[i];for(int j=0;j<=i;j++)if(j==0||a[i]-a[j-1]>k)d[i+1]=max(d[i+1],d[j]+p[i]);}cout<<d[n]<<"\n";}}
