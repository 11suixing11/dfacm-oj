#include <bits/stdc++.h>
using namespace std;
int main(){vector<int>a(10);for(auto&x:a)cin>>x;sort(a.begin(),a.end(),[](int x,int y){if(x%2!=y%2)return x%2>y%2;return x%2?x>y:x<y;});for(int i=0;i<10;i++)cout<<(i?" ":"")<<a[i];cout<<"\n";}
