#include <bits/stdc++.h>
using namespace std;
int main(){int n,s=0;cin>>n;for(int x=1;x<=n;x++)if(x%7&&to_string(x).find('7')==string::npos)s+=x*x;cout<<s<<"\n";}
