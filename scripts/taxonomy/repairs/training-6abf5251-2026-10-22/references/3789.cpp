#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;vector<long long>a(n);for(auto&x:a)cin>>x;long long mx=*max_element(a.begin(),a.end()),sum=0;for(auto x:a)if(x!=mx)sum+=x;cout<<sum<<"\n";}
