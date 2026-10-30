#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;vector<int>bit(n+1);long long count=0;for(int i=0;i<n;i++){int x;cin>>x;int small=0;for(int j=x;j;j-=j&-j)small+=bit[j];count+=i-small;for(int j=x;j<=n;j+=j&-j)bit[j]++;}cout<<count<<"\n";}
