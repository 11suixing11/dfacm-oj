#include <bits/stdc++.h>
using namespace std;
bool p(int x){for(int d=2;d*d<=x;d++)if(x%d==0)return false;return true;}int main(){for(int x=100;x<1000;x++)if(x/100==x%10&&p(x))cout<<x<<"\n";}
