#include <bits/stdc++.h>
using namespace std;
bool p(int x){if(x<2)return false;for(int d=2;d*d<=x;d++)if(x%d==0)return false;return true;}int main(){for(int n=6;n<=100;n+=2)for(int a=2;a<=n/2;a++)if(p(a)&&p(n-a)){cout<<n<<"="<<a<<"+"<<n-a<<"\n";break;}}
