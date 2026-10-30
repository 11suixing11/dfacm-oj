#include <bits/stdc++.h>
using namespace std;
int main(){int t;cin>>t;while(t--){string s,a;int k;cin>>s>>k;for(char c:s){while(k&&!a.empty()&&a.back()>c){a.pop_back();k--;}a+=c;}while(k--){a.pop_back();}cout<<a<<"\n";}}
