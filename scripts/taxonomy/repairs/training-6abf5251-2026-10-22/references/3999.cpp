#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);
int n;cin>>n;vector<pair<int,int>>a(n);for(auto&[end,start]:a)cin>>start>>end;sort(a.begin(),a.end());int last=-1,answer=0;for(auto[end,start]:a)if(start>last){last=end;answer++;}cout<<answer<<"\n";
return 0;
}
