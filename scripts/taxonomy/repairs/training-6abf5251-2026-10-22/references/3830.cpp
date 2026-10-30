#include <bits/stdc++.h>
using namespace std;
int sum(int x){int s=0;for(int d=1;d<x;d++)if(x%d==0)s+=d;return s;}int main(){for(int a=2;;a++){int b=sum(a);if(b>a&&sum(b)==a){cout<<a<<" "<<b<<"\n";break;}}}
