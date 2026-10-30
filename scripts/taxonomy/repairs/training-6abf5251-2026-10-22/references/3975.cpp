#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n,k;while(cin>>n>>k){vector<int>d(k+1);int moves=0;while(d[k]<n){moves++;for(int j=k;j;j--)d[j]=min(n,d[j]+d[j-1]+1);}cout<<moves<<"\n";}

return 0;
}
