#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;vector<int>a(1000001);a[1]=a[2]=1;for(int i=3;i<=1000000;i++)a[i]=(a[i-1]+a[i-2])%1000;while(n--){int x;cin>>x;cout<<a[x]<<"\n";}}
