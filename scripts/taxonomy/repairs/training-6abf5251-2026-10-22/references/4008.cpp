#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int a,n;while(cin>>a>>n){vector<long long>d(n);d[0]=a;int i=0,j=0;for(int k=1;k<n;k++){long long x=2*d[i]+1,y=3*d[j]+1;d[k]=min(x,y);if(d[k]==x)i++;if(d[k]==y)j++;}cout<<d[n-1]<<"\n";}

return 0;
}
