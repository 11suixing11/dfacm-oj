#include <bits/stdc++.h>
using namespace std;

vector<string> solutions;string board;
void queens(int row,int cols,int d1,int d2){if(row==8){solutions.push_back(board);return;}for(int c=0;c<8;c++)if(!(cols&(1<<c))&&!(d1&(1<<(row+c)))&&!(d2&(1<<(row-c+7)))){board+=char('1'+c);queens(row+1,cols|(1<<c),d1|(1<<(row+c)),d2|(1<<(row-c+7)));board.pop_back();}}
int main(){queens(0,0,0,0);int n,b;cin>>n;while(n--){cin>>b;cout<<solutions[b-1]<<"\n";}}
