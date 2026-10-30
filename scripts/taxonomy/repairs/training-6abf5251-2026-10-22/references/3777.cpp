#include <bits/stdc++.h>
using namespace std;
int main(){int a,b,c,ans=0;cin>>a>>b>>c;for(int x=0;x*a<=c;x++)ans+=(c-a*x)%b==0;cout<<ans<<"\n";}
