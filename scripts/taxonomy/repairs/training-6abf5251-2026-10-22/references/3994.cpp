#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n;cin>>n;vector<pair<long long,int>>a(n);for(int i=0;i<n;i++){cin>>a[i].first;a[i].second=i+1;}sort(a.begin(),a.end());long long time=0,wait=0;for(int i=0;i<n;i++){cout<<(i?" ":"")<<a[i].second;wait+=time;time+=a[i].first;}cout<<"\n"<<fixed<<setprecision(2)<<(long double)wait/n<<"\n";

return 0;
}
