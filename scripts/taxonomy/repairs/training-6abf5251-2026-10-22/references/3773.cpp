#include <bits/stdc++.h>
using namespace std;
int main(){int h,w,t;char c;cin>>h>>w>>c>>t;for(int i=0;i<h;i++){for(int j=0;j<w;j++)cout<<(t||i==0||i==h-1||j==0||j==w-1?c:' ');cout<<"\n";}}
