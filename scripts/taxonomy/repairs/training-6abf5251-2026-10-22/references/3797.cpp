#include <bits/stdc++.h>
using namespace std;
int main(){int n,m;cin>>n>>m;long long s=0,x;for(int i=0;i<n;i++)for(int j=0;j<m;j++){cin>>x;if(i==0||i==n-1||j==0||j==m-1)s+=x;}cout<<s<<"\n";}
