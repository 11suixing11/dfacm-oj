#include <bits/stdc++.h>
using namespace std;
int main(){long long m;int k;cin>>m>>k;string s=to_string(m);cout<<(m%19==0&&count(s.begin(),s.end(),'3')==k?"YES":"NO")<<"\n";}
