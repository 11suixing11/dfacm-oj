#include <bits/stdc++.h>
using namespace std;
int main(){int n,x;cin>>n;unordered_set<int>seen;bool first=true;while(n--){cin>>x;if(seen.insert(x).second){if(!first)cout<<" ";cout<<x;first=false;}}cout<<"\n";}
