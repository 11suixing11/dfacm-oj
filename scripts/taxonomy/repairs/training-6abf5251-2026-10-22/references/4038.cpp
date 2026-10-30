#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);
int depth,ball;cin>>depth>>ball;int u=1;for(int i=1;i<depth;i++){if(ball%2){u=u*2;ball=(ball+1)/2;}else{u=u*2+1;ball/=2;}}cout<<u<<"\n";
return 0;
}
