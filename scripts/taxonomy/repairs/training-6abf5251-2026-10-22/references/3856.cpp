#include <bits/stdc++.h>
using namespace std;
int main(){int n,m;cin>>n>>m;vector<pair<int,int>>a(n);for(auto&x:a){cin>>x.second>>x.first;x.first=-x.first;}sort(a.begin(),a.end());int cut=-a[m*3/2-1].first,k=0;while(k<n&&-a[k].first>=cut)k++;cout<<cut<<" "<<k<<"\n";for(int i=0;i<k;i++)cout<<a[i].second<<" "<<-a[i].first<<"\n";}
