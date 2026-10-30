#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;vector<bool>p(n+1,true);p[0]=p[1]=false;for(int d=2;d*d<=n;d++)if(p[d])for(int x=d*d;x<=n;x+=d)p[x]=false;cout<<count(p.begin(),p.end(),true)<<"\n";}
