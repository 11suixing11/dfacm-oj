#include <bits/stdc++.h>
using namespace std;
int main(){int n,x,prev=0,run=0,best=0;cin>>n;for(int i=0;i<n;i++){cin>>x;run=i&&x==prev?run+1:1;prev=x;best=max(best,run);}cout<<best<<"\n";}
