#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;vector<long long>a(n);for(auto &x:a)cin>>x;reverse(a.begin(),a.end());for(int i=0;i<n;i++)cout<<(i?" ":"")<<a[i];cout<<"\n";}
