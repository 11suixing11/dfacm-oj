#include <bits/stdc++.h>
using namespace std;
int main(){int n;long long b;cin>>n>>b;vector<int>a(n);for(int&x:a)cin>>x;sort(a.rbegin(),a.rend());long long sum=0;for(int i=0;i<n;i++){sum+=a[i];if(sum>=b){cout<<i+1<<"\n";break;}}}
