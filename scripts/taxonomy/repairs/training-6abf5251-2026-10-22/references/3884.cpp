#include <bits/stdc++.h>
using namespace std;
string repr(int n){string s;for(int k=14;k>=0;k--)if(n&(1<<k)){if(!s.empty())s+='+';s+=k==0?"2(0)":k==1?"2":"2("+repr(k)+")";}return s;}int main(){int n;cin>>n;cout<<repr(n)<<"\n";}
