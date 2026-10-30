#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

vector<int>tops;int x;while(cin>>x){auto it=lower_bound(tops.begin(),tops.end(),x);if(it==tops.end())tops.push_back(x);else *it=x;}cout<<tops.size()<<"\n";

return 0;
}
