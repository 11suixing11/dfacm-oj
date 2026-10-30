#include <bits/stdc++.h>
using namespace std;
void hanoi(int n,char from,char to,char spare){if(!n)return;hanoi(n-1,from,spare,to);cout<<from<<"->"<<n<<"->"<<to<<"\n";hanoi(n-1,spare,to,from);}int main(){int n;char a,b,c;cin>>n>>a>>b>>c;hanoi(n,a,b,c);}
