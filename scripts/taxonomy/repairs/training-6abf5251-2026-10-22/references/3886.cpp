#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;bool first=true;for(int d=2;d<=n;d++){int e=0;while(n%d==0){n/=d;e++;}if(e){if(!first)cout<<'*';first=false;cout<<d;if(e>1)cout<<'^'<<e;}}cout<<"\n";}
