#include <bits/stdc++.h>
using namespace std;
int main(){string s;cin>>s;bool first=true;for(int d=2;d<=9;d++){int r=0;for(char c:s)r=(r*10+c-'0')%d;if(!r){if(!first)cout<<" ";cout<<d;first=false;}}if(first)cout<<"none";cout<<"\n";}
