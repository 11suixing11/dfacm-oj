#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int T;cin>>T;while(T--){int n;cin>>n;vector<int>a(n);for(int&x:a)cin>>x;vector<long long>left(n);long long minimum=a[0],best=0;for(int i=0;i<n;i++){minimum=min(minimum,(long long)a[i]);best=max(best,a[i]-minimum);left[i]=best;}long long maximum=a.back(),right=0,answer=0;for(int i=n-1;i>=0;i--){maximum=max(maximum,(long long)a[i]);right=max(right,maximum-a[i]);answer=max(answer,right+left[i]);}cout<<answer<<"\n";}

return 0;
}
