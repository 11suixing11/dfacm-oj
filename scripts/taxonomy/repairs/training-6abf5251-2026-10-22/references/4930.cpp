#include <bits/stdc++.h>
using namespace std;
int main(){int l,m;cin>>l>>m;vector<bool> removed(l+1);while(m--){int a,b;cin>>a>>b;for(int x=a;x<=b;x++)removed[x]=true;}cout<<count(removed.begin(),removed.end(),false)<<"\n";}
