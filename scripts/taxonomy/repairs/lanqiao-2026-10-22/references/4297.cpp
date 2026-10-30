#include <bits/stdc++.h>
using namespace std;
string inorder, postorder;
void build(int inLeft, int inRight, int postLeft, int postRight) {
    if (inLeft > inRight) return;
    char root = postorder[postRight];
    cout << root;
    int middle = inorder.find(root, inLeft);
    int span = middle - inLeft;
    build(inLeft, middle - 1, postLeft, postLeft + span - 1);
    build(middle + 1, inRight, postLeft + span, postRight - 1);
}
int main() {
    cin >> inorder >> postorder;
    build(0, inorder.size() - 1, 0, postorder.size() - 1);
    cout << '\n';
    return 0;
}
