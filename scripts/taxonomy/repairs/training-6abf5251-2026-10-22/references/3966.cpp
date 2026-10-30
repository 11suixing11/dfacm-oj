#include <bits/stdc++.h>
using namespace std;
int main(){int n,target;cin>>n>>target;vector<long long>d(target+1);d[0]=1;while(n--){int x;cin>>x;for(int j=target;j>=x;j--)d[j]+=d[j-x];}cout<<d[target]<<"\n";}
