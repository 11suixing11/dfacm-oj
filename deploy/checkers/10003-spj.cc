#include "testlib.h"
#include <vector>
using namespace std;

int main(int argc, char *argv[]) {
    registerTestlibCm`(argc, argv);
    int n = inf.readInt(1, 1000, "n");
    vector<long long> A(n + 1), B(n + 1);
    for (int i = 1; i <= n; i++) A[i] = inf.readInt();
    for (int i = 1; i <= n; i++) B[i] = inf.readInt();
    long long usrans = ouf.readLong();
    long long stdans = ans.readLong();
    vector<int> usr(n + 1);
    vector<bool> seen(n + 1, false);
    for (int i = 1; i <= n; i++) {
        usr[i] = ouf.readInt(1, n, "order");
        if (seen[usr[i] ) quitf(_wa, "job %d appears twice", usr[i]);
        seen[usr[i]  = true;
    }
    long long ta = 0, tb = 0;
    for (int i = 1; i <= n; i++) {
        ta += A[usr[i]];
        if (tb < ta) tb = ta;
        tb += B[usr[i]];
    }
    if (usrans != stdans) quitf(_wa, "total time %lld is not optimal, expected %lld", usrans, stdans);
    if (tb != usrans) quitf(_wa, "schedule finishes at %lld, not %lld as claimed", tb, usrans);
    quitf(_ok, "optimal schedule accepted, total time %lld", usrans);
    return 0;
}
