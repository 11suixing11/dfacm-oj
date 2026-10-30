#include <bits/stdc++.h>
using namespace std;
int main(){int n,x,c=0;cin>>n;while(n--){cin>>x;int a=x%10,b=x/10%10,d=x/100%10,e=x/1000;c+=a>b+d+e;}cout<<c<<"\n";}
