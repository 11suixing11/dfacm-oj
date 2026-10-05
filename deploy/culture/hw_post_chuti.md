> 本教程是 d&f算法网社区的出题规范，欢迎把经验继续传下去。
> 学会出题，你就从「刷题的人」变成了「给刷题的人制造惊喜的人」。

## 为什么鼓励大家出题

原创题是 OJ 的灵魂。题库里已有的题目是肌肉，原创题才是血肉。**周赛 / 月赛 / 公开赛的题目都欢迎社区成员产出**，出题本身就是训练的一部分。

## 比赛产出分级

- **周赛**：赛制 IOI / OI，题目 level 以入门友好为主；
- **月赛**：赛制 ACM；
- **校赛**：赛制 ACM。

### 劣质题目

如果有劣质题目请立即删除！欢迎大家举报！

## 题目文件夹格式

一个题目文件夹的 `config.yaml`：

```yaml
# 题目类型，可以为 default(比对输出，含spj), submit_answer（提交答案）, interactive（交互题）
type: default
# 全局时空限制（此处的限制优先级低于测试点的限制）
time: 1s
memory: 128m
# 输入输出文件名（例：使用 foo.in 和 foo.out），若使用标准 IO 删除此配置项即可
filename: foo
# 此部分设置当题目类型为 default 时生效
# 比较器类型，支持的值有 default（直接比对，忽略行末空格和文件末换行）, ccr, cena, hustoj, lemon, qduoj, syzoj, testlib
checker_type: default
# 比较器文件（当比较器类型不为 default 时填写；文件路径为压缩包中的路径）
# 将通过扩展名识别语言。在默认配置下，C++ 扩展名应为 .cc 而非 .cpp
checker: chk.cc
# 此部分设置当题目类型为 interactive 时生效：交互器路径（位于压缩包中的路径）
interactor: interactor.cc
# Extra files 额外文件（将被复制到评测工作目录）
user_extra_files:
- extra_input.txt
judge_extra_files:
- extra_file.txt
# Test Cases 测试数据列表 [...]
```

### 单题测试点配置示例（A+B 的完整 config.yaml）

```yaml
type: default
filename: null
score: 10      # 单个测试点分数
time: 1000ms   # 单个测试点时间限制
memory: 256m   # 单个测试点内存限制
cases:
- input: 1.in
  output: 1.out
- input: 2.in
  output: 2.out
# ……一直到 10.in / 10.out
```

## 造数据建议

- **别只造样例**：至少覆盖 0、1、极大值、负数、特殊结构等边界；
- **写对拍**：暴力程序 + 随机数据生成器，对拍 500~1000 组再交；
- **命名规范**：数据文件统一 `N.in` / `N.out`（我们的批量导入管线只认 `.in/.out` 命名）；
- 时空限制写在 config.yaml 顶部，特殊测试点可以单独覆盖。

## 在本站上题

1. 把「题目文件夹 + config.yaml + 数据」打成 zip 发给管理员，或直接发到训练交流群，管理员会通过站内导入通道上题；
2. 导入后记得让管理员设置**难度（1-10）**与**算法标签**——题库按难度、标签筛选，不标注等于白导；
3. 想练手感，可以从「给现有题补数据」「给比赛补标程」开始。

> 出题请勿抄题：改个名字换个背景的搬运题没有意义。原创题哪怕简单，也请让它带着你自己的梗。
