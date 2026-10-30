#include "testlib.h"
#include <bits/stdc++.h>
using namespace std;
int main(int argc,char*argv[]){
    registerTestlibCmd(argc,argv);int n=inf.readInt(4,1000);
    auto check=[&](InStream&s,TResult failure){
        string previous;int step=0;
        while(!s.seekEof()){
            string marker=s.readToken();string state;int number=-1;
            string token;
            if(marker=="step")token=s.readToken();
            else{if(marker.substr(0,4)!="step")quitf(failure,"invalid step label");token=marker.substr(4);}
            size_t colon=token.find(':');
            if(colon==string::npos||colon==0||colon>9)quitf(failure,"invalid step label");
            number=0;for(size_t i=0;i<colon;i++){if(token[i]<'0'||token[i]>'9')quitf(failure,"invalid step label");number=number*10+token[i]-'0';}
            state=token.substr(colon+1);
            if(state.find_first_not_of("o*-")!=string::npos)quitf(failure,"invalid board character");
            if(number!=step++||state.size()!=size_t(2*n+2)||count(state.begin(),state.end(),'o')!=n||count(state.begin(),state.end(),'*')!=n||count(state.begin(),state.end(),'-')!=2||state.find("--")==string::npos)quitf(failure,"invalid board or step number");
            if(previous.empty()){if(state!=string(n,'o')+string(n,'*')+"--")quitf(failure,"wrong initial board");}
            else{int destination=previous.find("--"),source=state.find("--");if(abs(destination-source)<3||previous[source]=='-'||previous[source+1]=='-')quitf(failure,"must jump a neighboring pair over at least one piece");string expected=previous;expected[destination]=previous[source];expected[destination+1]=previous[source+1];expected[source]=expected[source+1]='-';if(expected!=state)quitf(failure,"illegal move");}
            previous=state;
        }
        if(previous.empty())quitf(failure,"empty movement sequence");
        if(previous.substr(0,2)!="--"&&previous.substr(previous.size()-2)!="--")quitf(failure,"pieces must finish in a continuous row");
        previous.erase(previous.find("--"),2);for(size_t i=1;i<previous.size();i++)if(previous[i]==previous[i-1])quitf(failure,"final colors must alternate");
    };check(ans,_fail);check(ouf,_wa);quitf(_ok,"valid movement sequence to alternating pieces");
}
