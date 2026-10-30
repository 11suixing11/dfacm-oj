#include <bits/stdc++.h>
using namespace std;
int main(){int n,x,c[4]={};cin>>n;for(int i=0;i<n;i++){cin>>x;c[x<=18?0:x<=35?1:x<=60?2:3]++;}for(auto x:c)cout<<fixed<<setprecision(2)<<100.0*x/n<<"%\n";}
