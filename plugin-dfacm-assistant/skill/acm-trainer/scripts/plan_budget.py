#!/usr/bin/env python3
"""训练计划的日期、分钟与逐日题目计数辅助器；不选择题目或证明学习结果。"""
import argparse
import json
from datetime import date, timedelta
from pathlib import Path


ESTIMATES = {"入门": 30, "基础": 60, "进阶": 120}


def iso_date(value):
    try:
        parsed = date.fromisoformat(value)
        if parsed.isoformat() != value:
            raise ValueError
        return parsed
    except ValueError:
        raise argparse.ArgumentTypeError("日期须为有效的 YYYY-MM-DD") from None


def positive_int(value):
    try:
        parsed = int(value)
        if parsed <= 0:
            raise ValueError
        return parsed
    except ValueError:
        raise argparse.ArgumentTypeError("分钟数须为正整数") from None


def nonnegative_int(value):
    try:
        parsed = int(value)
        if parsed < 0:
            raise ValueError
        return parsed
    except ValueError:
        raise argparse.ArgumentTypeError("题量须为非负整数") from None


def stage_dates(today, contest):
    days = (contest - today).days
    if days < 0:
        raise ValueError("比赛日期早于基准日期，请核对日期")
    if days == 0:
        return "contest_day", []
    if days < 7:
        mode = "short_sprint"
        weights = [("薄弱点专项", 50), ("限时模拟/复习", 50)]
    else:
        mode = "staged"
        if days < 14:
            ratios = (0, 60, 40)
        elif days < 30:
            ratios = (20, 50, 30)
        else:
            ratios = (30, 45, 25)
        weights = list(zip(("基础巩固", "专题突破", "模拟冲刺"), ratios))

    # 整数运算避免浮点余数误差，平局按阶段顺序分配。
    counts = [days * weight // 100 for _, weight in weights]
    order = sorted(range(len(weights)), key=lambda i: (-(days * weights[i][1] % 100), i))
    for index in order[:days - sum(counts)]:
        counts[index] += 1
    stages = []
    cursor = today
    for (name, _), count in zip(weights, counts):
        if not count:
            continue
        end = cursor + timedelta(days=count - 1)
        stages.append({"name": name, "days": count,
                       "start_date": cursor.isoformat(), "end_date": end.isoformat()})
        cursor = end + timedelta(days=1)
    return mode, stages


def budget_report(today, contest, daily_minutes, mix=None):
    if daily_minutes <= 0:
        raise ValueError("分钟数须为正整数")
    mode, stages = stage_dates(today, contest)
    report = {
        "purpose": "仅辅助日期与预计分钟预算，不代表完整计划或完成证据",
        "today": today.isoformat(), "contest_date": contest.isoformat(),
        "D": (contest - today).days, "mode": mode, "stages": stages,
        "daily_minutes": daily_minutes,
        "single_problem_estimates": {
            level: {"minutes": minutes,
                    "daily_complete_limit": daily_minutes // minutes,
                    "minimum_days": (minutes + daily_minutes - 1) // daily_minutes}
            for level, minutes in ESTIMATES.items()
        },
    }
    if mode == "contest_day":
        report["contest_day_preparation"] = "比赛当天，仅安排预算内的短复习与准备"
    if mix is not None:
        if any(level not in ESTIMATES or count < 0 for level, count in mix.items()):
            raise ValueError("混合题量仅支持入门/基础/进阶的非负数量")
        counts = {level: mix.get(level, 0) for level in ESTIMATES}
        total = sum(ESTIMATES[level] * count for level, count in counts.items())
        report["mix"] = {"counts": counts, "total_minutes": total,
                         "fits_daily_budget": total <= daily_minutes,
                         "remaining_minutes": daily_minutes - total}
    return report


def schedule_report(schedule, today, contest, daily_minutes):
    """检查计划任务账本；条件首次完成按任务身份去重，不把范围上界逐日相加。"""
    if not isinstance(schedule, dict) or set(schedule) != {"problems", "days"}:
        raise ValueError("schedule 须仅包含 problems 对象与 days 数组")
    problems, rows = schedule["problems"], schedule["days"]
    if not isinstance(problems, dict) or not isinstance(rows, list):
        raise ValueError("problems 须为对象，days 须为数组")
    known_finished = set()
    origins = {}
    for key, problem in problems.items():
        if not isinstance(key, str) or not key.strip() or not isinstance(problem, dict):
            raise ValueError("每题须有非空任务代号与对象")
        if set(problem) - {"topic", "level", "completed_on"}:
            raise ValueError(f"{key}: 未知题目字段")
        if not isinstance(problem.get("topic"), str) or not problem["topic"].strip():
            raise ValueError(f"{key}: topic 须为非空考点")
        if problem.get("level") not in ESTIMATES:
            raise ValueError(f"{key}: level 须为入门/基础/进阶")
        if "completed_on" in problem:
            try:
                completed_on = iso_date(problem["completed_on"])
            except (argparse.ArgumentTypeError, TypeError):
                raise ValueError(f"{key}: completed_on 日期无效") from None
            if completed_on >= today:
                raise ValueError(f"{key}: 历史完成日期须早于基准日期")
            known_finished.add(key)
            origins[key] = {completed_on.isoformat()}
    days = (contest - today).days
    expected = [today + timedelta(days=i) for i in range(days)] if days else [today]
    if days < 0 or len(rows) != len(expected):
        raise ValueError("days 须逐日完整覆盖基准日至比赛前一天；D=0 仅列当天")
    fixed_first, possible_first = set(), set()
    fixed_redo = possible_redo = 0
    level_counts = {level: 0 for level in ESTIMATES}
    reports = []
    for row, expected_date in zip(rows, expected):
        if not isinstance(row, dict) or set(row) != {"date", "tasks"}:
            raise ValueError("每日行须仅包含 date 与 tasks")
        day = expected_date.isoformat()
        if row["date"] != day:
            raise ValueError(f"日期须连续、不重复且有序：期望 {day}")
        tasks = row["tasks"]
        if not isinstance(tasks, list) or not tasks:
            raise ValueError(f"{day}: tasks 须为非空数组（休息可用 study 表示）")
        minutes = new = redo = 0
        conditional = []
        pending_origins = set()
        practiced_today = set()
        for task in tasks:
            if not isinstance(task, dict) or not isinstance(task.get("label"), str) or not task["label"].strip():
                raise ValueError(f"{day}: 每任务须有非空 label")
            value, kind = task.get("minutes"), task.get("kind")
            if type(value) is not int or value <= 0:
                raise ValueError(f"{day}: minutes 须为正整数")
            minutes += value
            fields = {"label", "minutes", "kind"}
            if kind in {"start", "finish", "redo", "revisit"}:
                fields.add("problem")
            if kind in {"redo", "revisit"}:
                fields.add("origin_date")
            if kind == "mock":
                fields.add("problems")
            if kind not in {"study", "start", "finish", "redo", "revisit", "mock"} or set(task) != fields:
                raise ValueError(f"{day}: kind 或任务字段无效")
            if days == 0 and kind != "study":
                raise ValueError("比赛当天只允许短复习/准备，不安排新题或重做")
            if kind == "study":
                continue
            keys = task["problems"] if kind == "mock" else [task["problem"]]
            if not isinstance(keys, list) or not keys or any(not isinstance(key, str) or key not in problems for key in keys):
                raise ValueError(f"{day}: 题目代号须来自 problems")
            if len(keys) != len(set(keys)) or practiced_today.intersection(keys):
                raise ValueError(f"{day}: 同日同题重复；拆分任务合为一个含总分钟的任务")
            practiced_today.update(keys)
            if kind in {"redo", "revisit"}:
                if task["origin_date"] not in origins.get(keys[0], set()):
                    raise ValueError(f"{day}: 重访须引用该题先前实际排入的日期")
            for key in keys:
                finished = key in known_finished or key in fixed_first
                if kind == "finish":
                    if finished or key in possible_first:
                        raise ValueError(f"{day}/{key}: 重复首次完成或条件状态未知，应使用 redo/revisit")
                    fixed_first.add(key)
                    level_counts[problems[key]["level"]] += 1
                    new += 1
                elif kind == "redo":
                    if not finished:
                        raise ValueError(f"{day}/{key}: 尚未计划首次完成，须续作/条件重访")
                    redo += 1
                    fixed_redo += 1
                elif kind == "revisit":
                    if finished:
                        redo += 1
                        fixed_redo += 1
                    else:
                        can_redo = key in possible_first
                        possible_first.add(key)
                        possible_redo += int(can_redo)
                        conditional.append({"problem": key, "new_range": [0, 1],
                                            "redo_range": [0, int(can_redo)],
                                            "exclusive": "续作首次完成与已完成题重做为互斥分支"})
                elif kind == "mock":
                    if finished or key in possible_first:
                        raise ValueError(f"{day}/{key}: 模拟须用不同新题，重复题改用 redo/revisit")
                    possible_first.add(key)
                    conditional.append({"problem": key, "new_range": [0, 1], "redo_range": [0, 0]})
                elif kind == "start" and (finished or key in possible_first):
                    raise ValueError(f"{day}/{key}: 已完成或条件状态题应使用 redo/revisit")
                pending_origins.add(key)
        # 重访只能引用之前的日期，不能用同日的先前任务冒充历史。
        for key in pending_origins:
            origins.setdefault(key, set()).add(day)
        reports.append({"date": day, "minutes": minutes,
                        "remaining_minutes": daily_minutes - minutes,
                        "fits_daily_budget": minutes <= daily_minutes,
                        "planned_new": new, "planned_redo": redo,
                        "conditional_tasks": conditional,
                        "cumulative_new_range": [len(fixed_first), len(fixed_first | possible_first)],
                        "cumulative_redo_range": [fixed_redo, fixed_redo + possible_redo]})
    return {"purpose": "只核对计划声明；完成/重做数仍取决于实际执行，不是 AC 证据",
            "days": reports, "fits_daily_budget": all(row["fits_daily_budget"] for row in reports),
            "planned_new_range": [len(fixed_first), len(fixed_first | possible_first)],
            "planned_redo_range": [fixed_redo, fixed_redo + possible_redo],
            "fixed_new_by_level": level_counts}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--today", type=iso_date, default=date.today(),
                        help="基准日期 YYYY-MM-DD，默认本机今天")
    parser.add_argument("--contest", type=iso_date, required=True, help="比赛日期 YYYY-MM-DD")
    parser.add_argument("--daily-minutes", type=positive_int, required=True, help="每天可用正整数分钟")
    parser.add_argument("--beginner", type=nonnegative_int, help="校验某一天的入门题数量")
    parser.add_argument("--basic", type=nonnegative_int, help="校验某一天的基础题数量")
    parser.add_argument("--advanced", type=nonnegative_int, help="校验某一天的进阶题数量")
    parser.add_argument("--schedule", type=Path, help="可选逐日任务 JSON；只读日期/分钟/身份与条件计数")
    args = parser.parse_args(argv)
    counts = (args.beginner, args.basic, args.advanced)
    mix = None if all(count is None for count in counts) else dict(
        zip(ESTIMATES, (count or 0 for count in counts)))
    try:
        report = budget_report(args.today, args.contest, args.daily_minutes, mix)
        if args.schedule is not None:
            schedule = json.loads(args.schedule.read_text(encoding="utf-8-sig"))
            report["schedule"] = schedule_report(schedule, args.today, args.contest, args.daily_minutes)
    except (OSError, UnicodeError, ValueError) as error:
        parser.error(str(error))
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if (mix is not None and not report["mix"]["fits_daily_budget"] or
                 "schedule" in report and not report["schedule"]["fits_daily_budget"]) else 0


if __name__ == "__main__":
    raise SystemExit(main())
