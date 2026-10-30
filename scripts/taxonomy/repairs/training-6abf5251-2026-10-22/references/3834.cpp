#include <bits/stdc++.h>
using namespace std;
long long sum(long long n){if(n<=1)return n;long long k=n/2;return 2*sum(k)+k*k+(n%2?n:0);}int main(){long long n;cin>>n;cout<<sum(n)<<"\n";}
