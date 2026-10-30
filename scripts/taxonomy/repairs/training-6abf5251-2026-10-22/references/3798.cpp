#include <bits/stdc++.h>
using namespace std;
int main(){int a[5][5];for(auto&r:a)for(auto&x:r)cin>>x;for(int i=0;i<5;i++)for(int j=0;j<5;j++){bool ok=true;for(int k=0;k<5;k++)if(a[i][j]<a[i][k]||a[i][j]>a[k][j])ok=false;if(ok){cout<<i+1<<" "<<j+1<<" "<<a[i][j]<<"\n";return 0;}}cout<<"not found\n";}
