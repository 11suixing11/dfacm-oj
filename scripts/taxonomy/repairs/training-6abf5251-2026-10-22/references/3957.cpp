#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;vector<vector<int>>a(n,vector<int>(n));for(auto&r:a)for(int&x:r)cin>>x;int best=INT_MIN;for(int top=0;top<n;top++){vector<int>s(n);for(int bottom=top;bottom<n;bottom++){int current=0;for(int j=0;j<n;j++){s[j]+=a[bottom][j];current=max(s[j],current+s[j]);best=max(best,current);}}}cout<<best<<"\n";}
