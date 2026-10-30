#include <bits/stdc++.h>
using namespace std;
int main(){int n,x;cin>>n;set<int>a;while(n--){cin>>x;a.insert(x);}cout<<a.size()<<"\n";bool first=true;for(int x:a){cout<<(first?"":" ")<<x;first=false;}cout<<"\n";}
