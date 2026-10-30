#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;long long all=1,north=1,east=0,west=0;for(int i=0;i<n;i++){auto nn=all,ee=north+east,ww=north+west;north=nn;east=ee;west=ww;all=north+east+west;}cout<<all<<"\n";}
