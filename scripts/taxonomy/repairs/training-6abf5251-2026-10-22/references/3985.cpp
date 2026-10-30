#include <bits/stdc++.h>
using namespace std;

long long sortCount(vector<int>&a,int l,int r){if(r-l<=1)return 0;int m=(l+r)/2;long long z=sortCount(a,l,m)+sortCount(a,m,r);vector<int>b;int i=l,j=m;while(i<m||j<r){if(j==r||(i<m&&a[i]<=a[j]))b.push_back(a[i++]);else{z+=m-i;b.push_back(a[j++]);}}copy(b.begin(),b.end(),a.begin()+l);return z;}

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);
int n;cin>>n;vector<int>a(n);for(int&x:a)cin>>x;cout<<sortCount(a,0,n)<<"\n";
return 0;
}
