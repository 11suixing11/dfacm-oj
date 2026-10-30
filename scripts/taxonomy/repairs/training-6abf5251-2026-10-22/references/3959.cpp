#include <bits/stdc++.h>
using namespace std;
int main(){int t;cin>>t;while(t--){int r,c;cin>>r>>c;vector<long long>d(c+1,LLONG_MIN/4);d[1]=0;for(int i=0;i<r;i++)for(int j=1;j<=c;j++){int x;cin>>x;d[j]=max(d[j],d[j-1])+x;}cout<<d[c]<<"\n";}}
