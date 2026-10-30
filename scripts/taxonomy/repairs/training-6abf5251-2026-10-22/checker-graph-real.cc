// Compile with PROBLEM=4017, 4018, or 4019. Each optimum is recomputed.
#include "testlib.h"
#include <bits/stdc++.h>
using namespace std;
#ifndef PROBLEM
#define PROBLEM 4017
#endif
int main(int argc,char*argv[]){
    registerTestlibCmd(argc,argv);const long double INF=numeric_limits<long double>::infinity();long double optimal=0,absolute=0,relative=0;
#if PROBLEM == 4019
    int n=inf.readInt(1,2000),m=inf.readInt(1,100000);vector<vector<pair<int,int>>>graph(n+1);
    for(int i=0;i<m;i++){int a=inf.readInt(1,n),b=inf.readInt(1,n),z=inf.readInt(1,99);graph[a].push_back({b,z});graph[b].push_back({a,z});}
    int start=inf.readInt(1,n),target=inf.readInt(1,n);vector<long double>d(n+1);d[start]=1;priority_queue<pair<long double,int>>q;q.push({1,start});
    while(!q.empty()){auto[p,u]=q.top();q.pop();if(p<d[u])continue;if(u==target)break;for(auto[v,z]:graph[u]){long double next=p*(100-z)/100;if(next>d[v]){d[v]=next;q.push({next,v});}}}
    optimal=100/d[target];absolute=1e-7L;relative=1e-9L;
#else
    int n=inf.readInt(1,PROBLEM==4017?100:150);vector<pair<int,int>>a(n);for(auto&[x,y]:a){x=inf.readInt();y=inf.readInt();}
    auto distance=[&](int i,int j){return hypotl((long double)a[i].first-a[j].first,(long double)a[i].second-a[j].second);};
    vector<vector<long double>>d(n,vector<long double>(n,INF));for(int i=0;i<n;i++)d[i][i]=0;
#if PROBLEM == 4017
    int m=inf.readInt(0,10000);for(int i=0;i<m;i++){int x=inf.readInt(1,n)-1,y=inf.readInt(1,n)-1;d[x][y]=d[y][x]=distance(x,y);}
    int start=inf.readInt(1,n)-1,target=inf.readInt(1,n)-1;
#else
    for(int i=0;i<n;i++){string row=inf.readToken();for(int j=0;j<n;j++)if(i!=j&&row[j]=='1')d[i][j]=distance(i,j);}
#endif
    for(int k=0;k<n;k++)for(int i=0;i<n;i++)for(int j=0;j<n;j++)d[i][j]=min(d[i][j],d[i][k]+d[k][j]);
#if PROBLEM == 4017
    optimal=d[start][target];absolute=.0050001L;
#else
    vector<long double>ecc(n);long double diameter=0;for(int i=0;i<n;i++){for(int j=0;j<n;j++)if(isfinite(d[i][j]))ecc[i]=max(ecc[i],d[i][j]);diameter=max(diameter,ecc[i]);}
    optimal=INF;for(int i=0;i<n;i++)for(int j=0;j<i;j++)if(!isfinite(d[i][j]))optimal=min(optimal,max(diameter,ecc[i]+distance(i,j)+ecc[j]));absolute=1e-6L;relative=1e-9L;
#endif
#endif
    if(!isfinite(optimal))quitf(_fail,"nonfinite independently computed optimum");
    auto check=[&](InStream&s,TResult failure){
        string token=s.readToken();size_t at=0,digits=0;
        if(at<token.size()&&(token[at]=='+'||token[at]=='-'))at++;
        while(at<token.size()&&token[at]>='0'&&token[at]<='9'){at++;digits++;}
        if(at<token.size()&&token[at]=='.'){
            at++;while(at<token.size()&&token[at]>='0'&&token[at]<='9'){at++;digits++;}
        }
        bool valid=digits>0;
        if(at<token.size()&&(token[at]=='e'||token[at]=='E')){
            at++;if(at<token.size()&&(token[at]=='+'||token[at]=='-'))at++;
            size_t first=at;while(at<token.size()&&token[at]>='0'&&token[at]<='9')at++;
            valid=valid&&at>first;
        }
        if(token.size()>10000||!valid||at!=token.size())quitf(failure,"finite real number required");
        char*end=nullptr;long double value=strtold(token.c_str(),&end);if(*end||!isfinite(value)||fabsl(value-optimal)>max(absolute,relative*fabsl(optimal)))quitf(failure,"real value outside tolerance");
        if(!s.seekEof())quitf(failure,"extra output");
    };check(ans,_fail);check(ouf,_wa);quitf(_ok,"independently verified graph optimum");
}
