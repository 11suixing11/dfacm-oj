#include <bits/stdc++.h>
using namespace std;
int main(){int n,c=0;cin>>n;for(int x=1;x<=n;x++)for(char d:to_string(x))c+=d=='1';cout<<c<<"\n";}
