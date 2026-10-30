#include <bits/stdc++.h>
using namespace std;
int main(){int n,x,lo=INT_MAX,hi=INT_MIN;cin>>n;while(n--){cin>>x;lo=min(lo,x);hi=max(hi,x);}cout<<hi-lo<<"\n";}
