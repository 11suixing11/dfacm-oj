#include <bits/stdc++.h>
using namespace std;
int main(){long double x=1/sqrtl(3),power=x,s=0;for(int d=1;abs(power/d)>=1e-6L;d+=2){s+=power/d;power*=-x*x;}cout<<fixed<<setprecision(10)<<6*s<<"\n";}
