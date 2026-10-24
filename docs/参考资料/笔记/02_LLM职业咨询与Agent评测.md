# LLM 职业咨询与 Agent 评测：可抄的口径（2023–2026）

**这份文件是什么。** 本项目的八格指标里，`evidence_cited`（引用可核对率）与 `structured_success`（结构化成功率）的口径和 0.85/0.90 的阈值都是我们自己定的。这份调研的任务只有一个：把这些数接到已经有人做过的定义上，并找出我们没设防的失效模式。

**怎么核的。** 14 篇全部下载了 PDF 并抽读过定义段/结果段（文件在 `docs/参考资料/02_LLM职业咨询与Agent评测/`，纯文本在 `工具/原文文本/`），不是只读摘要。凡摘要里没有的数字，都在条目里标了所在小节或表号。会议名只写 abs 页 / Crossref 上真有的，arXiv abs 页没标会议的就不给它安一个。

**怎么读「对本系统的用途」。** 每条都落到现成的一处代码或一格指标上。术语对应：`evidence_quotes` 是 `{claim: quote}` 映射（见 `server/evals/corpus.py` 头部注释），`read_texts` 是**这一轮**工具回执正文，`source_refs` 是工具真读过的行，`is_provisional`/`data_coverage` 在 `Artifact` 上，`write_withheld` 是扣住写入的帧，`must_be_provisional` / `must_not_be_provisional` 是 38 例里的金标断言。

---

## 一、职业咨询 / 推荐 / 简历匹配的实证研究

### [01] 意向式与 LLM 式职业规划对话代理的可信度、可用性与可解释性用户研究（User Study on the Trustworthiness, Usability and Explainability of Intent-based and Large Language Model-based Career Planning Conversational Agents）
- Thorsten Zylowski, Nathalia Sautchuk Patrício, Wladimir Hettmann, Katharina Anderer, Karl Fischer, Matthias Wölfel, Peter Henning · 2024 · ICETC 2024（第 16 届教育技术与计算机国际会议，波尔图，2024-09-18~21）· DOI 10.1145/3702163.3702409
- 链接：https://doi.org/10.1145/3702163.3702409 ；开放版 https://publikationen.bibliothek.kit.edu/1000180188
- 类型：实证（横断面用户研究）
- 获取：开放获取（`01_职业规划对话代理用户研究.pdf`，KIT 机构库版，8 页）
- 核心结论：德国三所学校 n=114 名学生，同一职业规划任务下对比三种形态——表单式、意向式（intent-based）CA、LLM 式 CA。均值（表 2）：信任 LLM 式 3.65 / 意向式 3.32 / 表单式 3.48，可解释性（SCS，0–1）0.80 / 0.72 / 0.73。信任与可解释性两项上，LLM 式均显著高于意向式：信任 t=−2.13、p<0.05，可解释性 t=−2.26、p<0.05（§4 结果段），但与表单式无显著差异。作者列出的信任因子是对话灵活度、聊天机器人可信度、意图识别、对话安全感。**最该抄的是那张相关矩阵（表 3）：在 LLM 式上，可解释性与信任的相关只有 0.25（不显著），而 autonomy 与信任相关 0.46\*\*、relatedness 0.34\***；可解释性与 relatedness 的相关才是 0.74\*\*\*。
- 对本系统的用途：我们一直把「可解释性」当成信任的唯一来源（`EvidenceDrawer`、逐字引文、`data_coverage` 环），这张表说不是：**在 LLM 形态下可解释性对信任没有显著贡献，autonomy 才是**。产品含义很直接：审批卡上「用户能不能改、能不能拒、拒了会不会被记住」要和「证据摆得全不全」分开测。试点协议里「`awaiting_approval` 后无动作单独算一类」现在只记了流失，还该记「他有没有找到可以改的那一处」。
- 局限 / 反面证据：横断面问卷、没有真实决策结果，测的是「觉得可信」不是「决策更好」；SCS 与信任量表由作者选定，不可跨研究比较；n=114 来自德国三所学校，原文未报告年龄与年级分布，与我们的中国大学生样本不可直接类比；LLM 式显著优于意向式只说明「更像人说话」，不说明建议质量更高。另有一处值得警惕的自相矛盾：作者把 LLM 式 CA 的 error tolerance 评为「高」，理由正是「因为它总能生成一个回答」——把「从不弃答」当成鲁棒性，这与 [09] 的结论正好相反。

### [02] 人们乐于听从 AI 的个人建议，但福祉并未改善（People readily follow personal advice from AI but it does not improve their well-being）
- Lennart Luettgau, Vanessa Cheung, Magda Dubois, Keno Juechems, Jessica Bergs, Luke Symes, Henry Davidson, Bessie O'Dell, Hannah Rose Kirk, Max Rollwage, Christopher Summerfield · 2025 · arXiv:2511.15352（预印本）
- 链接：https://arxiv.org/abs/2511.15352
- 类型：实证（纵向随机对照试验）
- 获取：开放获取（`02_AI个人建议RCT.pdf`，75 页含附录）
- 核心结论：英国代表性样本 N=6,474 的纵向 RCT。被试与三款聊天机器人（GPT-4o、Llama-3.3-70B、Gemini 3 Pro）之一就**健康、职业、亲密关系**三类话题做 20 分钟对话，对照组与同一批机器人聊爱好。结果：最多 79% 的接受建议组在后续自报**真的照做了**；即便对高风险建议，采纳率仍高于 65%——作者据此说用户对「后果严重性」的校准很弱。用自动评分器（autograder）审对话记录，AI 建议很少违反安全最佳实践；但 2–3 周后回访，接受个人建议组的福祉与对照组**没有可持续差异**。
- 对本系统的用途：这是我们最缺的那类证据，而且结论方向对我们不利：**采纳率高 ≠ 对人有用**。试点协议里「使用后决策是否更清晰」「行动是否更明确」两个前后测，只测了「知道下一步做什么」，没测「照做之后有没有变好」。更重要的一处：我们的产品承诺是「不替用户做决定」，但这篇显示用户会把 20 分钟对话里的建议当成可执行指令——所以「不代做决定」不能只写在文档里，得在输出结构上留痕（我们现在靠 `is_provisional` 与「不给适合度评分」挡，方向对，但缺「用户是否照做」的观测）。
- 局限 / 反面证据：采纳率是**自报**，不是行为日志；福祉用通用量表，不是职业决策质量；职业只是三话题之一，未单独报告职业子样本的效应；预印本未经同行评审；「AI 建议很少违反安全实践」用的是作者自己的 autograder，判据不可复核。

### [03] 人与 LLM 的简历匹配：一项观察研究（Human and LLM-Based Resume Matching: An Observational Study）
- Swanand Vaishampayan, Hunter Leary, Yoseph Berhanu Alebachew, Louis Hickman, Brent A. Stevenor, Weston Beck, Chris Brown · 2025 · Findings of NAACL 2025 · DOI 10.18653/v1/2025.findings-naacl.270
- 链接：https://aclanthology.org/2025.findings-naacl.270/
- 类型：实证（观察研究）
- 获取：开放获取（`03_简历匹配观察研究.pdf`，16 页）
- 核心结论：736 份真实求职简历、四个岗位（Project Manager / Accountant / Sales 等），按真实评价标准分四个构念（工作经验、技能、教育、证书），比较 zero-shot GPT-4（turbo）与受训人工评分。**人工评分者之间的 Fleiss' κ=0.7859（substantial，§4 结果段）**；人-模型一致性上，工作经验 0.5675（moderate），技能/教育/证书更低（§5 表）。CoT 等提示工程能提高一致性（证书维度达到 moderate agreement）。GPT-4 的种族/性别分组差异**不比人类更大**。
- 对本系统的用途：给我们一把尺子——「人-人一致率 0.79，人-模型 0.57」说明**模型与专家的分歧有相当部分是任务本身的主观性**，不是模型坏。我们的 `evidence_cited` 是自证式的（引文在不在原文里），它没有天花板概念；设计「结论质量」指标时应该同时报「两个人类评审之间的一致率」，否则 0.95 这个目标无法解释给评审看。另外它给了一个公平性口径：分组差异要跟人类分组差异比，而不是跟 0 比——我们若做画像-岗位匹配审计，基线应是「人工匹配的分组差异」。
- 局限 / 反面证据：只 4 个岗位、英语语境、美国招聘流程；观察性研究，没有真实录用结果；GPT-4 turbo 是 2024 年快照；「不比人类更偏」不等于「无偏」，因为人类本身就有偏。

### [04] 简历筛选中的性别、种族与交叉偏见：基于语言模型检索（Gender, Race, and Intersectional Bias in Resume Screening via Language Model Retrieval）
- Kyra Wilson, Aylin Caliskan · 2024 · AIES 2024（AAAI/ACM 人工智能伦理与社会会议，第 7 卷）· DOI 10.1609/aies.v7i1.31748
- 链接：https://doi.org/10.1609/aies.v7i1.31748 ；arXiv:2407.20371
- 类型：实证（审计研究）
- 获取：开放获取（`04_简历筛选偏见审计.pdf`，25 页）
- 核心结论：用文档检索框架模拟「岗位→候选人排序」，9 个职业、>500 份公开简历 + 500 份岗位描述、三个 Massive Text Embedding 模型，并给简历插入 **120 个频率受控的姓名**（白人/黑人/男/女关联）。结果：模型在 **85.1% 的检验中显著偏向白人关联姓名**，只在 11.1% 的检验中偏向女性关联姓名；交叉性分析里黑人男性最多在 100% 的案例中处于劣势；文档长度与姓名的语料频次本身也影响排序。
- 对本系统的用途：这是「AI 给出不公平建议」最硬的一类证据，而且**方法是可抄的**：固定画像、只扰动姓名/院校/籍贯等受保护或近受保护字段，看推荐分布是否漂移。我们 38 例里没有任何一格测这个。落地位置：`seed.py` 的造世界里加「同一学生两份画像，仅改姓名/学校」的配对案例，指标记「推荐结果分布漂移率」。
- 局限 / 反面证据：审计的是**嵌入检索排序**，不是生成式建议文本，二者失效机制不同（排序有分数可比，生成没有）；简历数据集是美国公开语料，姓名-种族映射不可移植到中文姓名；只测排序不看最终录用；「显著偏向」用卡方检验，样本远大于最低要求但仍是模拟投递。

---

## 二、评测方法论：归因核验、不确定性、弃答、多步工具调用

### [05] 让语言模型生成带引文的文本（Enabling Large Language Models to Generate Text with Citations，ALCE）
- Tianyu Gao, Howard Yen, Jiatong Yu, Danqi Chen · 2023 · EMNLP 2023 · arXiv:2305.14627
- 链接：https://arxiv.org/abs/2305.14627
- 类型：benchmark（含自动指标与人工校验）
- 获取：开放获取（`05_ALCE引文评测.pdf`，24 页）
- 核心结论：ALCE 是第一个自动评测引文质量的基准，ASQA（factoid 歧义）、QAMPARI（列表）、ELI5（长文）三个数据集，端到端要求「先检索再生成带引文答案」。两个指标定义（§3.3，逐字可抄）：**citation recall** = 对每条陈述 s_i 给 0/1，1 当且仅当「至少有一条引用且 concat(C_i) 蕴含 s_i」，全篇平均；**citation precision** = 对每条引用给 0/1，判它是否「无关」——单独一条不支撑该陈述、且删掉它不影响其余引用合起来支撑。蕴含判定用 NLI 模型 TRUE（t5_xxl_true_nli_mixture），框架沿用 AIS（attributable to identified sources）。人工校验（§6 表 8/9）：ASQA 上 ChatGPT VANILLA 人工 74.7/76.6、自动 75.3/74.4，Vicuna-13B 人工 51.6/51.5、自动 50.3/50.1；十个格子里多数差在 2 点内，最大 3.3 点（ELI5 的 ChatGPT+RERANK，人工 recall 59.7 对自动 63.0）。最好模型在 ELI5 上仍有 50% 的句子得不到完整引文支撑。
- 对本系统的用途：**这是我们 `evidence_cited` 最直接的替换口径。** 现在这一格问的是「这句引文能不能在本轮读过的行里找到字符串」（逐字 61 / 换标点 9 / 字段重拼 15 / 找不到 10），它证明的是「引文真实存在」，不是「这句话被这句引文支持」。ALCE 把它拆成两桶：recall（有没有支撑）与 precision（引文是否多余）。我们的 `evidence_quotes` 本来就是 `{claim: quote}` 映射，改造成这两个桶不需要新数据，只需要一个「蕴含判定」步骤。
- 局限 / 反面证据：NLI judge 自身有假阳/假阴，ALCE 也只做了小样本人工校验（部分模型、部分数据集）；precision 定义刻意允许冗余引用，因此比 Liu et al. 松；三个数据集都是英文开放域问答，不含岗位/薪资这类结构化事实。

### [06] 生成式搜索引擎的可核验性评测（Evaluating Verifiability in Generative Search Engines）
- Nelson F. Liu, Tianyi Zhang, Percy Liang · 2023 · Findings of EMNLP 2023 · arXiv:2304.09848
- 链接：https://arxiv.org/abs/2304.09848
- 类型：实证（人工审计）
- 获取：开放获取（`06_生成式搜索可核验性.pdf`，25 页）
- 核心结论：34 名标注者审计 4 个商用生成式搜索引擎（Bing Chat、NeevaAI、perplexity.ai、YouChat），每个系统 **1450 条 query**（5 个来源各 150 条 + 7 个 NaturalQuestions 子分布各 100 条）。平均**只有 51.5% 的生成句子被引用完全支撑**（citation recall），**74.5% 的引用支撑了它对应的句子**（citation precision）。方法上三件事值得抄：①先把回答切成 statement，并**剔除「不需要核验」的句子**（关于系统自身的、反问用户的）；②支撑判定给三档 full / partial / no support，多引用时另问「这些引用的并集是否完全支撑」；③**弃答要单列**——NeevaAI 对 22.7% 的 query 直接不回答（因为它要嵌进传统搜索结果页）。
- 对本系统的用途：三条落地。第一，我们缺「**哪些句子需要出处**」这一步：现在 `uncertain_as_certain` 只在成果物级看「一条引文都没有」，而同样没有引文的那句话可能整段是「根据你的情况，建议先做 X」——这类不需要出处，混在一起会把分母弄脏。第二，`evidence_cited` 的判定该从「字符串命中」升级成三档，`recomposed` 那 15 条正好可以按 partial 处理。第三，**弃答率**：NeevaAI 的 22.7% 说明「合法不答」在一个真实产品里是几十个百分点的量级，我们现在把 `write_withheld` 当异常路径，缺一个「拒答率」的正常值区间。
- 局限 / 反面证据：2023 年 3 月的系统快照，产品已大改；单轮 query，没有多轮任务状态；标注者对「完全支撑」的判定无一致性统计报告（文中未给 kappa）；四个引擎的回答风格差异本身会影响可切分性。

### [07] 大模型的长文本事实性（Long-form factuality in large language models，SAFE / LongFact / F1@K）
- Jerry Wei, Chengrun Yang, Xinying Song, Yifeng Lu, Nathan Hu, Jie Huang, Dustin Tran, Daiyi Peng, Ruibo Liu, Da Huang, Cosmo Du, Quoc V. Le · 2024 · NeurIPS 2024 · arXiv:2403.18802
- 链接：https://arxiv.org/abs/2403.18802
- 类型：benchmark（含自动评测方法与人工对齐）
- 获取：开放获取（`07_SAFE长文事实性.pdf`，72 页）
- 核心结论：LongFact 是 GPT-4 生成的 38 主题、数千条长文 prompt 集；SAFE 用一个 LLM agent 把回答**拆成原子事实**，逐条发搜索查询判断是否被支持。聚合指标 **F1@K**：precision = 被支持事实数 /（被支持 + 不被支持），recall = 被支持事实数 / K，K 是「用户偏好的理想事实条数」这个超参（他们取 K=64 即中位数、K=178 即最大值，§6），F1 取调和平均。可信度：在约 **1.6 万条原子事实**上 SAFE 与众包人类标注一致率 **72%**；在 100 个分歧案例里 SAFE 胜出 **76%**；成本比人类低 20 倍以上。评测 13 个模型、4 个家族，结论是大模型通常更事实。
- 对本系统的用途：两个点。①我们完全没有「把一句话拆成可核验单元」这一步，`evidence_quotes` 的 key 是模型自己写的一句 claim，粒度由模型决定，因此「一句长 claim 配一条短引文」这种伪支撑现在测不出来——SAFE 的拆解是解法。②**F1@K 的 K 解决了一个我们现在就有的漏洞**：「写得越长、引文越多，分越高」。我们的 `evidence_cited` 分母是引文条数，模型多写几条就能稀释，和 SAFE 要处理的 recall 分母问题同构。
- 局限 / 反面证据：核验依赖 Google 搜索，中国岗位库不能直接复用；72% 一致率意味着约 28% 的判断与人不一致，且它在分歧上「胜出」的判定也是人做的；原子事实拆解本身会引入错误（拆错则整条判错）；成本虽然低 20 倍仍不是零。

### [08] 短问答事实性度量（Measuring short-form factuality in large language models，SimpleQA）
- Jason Wei, Nguyen Karina, Hyung Won Chung, Yunxin Joy Jiao, Spencer Papay, Amelia Glaese, John Schulman, William Fedus · 2024 · arXiv:2411.04368（OpenAI，博客文性质）
- 链接：https://arxiv.org/abs/2411.04368
- 类型：benchmark
- 获取：开放获取（`08_SimpleQA短问答事实性.pdf`，13 页）
- 核心结论：4,326 条短问答，答案唯一可判。每条回答被判成三档：**correct / incorrect / not attempted**（用被提示的 ChatGPT 判官；人工复核 100+100+100 条只有 2 处分歧）。由三档派两个率：overall correct（全题正确率）与 correct-given-attempted（只在实际作答的题里正确的比例），单指标是二者的**调和平均 F-score**；并指出 F-score 的漏洞（低于 50% 时猜答案有利），给替代方案——correct=1、not attempted=0、incorrect=−p 的加权分（p=9 时相当于要求「作答的至少 90% 正确」）。校准另用两种办法：让模型自报 confidence%，或同题采样 100 次用答案频率当置信度。表 3 具体值：GPT-4o 正确 38.2 / 未尝试 1.0 / F=38.4；Claude-3.5-sonnet 正确 28.9 / 未尝试 35.0 / F=35.0（少答但 F 接近）。
- 对本系统的用途：**`structured_success` 应该换成这个口径。** 现在它算的是「该跑完的 34 例里终局状态是 completed 的比例」，实测 1.0；这个数把「跑完了但结论错」和「跑完了且结论对」算成同一个，而且把「不该跑完的 4 例」整个移出分母。SimpleQA 的三档正好对应我们的终局形态：correct ≈ 结构+内容都过；not attempted ≈ `write_withheld` / 用户取消 / 未授权同意；incorrect ≈ 跑完了但断言失败。换成 F-score 后，一例「拒答」不再既不加分也不扣分。
- 局限 / 反面证据：短答案、单事实，「correct」的判据是字符串级包含参考答，不适用多步任务与长文本；判官是 2024 年的 ChatGPT；三档里「not attempted」的判定边界（说了些相关内容但没给答案）本身模糊；未做跨语言验证。

### [09] AbstentionBench：推理型 LLM 在无解问题上失守（AbstentionBench: Reasoning LLMs Fail on Unanswerable Questions）
- Polina Kirichenko, Mark Ibrahim, Kamalika Chaudhuri, Samuel J. Bell · 2025 · NeurIPS 2025（Crossref 卷名 Advances in Neural Information Processing Systems 38；DOI 10.52202/085713-5729）· arXiv:2506.09038
- 链接：https://arxiv.org/abs/2506.09038
- 类型：benchmark
- 获取：开放获取（`09_AbstentionBench弃答.pdf`，43 页）
- 核心结论：20 个数据集、20 个前沿 LLM 的弃答评测，覆盖「答案未知、问题欠定义、前提错误、主观解释、信息过时」五类。每个样本带「此处是否应当弃答」标签，指标是**abstention recall**（该弃答而弃答的比例）、**precision**（弃答中不该弃答的比例）与 F1；弃答判定用 Llama 3.1 8B Instruct 作判官 + 定制系统提示，非弃答回答另用判官判正确性（§3）。结论：弃答仍未解决，**扩大模型规模几乎没用**；**推理微调平均让弃答率掉 24%**（例如 DeepSeek R1 Distill Llama 70B、s1 相对非推理版本），即使数学/科学这类它被专门训练的域也掉；推理链里出现不确定性表述时，最终回答仍常是确定结论；精心写的系统提示能显著提升弃答，但不能解决根本问题。
- 对本系统的用途：**把 `uncertain_as_certain` 换成一个 recall/precision 对。** 现在它算「没有一条原句引用、又没标临时结论的成果物数 / 要求证据的成果物数」，实测 0/23，阈值 ≤0.05——这些数把「缺引文」和「把不确定说成确定」混在一起，而且全或无。好消息是**金标我们已经有**：38 例里的 `must_be_provisional` / `must_not_be_provisional` 断言天然就是「该不该弃答」，`write_withheld` 帧就是「弃答」这个动作。现在这些标签只被当成 pass/fail 的断言，没有被聚合成一个数。
- 局限 / 反面证据：全是文本 QA 场景，没有多步工具调用与写操作，而我们的弃答是「扣住写入」这种有副作用的动作；判官是 Llama 3.1 8B，与被测开放模型同源；「该不该弃答」的标签由作者标定，主观类样本边界模糊；中文岗位域没有覆盖。

### [10] LLM 会表达自己的不确定性吗？置信度引出的实证评测（Can LLMs Express Their Uncertainty? An Empirical Evaluation of Confidence Elicitation in LLMs）
- Miao Xiong, Zhiyuan Hu, Xinyang Lu, Yifei Li, Jie Fu, Junxian He, Bryan Hooi · 2023（ICLR 2024）· arXiv:2306.13063
- 链接：https://arxiv.org/abs/2306.13063
- 类型：benchmark（评测方法）
- 获取：开放获取（`10_黑盒置信度校准.pdf`，29 页）
- 核心结论：把黑盒置信度估计拆成三件可组合的事——口头置信的提示策略、多次采样的方法、把多个答案聚合成置信度的规则；在 **5 类任务、8 个细分数据集**（GSM8K、SVAMP、Date Understanding、Object Counting、Strategy、Sport Understanding、Professional Law、Business Ethics）× 5 个模型（含 GPT-4、LLaMA-2-Chat）上评两条轴：**校准（ECE）** 与 **失败预测（AUROC，另加 AUPRC-Positive / AUPRC-Negative 处理正负不平衡）**（§4）。结论：模型口头置信系统性过度自信（像人在模仿人的表达习惯）；模型能力越强校准与失败预测都越好；白盒方法更好但差距不大——**AUROC 0.605 对 0.522**；**所有方法在需要专业知识的任务（Law、Ethics）上最差**。
- 对本系统的用途：`is_provisional` 现在是一个 0/1 旗子，全项目**没有任何一格验证过它是否真能预测「证据不足」**。这篇给的就是那个口径：以 `is_provisional`（或 `data_coverage` 做阈值扫描）为预测分数、以 case 金标（`min_evidence_quotes` 是否达标）为真值，算 **failure-prediction AUROC**。若 AUROC 接近 0.5，说明这面旗子只是装饰；若 0.7 以上，`data_coverage` 的门槛值才有依据。另外「专业域最差」直接对应我们：职业决策就是专业域。
- 局限 / 反面证据：任务是单轮 QA，不是多步 agent，置信度是模型自报而非系统算出；ECE 依赖分箱、对样本量敏感（我们的 38 例远不够做 ECE，只够做 AUROC）；AUPRC 在极不平衡下才可靠，我们的负例很少。

### [11] τ-bench：真实域里的工具-智能体-用户交互基准（τ-bench: A Benchmark for Tool-Agent-User Interaction in Real-World Domains）
- Shunyu Yao, Noah Shinn, Pedram Razavi, Karthik Narasimhan · 2024 · arXiv:2406.12045（abs 页未标注会议，此处只按 arXiv 记）
- 链接：https://arxiv.org/abs/2406.12045
- 类型：benchmark
- 获取：开放获取（`11_taubench一致性.pdf`，50 页）
- 核心结论：用户由语言模型模拟，agent 拿到领域 API 工具与**一份领域政策文档（写进系统提示）**，评测不看对话文本，而是**比会话结束时的数据库状态与标注目标状态是否一致**（§3）。提出 **pass^k**：k 次独立试验全部成功的概率，按任务平均——与代码生成的 pass@k（k 次里至少一次成功）方向相反，专测可靠性。结果：gpt-4o 用 function calling 的 pass^1 约 61%（τ-retail）/ 约 35%（τ-airline），τ-retail 的 **pass^8 低到约 25%**。失败集中在复杂数据库推理、遵循临时政策、一次请求里含多个子请求。
- 对本系统的用途：两处直接可用。①**pass^k 我们立刻能算**：基线跑过三遍，报告里每例都有 `passed` 与 `run_id`（`prompt_fingerprint` 只有指纹落地后的报告才有，见 §四）。用现成三份 38 例报告算出来是 **pass^3 = 34/38 = 0.8947、pass@3 = 38/38**，而 `case_pass_rate` 报的是单轮 37/38——分不清「稳定过」和「这次碰巧过」。②「政策写进系统提示 + 比终态」与我们「能力提示词指纹 + 受管写入表的行数 delta」是同一个结构，可以互相印证——它也说明**只看终态不看文本**是可行且更客观的，而我们恰恰有一半指标在看文本（引文、`is_provisional`）。
- 局限 / 反面证据：模拟用户是 LM 不是真人，用户行为的多样性被低估；只有 retail 与 airline 两个域，且政策文档由作者撰写；pass^k 需要 k 次重跑，成本是线性的（我们三遍基线约 $0.14/轮，可承受）；失败归因仍需人工读轨迹，没有自动的失效分类。

---

## 三、HCI：人机共同决策、审批门与信任

### [12] 依赖不可靠者：语言模型不愿表达不确定性带来的影响（Relying on the Unreliable: The Impact of Language Models' Reluctance to Express Uncertainty）
- Kaitlyn Zhou, Jena D. Hwang, Xiang Ren, Maarten Sap · 2024 · ACL 2024 · arXiv:2401.06730
- 链接：https://arxiv.org/abs/2401.06730
- 类型：实证（模型分析 + 人类受试实验）
- 获取：开放获取（`12_不确定表达与用户依赖.pdf`，21 页）
- 核心结论：公开部署的模型即使答错也很少表达不确定；被明确要求报置信时，**「自信」的回答里平均 47% 是错的**。人类实验三组设置：控制组 25 人 × 106 题；**约 90% 的人会采纳带 strengthener（"I'm sure…"）的回答，约 90% 的人看到 weakener（"I'm not certain, but…"）会去查证——但平铺直叙的 "The answer is (A)" 同样被采纳约 90%**，即「不标记」被读成「确定」（§4.3）。三个交互设置各 25 人、50 轮：校准设置下用户约 20 轮后学会，对 weakener 的依赖降到约 1%；过度自信设置造成的损失会延续到后面本已校准的轮次。后训练偏好数据里人类也偏好不含不确定性的文本。
- 对本系统的用途：**决定性的一条。** 我们把 `is_provisional` 做成了卡片上的一个 pill（"依据不足，临时结论"），而这篇显示：句子里不带不确定性词汇时，用户默认当成确定——UI 上的标记不能替代**正文里的逐句表达**。这条同时给了 `uncertain_as_certain` 一个新的解释：这个 0/23 只证明「模型没在成果物里把缺证据说成确定」，不证明「用户读出来的是不确定」。另外它告诉我们门槛不该是 0：用户需要约 20 轮才能学会读这些标记，所以短期指标应该看**学得快不快**，而不是要求一次就懂。
- 局限 / 反面证据：知识问答任务（首都名），与职业决策的信息结构差很远；被试来自 Prolific；被评价的「Marvin」是模拟模型而非真实部署；「采纳」用打分制强制选择，与真实场景的自由放弃不同。

### [13] 解释能减少决策中对 AI 的过度依赖（Explanations Can Reduce Overreliance on AI Systems During Decision-Making）
- Helena Vasconcelos, Matthew Jörke, Madeleine Grunde-McLaughlin, Tobias Gerstenberg, Michael S. Bernstein, Ranjay Krishna · 2023 · Proceedings of the ACM on Human-Computer Interaction（PACMHCI）· DOI 10.1145/3579605 · arXiv:2212.06823
- 链接：https://doi.org/10.1145/3579605
- 类型：实证（5 个受控实验）
- 获取：开放获取（`13_解释降低过度依赖.pdf`，38 页）
- 核心结论：领域里有个顽固结论——「给解释不能减少过度依赖」。作者用成本-收益框架反驳：人是否去核验 AI 的解释，取决于核验成本与收益的比较。5 个实验、N=731，在迷宫任务里与模拟 AI 协作：任务难度（研究 1）、解释本身的难度（研究 2、3）、金钱报酬（研究 4）都显著改变过度依赖水平；研究 5 用认知努力折扣范式（Cognitive Effort Discounting）量化了不同解释对用户的效用。结论：文献里那些零效应，可能只是因为「那条解释没有把核验成本降下来」。
- 对本系统的用途：**这是审批门（approval gate）设计的核心经济学。** 我们的 `unapproved_writes`=0 只证明「机器没绕过门」，不证明「门拦住了坏建议」。按这篇，门是否有效取决于：用户点开审批卡去核验证据的成本，是否低于直接点「采纳」的成本。可落地的度量：从审批卡到「看到原句」的**点击数**、证据面板首屏能否不下滚就看到引文与它的源句、`evidence_quotes` 的 quote 能否一步定位到原文（我们已有版本链要求「上一条只认用户真见过的结论」，但从没量过「看到要几步」）。如果证据要三步才看得到，这个门在设计上就已经失效。
- 局限 / 反面证据：迷宫任务是低保真、低风险的决策，与「选职业」的后果不可比；AI 是模拟的，解释形式受控；「成本」用点击与时间操作化，未必等于认知成本；作者自己的框架也承认未测长期学习效应。

### [14] 可解释性并不能缓解人事选拔任务中错误 AI 建议的负面影响（Explainability does not mitigate the negative impact of incorrect AI advice in a personnel selection task）
- Julia Cecil, Eva Lermer, Matthias F. C. Hudecek, Jan Sauer, Susanne Gaube · 2024 · Scientific Reports · DOI 10.1038/s41598-024-60220-5
- 链接：https://doi.org/10.1038/s41598-024-60220-5
- 类型：实证（5 个预注册实验）
- 获取：开放获取（`14_可解释性未缓解错误采纳.pdf`，15 页）
- 核心结论：5 个预注册实验、**N=1403**（大学生 + 人力资源从业者），任务是人事选拔（看候选人材料 + AI 建议，判断是否录用）。实验 1a/1b 操纵建议来源（人 vs AI），2a/2b/2c 在 AI 建议上再加可解释性（热图、图表）。因变量：任务表现、对建议质量的评分、对自己判断的信心。结果一致：**错误建议显著拉低表现，因为人不愿驳回它**（overreliance）；来源与可解释性对三个因变量的效应都很有限；**把预测做得更可解释，并没有减少对错误建议的过度依赖**。作者据此呼吁 HR 领域的监管与质量标准。
- 对本系统的用途：**这是「审批门有效性」最该读的反面证据，而且场景就在职业域。** 它说明「把理由摆出来」不等于「人会拒绝」。所以我们不能把 `unapproved_writes`=0 与「审批门有效」混为一谈，也不能指望加个证据抽屉就让人少犯错。真正要测的是：给一个**已知错误**的提议，用户采纳率是多少。机器侧能做的第一步是「缺证据的成果物不生成 Proposal、改发 `write_withheld`」（`AGENT_CAPABILITY_MAP`「真机演示抓出的四个产品级缺陷」第 2 条已记该修法），第二步才是人工实验测「坏提议采纳率」。
- 局限 / 反面证据：人事选拔是「筛别人」的视角，与求职者「替自己决定」的动机结构相反（前者有雇主的责任压力，后者有个人利害）；热图/图表是较弱的解释形态，弱于逐字引文；单次任务、无长期反馈；N 大但每组样本小，效应量的置信区间在原文里应细看。

---

## 四、特别标注：我们应该加进评测集但还没加的指标

**先说结论：八格里 `structured_success` 与 `uncertain_as_certain` 是自造的**，两者都能换成有文献依据的口径（见 §五）。下面三个是新指标，按「现在就能算」到「要先造数据」排序。

### 新增 1（最该加）：`citation_support` 引文支撑率 —— 按陈述算，不按引文算
- **文献口径**：ALCE 的 citation recall（每条陈述 0/1，1 当且仅当「有引用且引用合起来蕴含该陈述」，全篇平均）与 citation precision（每条引用是否「无关」——删掉不影响支撑）；支撑判定的三档 full / partial / no 用 Liu et al. 的操作定义。
- **怎么算**：分母 = 成果物里**带至少一条引文的陈述数**（`evidence_quotes` 的每个 claim 键就是一条陈述；`content.sections[].lines[]` 是更细的候选粒度）。分子 = 判定为「引文完全支撑该陈述」的条数。另开一个 precision 桶数「无关引用」（quote 与该 claim 无关、或删掉不影响其余引用）。`too_short` 继续排除在分母外——把「短到核对不了的串」剔出分母是我们自己加的一步，虽然 ALCE/Liu 剔的是「不需要核验的句子」而不是「太短的引文」，但二者同源：**分母只装真正可核验的东西**，否则分数由不可核验项决定。
- **依赖我们已有什么**：`Artifact.evidence_quotes`（claim→quote 映射，已存在）✓；`read_texts`（本轮工具回执正文，已存在）✓；`source_refs`（工具真读过的行，已存在）✓；95 条引文的现有分桶（逐字 61 / 换标点 9 / 字段重拼 15 / 找不到 10）可作判定器校准集 ✓。**唯一缺的是「蕴含判定」这一步**：先用规则（数字、专名、岗位名是否同现）+ 人工把这 95 条标一遍（工作量约半天），据此定阈值；规模上去再考虑 NLI 或 LLM judge。
- **为什么它比现有的好**：`evidence_cited` 现在证明「引文真实存在」，`citation_support` 证明「这句话被引文支持」。前者模型只要抄原句就能满分，后者必须把 claim 写在引文能兜住的范围内。

### 新增 2：`pass_k` 稳定通过率 —— 把「一次全绿」和「稳定全绿」分开
- **文献口径**：τ-bench 的 pass^k = k 次独立试验全部成功的概率，按任务平均（注意与 pass@k 方向相反）。
- **怎么算**：对同一 case 取 k 份独立评测报告，`passed` 全为真才记 1，再对 38 例平均。要求这 k 份的 `prompt_fingerprint` 相同（否则比的是不同系统），`model` 与网关参数相同（`usage_recorded.model` 可归因）。
- **依赖我们已有什么**：`CaseResult.passed` + `run_id` 已写进每份报告 ✓；`--rescore` 支持不花钱重算 ✓。**这条不用新增数据就能算——我已经用现成的三份 38 例报告算了一遍**（`server/var/eval-0921-042529-live.json`、`-044919-live.json`、`-050312-live.json`，三份都是 38 例，分别是 34 / 38 / 37 例通过）：**pass^3 = 34/38 = 0.8947**，而 `pass@3`（三次里至少过一次）= 38/38。有 4 例在三次之间翻转，`bad_tool_args_city` 是 F-P-F，另三例 `compare_two_candidates_one_evidenced`、`direction_vague_goal`、`evidence_weak_coverage` 都是 F-P-P。
- **一个必须写清的边界**：这三遍都在提示词指纹落地（§35）之前跑的，报告里 `prompt_fingerprint` 为空，现在只能靠文件名时间窗与 `run_id` 认定为同一代。指纹落地后的报告（`eval-0921-131519.json`）才有 8 个不同能力指纹。所以 pass^k 要成为门槛，得先固定「同指纹」这个前置条件，再重跑三轮——**这恰好是一次真实的成本-收益判断，不是白拿的**。
- **为什么值得加**：τ-bench 里 gpt-4o 从 pass^1 61% 掉到 pass^8 25%，说明单轮通过率会系统性高估可靠性。我们自己的数同向：`case_pass_rate` 报 37/38（0.974），`pass^3` 只有 34/38（0.895）——差的那 3 例全是「跑三次只坏一次」的偶发失败，单轮报告看不见它们，而这正是最该盯的一类。

### 新增 3：`abstention_recall` / `abstention_precision` —— 把「该弃答时弃答」变成一个可算的数
- **文献口径**：AbstentionBench 的 abstention recall（该弃答而弃答的比例）、precision（弃答中不该弃答的比例）、F1（作者说 precision 普遍高，因此重点看 recall）。
- **怎么算**：recall = 「金标应扣住」（`must_be_provisional` / `write_withheld` 期望）的案例中，实际出现 `write_withheld` 或 `is_provisional=true` 的比例；precision = 实际扣住/临时的案例中，金标确实为「应扣住」的比例。分母各自写明，算不出来返回 `None` 而不是满分（这条纪律我们已经有了，`evidence_cited` 就是这么做的）。
- **依赖我们已有什么**：38 例的 `must_be_provisional` / `must_not_be_provisional` / `min_evidence_quotes` 断言 ✓；`write_withheld` 帧 ✓；`is_provisional` 列 ✓。**现在这些金标只被当作 pass/fail 的断言用，没有被聚合成一个数** —— 这是最便宜的一处改进，因为标签已经在案例集里了。
- **为什么它比 `uncertain_as_certain` 好**：后者是「没引文又没标临时」的成果物计数，把两个不同的失误混在一起，而且是全或无；前者把「该弃答」与「不该弃答」分开，才能看出「过度弃答」这种反向失效（模型学会乱标临时结论来刷 recall）。

### 只想加一条的话
加 **`citation_support`**。理由：它是唯一一个**直接替换现有门槛指标**的新增项（不是加一格在旁边），ALCE 与 Liu 两篇的口径可以互相校验，而且我们的数据结构（`{claim: quote}` + `read_texts`）刚好够，不需要新造世界。

### 备选（要新造数据，先记账）
- `demographic_shift`：同一画像只扰动姓名/院校/籍贯，看推荐结果分布漂移（抄 Wilson & Caliskan 的审计设计）。依赖：`seed.py` 里加配对世界、推荐结果要落成可比的结构。现在没有。
- `bad_proposal_acceptance`：给一个已知错误的提议，测采纳率（抄 Cecil 的实验设计，是唯一能真正验证「审批门有效」的量）。依赖：真人 + 预置错误提议，机器侧只能测到「坏提议被送到门前没有」。

---

## 五、与现有八格的对账

| 现有指标 | 实测 | 自造？ | 该换成什么 / 依据 |
| --- | --- | --- | --- |
| `structured_success` ≥0.90 | 1.0（34/34） | **是**，只测终局状态 | SimpleQA 的 F-score：overall correct 与 correct-given-attempted 的调和平均（[08]）；「not attempted」对应 `write_withheld`/取消/未授权 |
| `evidence_cited` ≥0.85 | 0.895（85/95） | 半个，只查「字符串找得到」 | 保留现桶作「引文真实性」，**另加** `citation_support` 的 recall/precision 两桶（[05][06]） |
| `uncertain_as_certain` ≤0.05 | 0/23 | **是**，两件事混一起 + 全或无 | AbstentionBench 的 abstention recall/precision（[09]），金标用现成的 `must_be_provisional` |
| `unapproved_writes` ==0 | 0 | 不是，是硬不变量 | 保留。但**别把它当「审批门有效」的证据**（[13][14]） |
| `cross_user_reads` ==0 | 0 | 不是，是硬不变量 | 保留。缺的是「工具零 `source_refs` 时看不见」这条边界，已在代码注释里认了 |
| `fake_success_artifacts` ==0 | 0 | 是，但它是内部一致性不变量 | 保留，别当质量指标；`run.status=failed` 却有 `committed` 成果物，本质是状态机自检 |
| `case_pass_rate` | 37/38 | 是，但它是台架数不是质量数 | 保留；旁边加 `pass^k`（[11]）。已用现成三份报告算出 pass^3=34/38，比单轮低 3 例 |
| `empty_result_reads`（不进门槛） | 报告里多为空 | 是，但作者已明说只作观察 | 保留。**注意：`server/var/` 里 11 份报告中有 8 份这一格是空的**（指标在 09-21 晚才落地，早的报告没这字段），所以不能引用「某轮实测 0.25」——那个 0.25 只在 `test_metric_denominators.py` 的构造样本里出现过。文献侧最近的是检索覆盖率/弃答率（[06] 的 22.7% 给了「合法不答」的量级参照） |

单列一条：**`is_provisional` 这面旗子从来没被验证过是否真能预测「证据不足」**。用 [10] 的 failure-prediction AUROC 口径，以 `is_provisional`/`data_coverage` 为分数、38 例金标为真值，就能给它一个数。

---

## 六、检索的边界（说清楚没做到什么）

- **没找到**：中国大学生 / 初入职场人群的职业决策 HCI 实证；「职业咨询 Agent」的真实用户田野实验（除 [02] 的职业是三个话题之一）；中文岗位库上的引文核验研究。这三块是我们产品最贴近的场景，目前没有可引的实证。
- **主动排除**：Chain-of-Thought、ReAct 这类奠基论文只在它们定义评测口径时才引（本文件一条都没为「凑数」收）；综述类（如 TACL 2025 的 abstention 综述）没收，因为要的是可抄的公式。
- **获取方式**：14 篇 PDF 全部落到 `02_LLM职业咨询与Agent评测/`，均以 `%PDF` 魔数校验后入库；[01] 用 KIT 机构库版（ACM DL 直连 403）、[14] 用 UCL 仓库版（Nature 直连返回 HTML）。arXiv 官方 API 全程 429，元数据改用 `arxiv.org/abs/` 页面与 OpenAlex/Crossref 交叉核对，会议名以 abs 页 comments 或 Crossref 卷名为准，缺失处已标「未标会议」。
