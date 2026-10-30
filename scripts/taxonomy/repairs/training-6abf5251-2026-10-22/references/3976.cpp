#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int T;cin>>T;while(T--){int n;cin>>n;long long skip=0,take=LLONG_MIN/4;while(n--){int x;cin>>x;long long nextTake=skip+x;skip=max(skip,take);take=nextTake;}cout<<max(skip,take)<<"\n";}

return 0;
}
