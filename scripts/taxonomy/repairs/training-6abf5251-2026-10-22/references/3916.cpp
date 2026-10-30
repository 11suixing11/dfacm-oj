#include <bits/stdc++.h>
using namespace std;
int main(){auto f=[](long double x){return ((((x-15)*x+85)*x-225)*x+274)*x-121;};long double l=1.5L,r=2.4L;for(int i=0;i<100;i++){long double m=(l+r)/2;if(f(m)>0)l=m;else r=m;}cout<<fixed<<setprecision(6)<<(l+r)/2<<"\n";}
