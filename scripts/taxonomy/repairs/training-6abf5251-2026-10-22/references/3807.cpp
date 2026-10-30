#include <bits/stdc++.h>
using namespace std;
int main(){long double p;string a,b;cin>>p>>a>>b;int same=0;for(size_t i=0;i<a.size();i++)same+=a[i]==b[i];cout<<(same>=p*a.size()?"yes":"no")<<"\n";}
