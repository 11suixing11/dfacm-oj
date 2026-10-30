#include "testlib.h"
#include <string>
using namespace std;
string oneLine(InStream &input, TResult verdict) {
    string line;
    while (!input.eof()) {
        char c = input.readChar();
        if (c == '\n') break;
        if (c == '\r') {
            if (input.eof() || input.readChar() != '\n') quitf(verdict, "invalid line ending");
            break;
        }
        if (line.size() == 128) quitf(verdict, "output line too long");
        line += c;
    }
    while (!input.eof()) {
        char c = input.readChar();
        if (c == '\r') {
            if (input.eof() || input.readChar() != '\n') quitf(verdict, "invalid line ending");
        } else if (c != '\n') quitf(verdict, "extra output");
    }
    return line;
}
int main(int argc, char *argv[]) {
    registerTestlibCmd(argc, argv);
    string text = inf.readLine(), operation = inf.readToken(), targetToken = inf.readToken();
    char command = operation[0], target = targetToken[0], replacement = 0;
    string replacementToken;
    if (command != 'D') { replacementToken = inf.readToken(); replacement = replacementToken[0]; }
    if (text.empty() || text.size() > 40 || text.back() != '.' || operation.size() != 1
        || targetToken.size() != 1 || (command != 'D' && replacementToken.size() != 1)
        || string("DIR").find(command) == string::npos || !inf.seekEof()) quitf(_fail, "invalid input");
    // Independently reconstruct a new string, preserving every space.
    size_t at = string::npos;
    for (size_t i = 0; i < text.size(); ++i) if (text[i] == target) {
        at = i;
        if (command != 'I') break;
    }
    string expected;
    if (at == string::npos) expected = "IS NOT FOUND";
    else for (size_t i = 0; i < text.size(); ++i) {
        if (command == 'D' && i == at) continue;
        if (command == 'I' && i == at) expected += replacement;
        expected += command == 'R' && text[i] == target ? replacement : text[i];
    }
    if (oneLine(ans, _fail) != expected) quitf(_fail, "jury string is incorrect");
    if (oneLine(ouf, _wa) != expected) quitf(_wa, "edited string differs, including spaces");
    quitf(_ok, "edited string matches exactly");
}
