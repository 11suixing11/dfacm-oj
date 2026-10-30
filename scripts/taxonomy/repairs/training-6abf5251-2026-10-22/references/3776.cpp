#include <bits/stdc++.h>
using namespace std;
int main(){int k;cin>>k;long long total=0;for(int pay=1;k>0;pay++){int days=min(k,pay);total+=1LL*days*pay;k-=days;}cout<<total<<"\n";}
