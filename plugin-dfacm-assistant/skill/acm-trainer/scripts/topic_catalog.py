#!/usr/bin/env python3
"""题单辅助工具：审计、人工核验清单和已核验检索，仅使用 Python 标准库。

用法（--map / --as-of 也可放在子命令后）：
  python scripts/topic_catalog.py audit
  python scripts/topic_catalog.py checklist --output topic-checklist.md
  python scripts/topic_catalog.py recommend --topics 二分 背包 --exclude 洛谷/P2440

默认读取同一技能的 references/topic-map.json；不修改题单、不访问 OJ、
不提供自动核实接口。--as-of 是日期校验基准（默认本机今天），不是核验日期。
完整 developer-manual 记录只能证明声明格式有效，不能证明真实人工审阅发生。
退出码：0 完成（空推荐也为 0）；1 audit 发现错误；2 参数 / 文件读取或写入失败。
"""
import argparse
from collections import Counter
from datetime import date
import json
from pathlib import Path
import re
import sys


DEFAULT_MAP = Path(__file__).resolve().parent.parent / "references" / "topic-map.json"
MIN_ENTRIES_PER_TOPIC = 3
NOTICE = "工具只校验人工核验声明的格式与匹配关系，不能证明真实人工审阅；自动来源审计不启用推荐。"
ENTRY_TEXT_FIELDS = ("source", "id", "title", "url", "难度", "推荐理由")
RECORD_FIELDS = {
    "method", "reviewer", "checked_at", "url", "id", "official_title",
    "topic", "topic_match", "notes", "evidence",
}


def nonempty(value):
    return isinstance(value, str) and bool(value.strip())


def parse_date(value):
    if not isinstance(value, str) or not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value):
        raise ValueError("日期必须为 YYYY-MM-DD")
    return date.fromisoformat(value)


def official_url(source, problem_id):
    """只识别当前题单支持的洛谷 P 题；未知来源不猜测链接。"""
    if source == "洛谷" and isinstance(problem_id, str) and re.fullmatch(r"P[1-9][0-9]*", problem_id):
        return f"https://www.luogu.com.cn/problem/{problem_id}"
    return None


def validate_entry(topic, entry, as_of):
    """返回字段错误列表；绝不修改 entry 或签署人工核验。"""
    if not isinstance(entry, dict):
        return ["entry: 条目必须为 JSON 对象"]
    errors = []
    for field in ENTRY_TEXT_FIELDS:
        if not nonempty(entry.get(field)):
            errors.append(f"{field}: 必须为非空字符串")
    expected_url = official_url(entry.get("source"), entry.get("id"))
    if expected_url is None:
        errors.append("source/id: 不支持的来源或无效洛谷 P 题号")
    elif entry.get("url") != expected_url:
        errors.append("url: 必须精确对应来源与题号的官方 HTTPS 页面")
    flag = entry.get("verified")
    if type(flag) is not bool:
        errors.append("verified: 必须为 JSON 布尔值")
    record = entry.get("verification")
    if record is None and flag is not True:
        return errors
    if not isinstance(record, dict) or not record:
        errors.append("verification: 已核验声明必须附完整 developer-manual 记录")
        return errors
    if set(record) - RECORD_FIELDS:
        errors.append("verification: 含未定义字段")
    if record.get("method") != "developer-manual":
        errors.append("verification.method: 必须为 developer-manual")
    for field in ("reviewer", "checked_at", "url", "id", "official_title", "topic", "notes"):
        if not nonempty(record.get(field)):
            errors.append(f"verification.{field}: 必须为非空字符串")
    if "evidence" in record and not nonempty(record["evidence"]):
        errors.append("verification.evidence: 若提供则必须为非空字符串")
    for field, expected in (("id", entry.get("id")), ("url", expected_url),
                            ("official_title", entry.get("title")), ("topic", topic)):
        if record.get(field) != expected or not nonempty(expected):
            errors.append(f"verification.{field}: 必须与当前条目及考点精确匹配")
    if record.get("url") != entry.get("url"):
        errors.append("verification.url: 必须与条目的 url 一致")
    if record.get("topic_match") is not True:
        errors.append("verification.topic_match: 必须为 JSON true")
    try:
        checked_at = parse_date(record.get("checked_at"))
        if checked_at > as_of:
            errors.append("verification.checked_at: 不得晚于校验基准日期")
    except (ValueError, TypeError):
        errors.append("verification.checked_at: 必须为真实 YYYY-MM-DD 日期")
    return errors


def scan_catalog(data, as_of):
    """生成所有条目的独立检查结果，跨考点同题保留各自核验关系。"""
    if not isinstance(data, dict):
        raise ValueError("题单根节点必须为 JSON 对象")
    rows, errors, topics = [], [], []
    for topic, entries in data.items():
        if topic == "_meta":
            continue
        topics.append(topic)
        if not nonempty(topic) or not isinstance(entries, list):
            errors.append({"topic": topic, "index": None, "errors": ["考点必须为非空字符串且值为条目数组"]})
            continue
        seen = set()
        for index, entry in enumerate(entries):
            issues = validate_entry(topic, entry, as_of)
            identity = None
            if isinstance(entry, dict) and nonempty(entry.get("source")) and nonempty(entry.get("id")):
                identity = (entry["source"], entry["id"])
                if identity in seen:
                    issues.append("source/id: 同一考点内重复条目")
                seen.add(identity)
            row = {"topic": topic, "index": index, "entry": entry,
                   "identity": identity, "errors": issues,
                   "eligible": isinstance(entry, dict) and entry.get("verified") is True and not issues}
            rows.append(row)
            if issues:
                errors.append({"topic": topic, "index": index,
                               "source": entry.get("source") if isinstance(entry, dict) else None,
                               "id": entry.get("id") if isinstance(entry, dict) else None,
                               "errors": issues})
    return {"topics": topics, "rows": rows, "errors": errors}


def audit_catalog(data, as_of):
    scan = scan_catalog(data, as_of)
    rows = scan["rows"]
    coverage = []
    for topic in scan["topics"]:
        topic_rows = [row for row in rows if row["topic"] == topic]
        eligible = sum(row["eligible"] for row in topic_rows)
        coverage.append({"topic": topic, "entries": len(topic_rows), "recommendable": eligible,
                         "entry_shortage": max(0, MIN_ENTRIES_PER_TOPIC - len(topic_rows)),
                         "verified_shortage": max(0, MIN_ENTRIES_PER_TOPIC - eligible)})
    identities = Counter(row["identity"] for row in rows if row["identity"] is not None)
    declared = sum(isinstance(row["entry"], dict) and row["entry"].get("verified") is True for row in rows)
    eligible_count = sum(row["eligible"] for row in rows)
    return {
        "as_of": as_of.isoformat(), "topic_count": len(scan["topics"]), "entry_count": len(rows),
        "unique_problem_count": len(identities), "verified_true_count": declared,
        "recommendable_count": eligible_count, "invalid_verified_count": declared - eligible_count,
        "pending_count": sum(isinstance(row["entry"], dict) and row["entry"].get("verified") is False for row in rows),
        "error_count": len(scan["errors"]), "errors": scan["errors"],
        "minimum_per_topic": MIN_ENTRIES_PER_TOPIC, "coverage": coverage,
        "shortages": [item for item in coverage if item["entry_shortage"] or item["verified_shortage"]],
        "duplicate_source_ids": [{"source": key[0], "id": key[1], "occurrences": count}
                                 for key, count in identities.items() if count > 1],
        "notice": NOTICE,
    }


def recommend(data, topics, limit, exclusions, as_of):
    scan = scan_catalog(data, as_of)
    requested = list(dict.fromkeys(topics))
    matches = {}
    for topic in requested:
        for row in scan["rows"]:
            if row["topic"] != topic or not row["eligible"] or row["identity"] in exclusions:
                continue
            identity, entry = row["identity"], row["entry"]
            if identity not in matches:
                matches[identity] = {field: entry[field] for field in ENTRY_TEXT_FIELDS}
                matches[identity]["topics"] = []
            if topic not in matches[identity]["topics"]:
                matches[identity]["topics"].append(topic)
    items = list(matches.values())
    return {"as_of": as_of.isoformat(), "requested_topics": requested,
            "unknown_topics": [topic for topic in requested if topic not in scan["topics"]],
            "limit": limit, "available_count": len(items), "recommendations": items[:limit],
            "catalog_error_count": len(scan["errors"]),
            "fallback": "暂无已核实的内置推荐；请按所选考点安排练习方向。" if not items else None,
            "notice": NOTICE}


def md_inline(value):
    text = str(value).replace("\r", " ").replace("\n", " ")
    return re.sub(r"([\\`*_{}\[\]<>|])", r"\\\1", text)


def make_checklist(data, as_of):
    scan = scan_catalog(data, as_of)
    lines = ["# 开发者人工题单核验清单", "", f"校验基准日期：{as_of.isoformat()}（仅用于检查核验日期，不代表已核实日期）。", "",
             NOTICE, "", "请逐题打开官方链接，人工确认题号、完整题名与当前考点。抓取成功和代理审阅均不能代替人工核实。", "",
             "确认后由开发者在题单填写 verification：method=developer-manual、reviewer、checked_at（YYYY-MM-DD）、url、id、official_title、topic、topic_match=true、notes，可附 evidence；最后才设置 verified=true。", "",
             "本清单只生成 Markdown，不回写题单。每个考点下的同题需分别确认考点关系。", ""]
    for topic in scan["topics"]:
        lines.extend([f"## {md_inline(topic)}", ""])
        for row in (row for row in scan["rows"] if row["topic"] == topic):
            entry = row["entry"] if isinstance(row["entry"], dict) else {}
            source, problem_id = entry.get("source", "待补充"), entry.get("id", "待补充")
            url = official_url(source, problem_id)
            lines.extend([f"### {row['index'] + 1}. {md_inline(source)}/{md_inline(problem_id)} {md_inline(entry.get('title', '题名待补充'))}", "",
                          f"- 官方页面：[{md_inline(problem_id)}]({url})" if url else "- 官方页面：暂无可识别的官方链接，请人工补充来源与题号。",
                          f"- 当前状态：{'声明格式有效，仍须人工负责核实真实性' if row['eligible'] else '未通过已核验推荐门槛'}",
                          "- [ ] 人工确认官方题号与完整题名", "- [ ] 人工确认本考点与题面及推荐理由匹配",
                          "- [ ] 人工确认难度适合目标学生", "- 核实人：", "- 核实日期：", "- 考点依据与备注："])
            material = entry.get("source_audit")
            if isinstance(material, dict) and material:
                hints = [f"{key}={md_inline(material[key])}" for key in
                         ("status", "official_title", "retrieved_at", "http_status", "evidence", "response_file")
                         if key in material]
                lines.append("- 自动来源材料（仅辅助，仍待人工）：" + ("；".join(hints) or "存在 source_audit 字段，请参阅对应材料。"))
            if row["errors"]:
                lines.append("- 声明检查问题：" + "；".join(md_inline(issue) for issue in row["errors"]))
            lines.append("")
    return "\n".join(lines) + "\n"


def date_argument(value):
    try:
        return parse_date(value)
    except (ValueError, TypeError) as error:
        raise argparse.ArgumentTypeError(str(error)) from error


def exclusion_argument(value):
    source, separator, problem_id = value.rpartition("/")
    if not separator or not source.strip() or not problem_id.strip():
        raise argparse.ArgumentTypeError("排除项必须为 来源/题号，例如 洛谷/P2440")
    return source, problem_id


def parser():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--map", type=Path, default=DEFAULT_MAP, help="自定义题单 JSON（只读）")
    ap.add_argument("--as-of", type=date_argument, default=date.today(), help="日期校验基准 YYYY-MM-DD，默认本机今天；不是核验日期")
    commands = ap.add_subparsers(dest="command", required=True)
    for name, help_text in (("audit", "输出覆盖、已核验、错误与短缺 JSON"),
                            ("checklist", "生成开发者人工核验 Markdown"),
                            ("recommend", "只检索有效人工核验声明匹配的条目")):
        sub = commands.add_parser(name, help=help_text)
        sub.add_argument("--map", type=Path, default=argparse.SUPPRESS, help="自定义只读题单")
        sub.add_argument("--as-of", type=date_argument, default=argparse.SUPPRESS, help="日期校验基准，默认本机今天；不是核验日期")
        if name == "checklist":
            sub.add_argument("--output", type=Path, required=True, help="Markdown 输出路径，禁止指向题单文件")
        elif name == "recommend":
            sub.add_argument("--topics", nargs="+", action="extend", required=True, help="一个或多个完整考点名，不自动猜测别名")
            sub.add_argument("--limit", type=int, default=3, help="最多推荐数量，默认 3")
            sub.add_argument("--exclude", nargs="+", action="extend", type=exclusion_argument, default=[], help="排除 来源/题号，可提供多个或重复使用")
    return ap


def print_json(value):
    print(json.dumps(value, ensure_ascii=False, indent=2))


def main(argv=None):
    ap = parser()
    args = ap.parse_args(argv)
    if args.command == "recommend" and args.limit < 1:
        ap.error("--limit 必须至少为 1")
    try:
        data = json.loads(args.map.read_text(encoding="utf-8-sig"))
        if args.command == "audit":
            report = audit_catalog(data, args.as_of)
            print_json(report)
            return 1 if report["error_count"] else 0
        if args.command == "recommend":
            print_json(recommend(data, args.topics, args.limit, set(args.exclude), args.as_of))
            return 0
        output = args.output.resolve()
        map_path = args.map.resolve()
        if output == map_path or (output.exists() and output.samefile(map_path)):
            raise ValueError("--output 不得指向题单文件（包括符号链接与硬链接）")
        content = make_checklist(data, args.as_of)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(content, encoding="utf-8", newline="\n")
        print_json({"output": str(output), "as_of": args.as_of.isoformat(), "notice": NOTICE})
        return 0
    except (OSError, UnicodeError, ValueError) as error:
        print_json({"error": str(error), "notice": NOTICE})
        return 2


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
