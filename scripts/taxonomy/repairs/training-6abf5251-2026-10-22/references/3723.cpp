#include <bits/stdc++.h>
using namespace std;
int main(){long long x;cin>>x;bool found=false;for(int d:{3,5,7})if(x%d==0){if(found)cout<<" ";cout<<d;found=true;}if(!found)cout<<"n";cout<<"\n";}
