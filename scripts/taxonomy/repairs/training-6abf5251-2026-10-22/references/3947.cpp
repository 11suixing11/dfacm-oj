#include <bits/stdc++.h>
using namespace std;
int main(){int cap,n,groups;cin>>cap>>n>>groups;vector<vector<pair<int,long long>>>a(groups+1);while(n--){int w,g;long long value;cin>>w>>value>>g;a[g].push_back({w,value});}vector<long long>d(cap+1);for(auto&group:a)for(int j=cap;j>=0;j--)for(auto[w,value]:group)if(w<=j)d[j]=max(d[j],d[j-w]+value);cout<<d[cap]<<"\n";}
