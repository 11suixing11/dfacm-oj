#include <bits/stdc++.h>
using namespace std;
int main(){long double l,n,c;cin>>l>>n>>c;long double delta=n*c;if(l==0||delta==0){cout<<"0.000\n";return 0;}long double lo=0,hi=acosl(-1.L)/2;for(int i=0;i<120;i++){long double x=(lo+hi)/2,x2=x*x;long double excess=x<.001L?x2/6+7*x2*x2/360+31*x2*x2*x2/15120:x/sinl(x)-1;if(excess<delta)lo=x;else hi=x;}cout<<fixed<<setprecision(3)<<l*tanl((lo+hi)/4)/2<<"\n";}
