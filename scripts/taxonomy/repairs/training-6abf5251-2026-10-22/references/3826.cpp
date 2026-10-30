#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;vector<int>s(n+1);for(int d=1;d<=n/2;d++)for(int x=2*d;x<=n;x+=d)s[x]+=d;for(int x=2;x<=n;x++)if(s[x]==x)cout<<x<<"\n";}
