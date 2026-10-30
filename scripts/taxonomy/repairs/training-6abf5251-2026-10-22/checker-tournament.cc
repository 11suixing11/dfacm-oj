#include "testlib.h"
#include <bits/stdc++.h>
using namespace std;
int main(int argc,char*argv[]){
    registerTestlibCmd(argc,argv);int n=1<<inf.readInt(1,10);
    auto check=[&](InStream&s,TResult failure){
        vector<vector<int>>schedule(n+1);vector<bool>rows(n+1);
        for(int row=0;row<n;row++){int id=s.readInt(1,n);if(rows[id])quitf(failure,"duplicate player row");rows[id]=true;vector<bool>seen(n+1);seen[id]=true;schedule[id].resize(n-1);for(int day=0;day<n-1;day++){int opponent=s.readInt(1,n);if(seen[opponent])quitf(failure,"duplicate opponent or self-match");seen[opponent]=true;schedule[id][day]=opponent;}}
        for(int id=1;id<=n;id++)for(int day=0;day<n-1;day++)if(schedule[schedule[id][day]][day]!=id)quitf(failure,"daily opponents must agree");
        if(!s.seekEof())quitf(failure,"extra output");
    };check(ans,_fail);check(ouf,_wa);quitf(_ok,"valid complete round-robin schedule");
}
