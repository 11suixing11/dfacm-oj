#include <bits/stdc++.h>
using namespace std;
bool p(int x){if(x<2)return false;for(int d=2;d*d<=x;d++)if(x%d==0)return false;return true;}int main(){for(int x=10;x<100;x++)if(p(x)&&p(x%10*10+x/10))cout<<x<<"\n";}
