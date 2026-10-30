#include <bits/stdc++.h>
using namespace std;
int main(){long long n;cin>>n;while(n!=1){long long next=n%2?3*n+1:n/2;cout<<n<<(n%2?"*3+1=":"/2=")<<next<<"\n";n=next;}cout<<"End\n";}
