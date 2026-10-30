#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;while(n--){string a,b;cin>>a>>b;bool win=(a=="Rock"&&b=="Scissors")||(a=="Scissors"&&b=="Paper")||(a=="Paper"&&b=="Rock");cout<<(a==b?"Tie":win?"Player1":"Player2")<<"\n";}}
