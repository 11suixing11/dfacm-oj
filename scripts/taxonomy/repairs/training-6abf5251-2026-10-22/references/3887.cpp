#include <bits/stdc++.h>
using namespace std;
unsigned long long k;map<unsigned long long,bool>memo;bool member(unsigned long long x){if(x==k)return true;if(x<k||x==0)return false;if(memo.count(x))return memo[x];return memo[x]=((x-1)%2==0&&member((x-1)/2))||((x-1)%3==0&&member((x-1)/3));}int main(){unsigned long long x;char comma;cin>>k>>comma>>x;cout<<(member(x)?"YES":"NO")<<"\n";}
