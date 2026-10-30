#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int T;cin>>T;while(T--){int n;cin>>n;vector<long long>a(n),left(n),right(n);for(auto&x:a)cin>>x;long long ending=a[0];left[0]=ending;for(int i=1;i<n;i++){ending=max(a[i],ending+a[i]);left[i]=max(left[i-1],ending);}ending=a.back();right.back()=ending;for(int i=n-2;i>=0;i--){ending=max(a[i],ending+a[i]);right[i]=max(right[i+1],ending);}long long answer=LLONG_MIN;for(int i=0;i+1<n;i++)answer=max(answer,left[i]+right[i+1]);cout<<answer<<"\n";}

return 0;
}
