#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;set<int>values;while(n--){int x;cin>>x;values.insert(x);}bool first=true;for(int x:values){if(!first)cout<<' ';first=false;cout<<x;}cout<<"\n";}
