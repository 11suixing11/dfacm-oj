#include <bits/stdc++.h>
using namespace std;
int ack(int m,int n){if(m==0)return n+1;if(m==1)return n+2;if(m==2)return 2*n+3;return n==0?ack(m-1,1):ack(m-1,ack(m,n-1));}int main(){int m,n;cin>>m>>n;cout<<ack(m,n)<<"\n";}
