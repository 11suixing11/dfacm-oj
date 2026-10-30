#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n;long long m;cin>>n>>m;vector<int>a(n);iota(a.begin(),a.end(),1);size_t index=0;bool first=true;while(!a.empty()){index=(index+(m-1)%a.size())%a.size();cout<<(first?"":" ")<<a[index];first=false;a.erase(a.begin()+index);}cout<<"\n";

return 0;
}
