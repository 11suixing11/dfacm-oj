#include <bits/stdc++.h>
using namespace std;
int main(){int n;while(cin>>n){long long sum=0,largest=0,x;for(int i=0;i<n;i++){cin>>x;sum+=x;largest=max(largest,x);}long long twice=min(sum,2*(sum-largest));cout<<twice/2<<'.'<<(twice%2?'5':'0')<<"\n";}}
