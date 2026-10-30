#include "testlib.h"
#include <bits/stdc++.h>
using namespace std;
#ifndef PROBLEM_ID
#define PROBLEM_ID 3418
#endif
int main(int argc,char*argv[]) {
    registerTestlibCmd(argc,argv);
    int count=PROBLEM_ID==3418?inf.readInt(1,18):1;
    const double tolerance=PROBLEM_ID==3501?1e-9:1e-6;
    for(int i=0;i<count;i++){
        double expected=ans.readDouble(),got=ouf.readDouble();
        if(!isfinite(expected)||expected<-1e-10||expected>1+1e-10)quitf(_fail,"invalid reference probability");
        if(!isfinite(got))quitf(_wa,"non-finite probability");
        if(abs(got-expected)>tolerance*max(1.0,abs(expected)))quitf(_wa,"probability %d differs beyond tolerance",i+1);
    }
    if(!ans.seekEof())quitf(_fail,"unexpected reference output");
    if(!ouf.seekEof())quitf(_wa,"extra output");
    quitf(_ok,"probabilities are within tolerance");
}
