#include <bits/stdc++.h>
using namespace std;
int main(){int n,k;cin>>n;vector<int>a(n);for(int&x:a)cin>>x;cin>>k;sort(a.rbegin(),a.rend());for(int i=0;i<k;i++)cout<<a[i]<<"\n";}
