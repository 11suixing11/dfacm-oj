#include <bits/stdc++.h>
using namespace std;
int main() {
    double x;
    while(cin>>x && x!=0) {
        int n=0; double sum=0;
        while(sum<x) { ++n; sum+=1.0/(n+1); }
        cout<<n<<" card(s)\n";
    }
}
