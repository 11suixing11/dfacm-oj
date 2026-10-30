#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;long long s[3]={};while(n--)for(int i=0;i<3;i++){long long x;cin>>x;s[i]+=x;}cout<<s[0]<<" "<<s[1]<<" "<<s[2]<<" "<<s[0]+s[1]+s[2]<<"\n";}
