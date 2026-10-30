#include <bits/stdc++.h>
using namespace std;
int main(){int a[10],h;for(auto&x:a)cin>>x;cin>>h;cout<<count_if(a,a+10,[&](int x){return x<=h+30;})<<"\n";}
