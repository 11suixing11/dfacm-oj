#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n;cin>>n;vector<long long>a(n);for(auto&x:a)cin>>x;long long average=accumulate(a.begin(),a.end(),0LL)/n;int answer=0;for(int i=0;i+1<n;i++)if(a[i]!=average){a[i+1]+=a[i]-average;answer++;}cout<<answer<<"\n";

return 0;
}
