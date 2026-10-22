#!/usr/bin/env python3
"""样例自测脚本（acm-trainer 技能 P2 能力）。

从五段式输出的 markdown 中提取 C++ 代码块，用 g++ 编译，并依次与
样例（*.in / *.out）比对，输出差异报告。编译失败或比对失败均不中断
后续样例，最后给出汇总。

用法：
  python scripts/sample_test.py <输出markdown> --samples <样例目录>
  python scripts/sample_test.py <输出markdown>            # 仅编译检查

依赖：g++ 在 PATH 中。缺 g++ 时提示"请人工验证"，退出码 2。
"""
import argparse
import glob
import os
import re
import shutil
import subprocess
import sys
import tempfile


def extract_cpp(md_text):
    blocks = re.findall(r"```cpp\r?\n(.*?)```", md_text, re.S)
    return [b for b in blocks if "#include" in b]


def norm(s):
    return s.replace("\r\n", "\n").strip()


def main():
    ap = argparse.ArgumentParser(description="acm-trainer 样例自测")
    ap.add_argument("md", help="五段式输出所在的 markdown 文件")
    ap.add_argument("--samples", help="样例目录（含 *.in 与对应 *.out）")
    ap.add_argument("--gxx", default="g++")
    ap.add_argument("--timeout", type=float, default=30, help="每个样例的运行时限（秒）")
    args = ap.parse_args()
    if args.timeout <= 0:
        ap.error("--timeout 必须大于 0")

    if shutil.which(args.gxx) is None:
        print("未找到 g++，无法自动验证，请人工验证样例与边界。")
        sys.exit(2)

    try:
        text = open(args.md, encoding="utf-8").read()
    except OSError as ex:
        print(f"读取失败：{ex}")
        sys.exit(2)

    blocks = extract_cpp(text)
    if not blocks:
        print("未在输出中找到 C++ 代码块（需包含 #include）。")
        sys.exit(2)
    code = blocks[0]
    print(f"提取代码块：{len(code.splitlines())} 行")

    with tempfile.TemporaryDirectory() as td:
        src = os.path.join(td, "sol.cpp")
        exe = os.path.join(td, "sol.exe")
        with open(src, "w", encoding="utf-8", newline="\n") as f:
            f.write(code)
        try:
            r = subprocess.run(
                [args.gxx, "-O2", "-std=c++17", "-o", exe, src],
                capture_output=True, encoding="utf-8", errors="replace", timeout=60,
            )
        except (OSError, subprocess.TimeoutExpired) as ex:
            print(f"编译未完成：{ex}；请人工验证。")
            sys.exit(2)
        if r.returncode != 0:
            print("编译失败：")
            print(r.stderr[:2000])
            sys.exit(1)
        print("编译通过")

        if not args.samples:
            print("（未指定 --samples，仅做编译检查）")
            sys.exit(0)

        ins = sorted(glob.glob(os.path.join(args.samples, "*.in")))
        if not ins:
            print(f"样例目录无 .in 文件：{args.samples}")
            sys.exit(2)

        passed = 0
        for f in ins:
            exp_path = f[:-3] + ".out"
            if not os.path.exists(exp_path):
                print(f"[SKIP] {os.path.basename(f)}：无期望输出")
                continue
            with open(f, "rb") as fi:
                try:
                    res = subprocess.run([exe], stdin=fi, capture_output=True, timeout=args.timeout)
                except subprocess.TimeoutExpired:
                    print(f"[TLE ] {os.path.basename(f)}：运行超时（>{args.timeout:g}s）")
                    continue
            if res.returncode != 0:
                print(f"[RE  ] {os.path.basename(f)}：退出码 {res.returncode}")
                if res.stderr:
                    print(res.stderr.decode("utf-8", "replace")[:500])
                continue
            got = norm(res.stdout.decode("utf-8", "replace"))
            exp = norm(open(exp_path, encoding="utf-8").read())
            if got == exp:
                print(f"[PASS] {os.path.basename(f)}")
                passed += 1
            else:
                print(f"[FAIL] {os.path.basename(f)}")
                print(f"  期望：{exp[:200]!r}")
                print(f"  实际：{got[:200]!r}")

        total = len(ins)
        print(f"\n== 样例 {passed}/{total} 通过 ==")
        sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
