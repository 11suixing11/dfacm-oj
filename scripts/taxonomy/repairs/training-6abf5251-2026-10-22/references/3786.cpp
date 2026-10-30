#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;vector<int>a(n);for(auto&x:a)cin>>x;int x;cin>>x;auto it=find(a.begin(),a.end(),x);cout<<(it==a.end()?-1:int(it-a.begin()+1))<<"\n";}
