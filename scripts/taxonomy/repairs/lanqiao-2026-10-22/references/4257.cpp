#include <bits/stdc++.h>
using namespace std;
struct Node { char op; int left = -1, right = -1; };
string expression;
int at = 0;
vector<Node> nodes;
int expr();
int make(char c, int l = -1, int r = -1) {
    nodes.push_back({c, l, r});
    return nodes.size() - 1;
}
int atom() {
    char c = expression[at++];
    if (c != '(') return make(c);
    int root = expr(); ++at;
    return root;
}
int term() {
    int root = atom();
    while (at < (int)expression.size() && (expression[at] == '*' || expression[at] == '/')) {
        char op = expression[at++]; root = make(op, root, atom());
    }
    return root;
}
int expr() {
    int root = term();
    while (at < (int)expression.size() && (expression[at] == '+' || expression[at] == '-')) {
        char op = expression[at++]; root = make(op, root, term());
    }
    return root;
}
int precedence(char c) { return c == '+' || c == '-' ? 1 : 2; }
string output(int root, char parent = 0, bool right = false) {
    Node node = nodes[root];
    if (node.left == -1) return string(1, node.op);
    string value = output(node.left, node.op) + node.op + output(node.right, node.op, true);
    bool brackets = parent && (precedence(node.op) < precedence(parent)
        || (right && ((parent == '-' && precedence(node.op) == 1) || (parent == '/' && precedence(node.op) == 2))));
    return brackets ? '(' + value + ')' : value;
}
int main() {
    cin >> expression;
    cout << output(expr()) << '\n';
}
