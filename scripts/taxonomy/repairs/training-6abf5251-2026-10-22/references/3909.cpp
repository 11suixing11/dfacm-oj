#include <bits/stdc++.h>
using namespace std;
int power(int a,int n){int b=1;while(n){if(n&1)b=b*a%10000;a=a*a%10000;n>>=1;}return b;}int main(){int k;cin>>k;while(k--){string s;cin>>s;int result=1;for(char c:s)result=power(result,10)*power(2011,c-'0')%10000;cout<<result<<"\n";}}
