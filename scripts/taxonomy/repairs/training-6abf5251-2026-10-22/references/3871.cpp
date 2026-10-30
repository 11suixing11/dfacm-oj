#include <bits/stdc++.h>
using namespace std;
int main(){int n,k,x;cin>>n>>k;vector<bool>a(k);a[0]=true;while(n--){cin>>x;x%=k;vector<bool>b(k);for(int i=0;i<k;i++)if(a[i]){b[(i+x)%k]=true;b[(i-x+k)%k]=true;}a=b;}cout<<(a[0]?"YES":"NO")<<"\n";}
