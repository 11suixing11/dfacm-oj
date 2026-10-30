#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n;cin>>n;string a=string(n,'o')+string(n,'*')+"--";int gap=2*n,step=0;auto print=[&](){cout<<"step"<<setw(2)<<step++<<":"<<a<<"\n";};auto move=[&](int source){source--;a[gap]=a[source];a[gap+1]=a[source+1];a[source]=a[source+1]='-';gap=source;print();};function<void(int)>solve=[&](int m){if(m==4){for(int x:{4,8,2,7,1})move(x);}else{move(m);move(2*m-1);solve(m-1);}};print();solve(n);

return 0;
}
