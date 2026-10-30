#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;map<int,int>counts;while(n--){int x;cin>>x;counts[x]++;}for(auto [x,k]:counts)cout<<x<<' '<<k<<"\n";}
