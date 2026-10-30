#include <bits/stdc++.h>
using namespace std;
int main(){int m,n;cin>>m>>n;vector<long long>a(n,1);for(int i=1;i<m;i++)for(int j=1;j<n;j++)a[j]+=a[j-1];cout<<a.back()<<"\n";}
