#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n;cin>>n;int even=8,odd=1;for(int i=1;i<n;i++){int a=(even*9+odd)%12345,b=(odd*9+even)%12345;even=a;odd=b;}cout<<even<<"\n";

return 0;
}
