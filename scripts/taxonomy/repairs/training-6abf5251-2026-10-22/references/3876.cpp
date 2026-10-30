#include <bits/stdc++.h>
using namespace std;
int countf(int n,int lower){int answer=1;for(int d=lower;d*d<=n;d++)if(n%d==0)answer+=countf(n/d,d);return answer;}int main(){int n,x;cin>>n;while(n--){cin>>x;cout<<countf(x,2)<<"\n";}}
