#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;vector<long long>a(n);vector<int>d(n,1),p(n,-1);for(auto&x:a)cin>>x;int best=0;for(int i=0;i<n;i++){for(int j=0;j<i;j++)if(a[j]<=a[i]&&d[j]+1>d[i]){d[i]=d[j]+1;p[i]=j;}if(d[i]>d[best])best=i;}vector<long long>s;for(int i=best;i>=0;i=p[i])s.push_back(a[i]);reverse(s.begin(),s.end());cout<<"max="<<s.size()<<"\n";for(auto x:s)cout<<x<<' ';cout<<"\n";}
