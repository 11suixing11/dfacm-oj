#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;vector<pair<int,int>>a(n);for(auto&[x,y]:a)cin>>x>>y;sort(a.begin(),a.end());int left=a[0].first,right=a[0].second;for(int i=1;i<n;i++){if(a[i].first>right){cout<<"no\n";return 0;}right=max(right,a[i].second);}cout<<left<<' '<<right<<"\n";}
