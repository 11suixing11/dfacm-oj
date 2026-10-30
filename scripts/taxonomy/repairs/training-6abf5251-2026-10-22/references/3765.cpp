#include <bits/stdc++.h>
using namespace std;
int main(){long long n;cin>>n;bool neg=n<0;n=abs(n);long long r=0;while(n){r=r*10+n%10;n/=10;}cout<<(neg?-r:r)<<"\n";}
