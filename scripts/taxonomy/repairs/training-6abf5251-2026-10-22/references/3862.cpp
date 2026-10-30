#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;vector<int>a(n);for(auto&x:a)cin>>x;sort(a.begin(),a.end());if(count(a.begin(),a.end(),a[n/2])>n/2)cout<<a[n/2];else cout<<"no";cout<<"\n";}
