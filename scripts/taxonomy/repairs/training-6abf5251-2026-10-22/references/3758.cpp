#include <bits/stdc++.h>
using namespace std;
int main(){int a,b,n;cin>>a>>b>>n;int digit=0;for(int i=0;i<n;i++){a*=10;digit=a/b;a%=b;}cout<<digit<<"\n";}
