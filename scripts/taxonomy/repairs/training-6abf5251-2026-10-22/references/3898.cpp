#include <bits/stdc++.h>
using namespace std;
int main(){unsigned n;while(cin>>n&&n){unsigned bit=n&-n,r=n+bit;cout<<(r|(((n^r)>>2)/bit))<<"\n";}}
