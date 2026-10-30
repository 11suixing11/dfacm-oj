#include <bits/stdc++.h>
using namespace std;
int main(){long long m,x;int n,fail=0;cin>>m>>n;while(n--){cin>>x;if(x<=m)m-=x;else fail++;}cout<<fail<<"\n";}
