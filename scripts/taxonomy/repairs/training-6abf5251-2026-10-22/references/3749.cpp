#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;long double sum=0,x,y;long long p;while(n--){cin>>x>>y>>p;sum+=hypotl(x,y)/25+1.5L*p;}cout<<(long long)ceill(sum)<<"\n";}
