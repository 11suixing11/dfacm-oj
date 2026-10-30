#include <bits/stdc++.h>
using namespace std;
int main(){long long a,b,c,d,e,f;while(cin>>a>>b>>c>>d>>e>>f&&(a||b||c||d||e||f)){long long answer=f+e+d+(c+3)/4;int slots[]={0,5,3,1};long long free2=5*d+slots[c%4];if(b>free2)answer+=(b-free2+8)/9;long long free1=36*answer-36*f-25*e-16*d-9*c-4*b;if(a>free1)answer+=(a-free1+35)/36;cout<<answer<<"\n";}}
