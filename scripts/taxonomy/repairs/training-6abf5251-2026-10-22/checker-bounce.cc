#include "testlib.h"
#include <cmath>
bool close(long double a,long double b){return std::isfinite(a)&&fabsl(a-b)<=5e-6L*fmaxl(1,fabsl(b));}
int main(int argc,char** argv){registerTestlibCmd(argc,argv);long double h=inf.readLong();long double expected[]={h*(3-1.0L/256),h/1024};
    for(auto e:expected){long double stored=ans.readDouble();if(!close(stored,e))quitf(_fail,"Stored answer disagrees with bounce distance");long double got=ouf.readDouble();if(!close(got,e))quitf(_wa,"Incorrect distance or height");}
    ouf.skipBlanks();if(!ouf.eof())quitf(_wa,"Unexpected trailing output");quitf(_ok,"Correct distance and height");}
