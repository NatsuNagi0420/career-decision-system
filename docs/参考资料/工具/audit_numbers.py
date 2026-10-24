# -*- coding: utf-8 -*-
"""核对"记录里写的数字能不能指回抓下来的原文"。

用法（在项目根的 docs/参考资料/ 下）：
    python 工具/audit_numbers.py                # 查 抓取原始记录/ 与 笔记/01·05·06
    python 工具/audit_numbers.py 笔记/03_中文就业与岗位信息标准.md   # 只查指定文件

判据来源：README.md §四「每条结论后面挂 [编号] 指回索引」。本脚本只做一件事——
把被检文件里出现的每个数字，拿去 工具/原文文本/ 与 工具/网页原件/ 的落盘原文里找。
找不到的逐条打行号，由人判定是"抄错"还是"原文没落盘"。

已知不算错的两类：自己测得的字节数/状态码（如 `200 / 79,785 B`）、年份与题号。
"""
import glob
import io
import os
import re
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

NUM = re.compile(r"(?<![\w.])(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(\s?%|个百分点|万|亿| million| billion)?")
TAG = re.compile(r"<script.*?</script>|<style.*?</style>", re.S | re.I)
NOISE = re.compile(r"_staging|http|B（|B\)|字节|状态码|复验|本地文件|20\d\d-\d\d|L\d{2,}|20\.500")


def norm(s):
    return re.sub(r"\s+", " ", s.replace("，", ",").replace("．", "."))


def build_corpus():
    paths = []
    for pat in (os.path.join("工具", "原文文本", "*.txt"),
                os.path.join("工具", "网页原件", "**", "*")):
        paths += glob.glob(os.path.join(ROOT, pat), recursive=True)
    for folder in ("01_职业决策理论与量表", "05_工作大环境与就业统计", "06_AI与职业结构",
                   "02_LLM职业咨询与Agent评测", "03_中文就业与岗位信息标准"):
        paths += glob.glob(os.path.join(ROOT, folder, "*.txt"))
    out = []
    for p in paths:
        if not os.path.isfile(p) or os.path.getsize(p) == 0:
            continue
        if not p.lower().endswith((".txt", ".html", ".json", ".out", ".js", ".dl", ".md")):
            continue
        t = open(p, "r", encoding="utf-8", errors="replace").read()
        if p.lower().endswith(".html"):
            t = re.sub(r"<[^>]+>", " ", TAG.sub(" ", t))
        out.append(norm(t))
    return " ||| ".join(out)


def variants(num):
    v = {num, num.replace(",", "")}
    if "." in num:
        v.add(num.replace(".", ","))
    m = re.match(r"^(\d+)00$", num)
    if m:
        v.add(m.group(1) + " 00")
    return v


def check(path, corpus):
    lines = open(path, "r", encoding="utf-8").read().split("\n")
    total = miss = 0
    bad = []
    for i, ln in enumerate(lines, 1):
        if len(ln.strip()) < 4 or NOISE.search(ln):
            continue
        for m in NUM.finditer(ln):
            num = m.group(1)
            if len(re.sub(r"[.,]", "", num)) < 2:
                continue
            if re.fullmatch(r"20\d\d", num):
                continue
            total += 1
            if not any(v in corpus for v in variants(num)):
                miss += 1
                bad.append("  L%-5d %-11s %-4s | %s" % (i, num, (m.group(2) or "").strip(), ln.strip()[:110]))
    print("%-58s 数字 %4d 个 · 回指失败 %3d 个" % (os.path.relpath(path, ROOT), total, miss))
    for b in bad:
        print(b)
    return miss


def main():
    corpus = build_corpus()
    print("原文语料 %d 字符" % len(corpus))
    args = sys.argv[1:]
    targets = []
    if args:
        for a in args:
            targets.append(a if os.path.isabs(a) else os.path.join(ROOT, a))
    else:
        targets = sorted(glob.glob(os.path.join(ROOT, "工具", "抓取原始记录", "*.md")))
        targets += [os.path.join(ROOT, "笔记", n) for n in
                    ("01_职业决策理论与量表.md", "05_工作大环境与就业统计.md", "06_AI与职业结构.md")]
    bad = 0
    for t in targets:
        if os.path.isdir(t):
            bad += sum(check(f, corpus) for f in sorted(glob.glob(os.path.join(t, "*.md"))))
        elif os.path.exists(t):
            bad += check(t, corpus)
        else:
            print("!! 不存在 " + t)
    print("\n合计未回指数字 %d 个（非零不等于有错，逐条人工判定）" % bad)


if __name__ == "__main__":
    main()
