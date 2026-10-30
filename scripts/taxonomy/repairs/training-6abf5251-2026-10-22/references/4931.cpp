#include <bits/stdc++.h>
using namespace std;
int main(){int best=8,day=0;for(int i=1;i<=7;i++){int a,b;cin>>a>>b;if(a+b>best){best=a+b;day=i;}}cout<<day<<"\n";}
