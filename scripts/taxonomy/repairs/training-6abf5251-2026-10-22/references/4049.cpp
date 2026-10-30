#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

long long startx,starty;cin>>startx>>starty;long long a,b,c,d;long double distance=0;while(cin>>a>>b>>c>>d)distance+=hypotl((long double)a-c,(long double)b-d);long long minutes=llroundl(distance*2*60/20000);cout<<minutes/60<<":"<<setw(2)<<setfill('0')<<minutes%60<<"\n";

return 0;
}
