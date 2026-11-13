/** 青穗集 · 原创整理题：参考公开官方文档，不复制付费题库，也不声称企业真题。 */
import type { Question } from "./preparation-contract.js";

type BankQuestion = Omit<Question, "requirement"> & { tags: string[] };
const question = (id: string, topic: string, tags: string[], prompt: string, rubric: string[], reference_answer: string, source_title: string, source_url: string): BankQuestion =>
  ({ id, topic, tags, prompt, rubric, reference_answer, source_title, source_url, origin: "curated" });
export const QUESTION_BANK: BankQuestion[] = [
  question("js-promise", "异步编程", ["javascript", "前端", "node", "异步"], "一个页面同时请求用户信息和订单。请解释 Promise.all 中某个请求失败后的行为；如果希望分别展示成功结果，你会怎样处理？", ["区分整体拒绝与每项结果", "说明其他请求不会自动取消", "提出 allSettled 或逐项捕获错误"], "Promise.all 在任一输入拒绝时拒绝，不自动取消其他请求。可用 allSettled 分别处理成功与失败，或对每项错误作明确处理。", "MDN · Promise.all", "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all"),
  question("ts-narrowing", "类型收窄", ["typescript", "前端", "类型"], "接口返回 string | null。请写出或描述一个安全获取字符串长度的方法，并说明为什么直接使用非空断言不能替代运行时检查。", ["检查 null 后使用字符串", "理解类型收窄", "断言不会添加运行时保护"], "先用 value !== null 等条件检查，再读取 length。类型收窄帮助编译器推导分支类型，非空断言仅影响类型检查，不能防止运行时空值。", "TypeScript Handbook · Narrowing", "https://www.typescriptlang.org/docs/handbook/2/narrowing.html"),
  question("react-state", "React 状态", ["react", "前端", "组件"], "点击事件里连续调用两次 setCount(count + 1)，为什么通常只增加一次？如何可靠地增加两次？", ["理解当前渲染的状态快照", "说明更新队列", "使用两次函数式更新"], "事件处理器读取同一次渲染的 count，两次都提交相同的新值。可使用两次 setCount(c => c + 1)，让更新依次基于队列中的前一状态。", "React · State as a Snapshot", "https://react.dev/learn/state-as-a-snapshot"),
  question("react-keys", "列表与组件身份", ["react", "前端", "组件"], "可编辑列表支持删除和排序，使用数组下标作为 key 可能出现什么问题？你会如何选择 key？", ["key 标识相邻组件身份", "排序时下标可能对应不同数据", "优先稳定数据 ID"], "下标随列表位置变化，可能使组件状态关联到错误的数据项。使用数据中稳定唯一的 ID，并避免每次渲染随机生成 key。", "React · Rendering Lists", "https://react.dev/learn/rendering-lists"),
  question("web-http", "HTTP 与错误处理", ["前端", "后端", "http", "接口", "测试"], "fetch 收到 HTTP 404 会直接进入 catch 吗？请说明你会怎样区分网络错误、HTTP 错误和业务错误。", ["fetch 不因 HTTP 错误状态自动拒绝", "检查 response.ok/status", "分别处理响应格式与业务字段"], "网络错误等可能使 fetch 拒绝；404 通常仍返回 Response。先检查 ok/status，再解析响应并按接口约定判断业务错误。", "MDN · Using Fetch", "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch"),
  question("sql-join", "SQL 查询", ["sql", "数据", "后端", "数据库"], "要列出所有用户及其订单数量，包括没有订单的用户，你会如何选择 JOIN，并避免把无订单用户统计成一条订单？", ["使用 LEFT JOIN", "以订单的非空主键计数", "按用户分组"], "users LEFT JOIN orders 后按用户分组，使用 COUNT(orders.id) 统计非空订单主键；COUNT(*) 会计入外连接保留的行。", "PostgreSQL · Table Expressions", "https://www.postgresql.org/docs/current/queries-table-expressions.html"),
  question("db-transaction", "事务", ["sql", "后端", "数据库"], "创建订单和扣减库存分两步执行。第二步失败时需要怎样处理？事务能解决哪些问题，还需要检查哪些并发条件？", ["一起提交或回滚", "检查库存与并发更新", "区分原子性和隔离"], "用事务使关联修改共同提交或回滚；仍需根据数据库隔离和业务规则处理并发扣减，例如条件更新、锁或重试，不能只靠先查后改。", "PostgreSQL · Transactions", "https://www.postgresql.org/docs/current/tutorial-transactions.html"),
  question("test-boundary", "边界测试", ["测试", "前端", "后端", "质量"], "注册密码要求 8 到 20 个字符。你会选哪些长度及输入情况测试？为什么只测一个合法密码不够？", ["覆盖上下边界内外", "覆盖空值与输入约定", "验证错误反馈"], "可覆盖 0、7、8、9、19、20、21 等长度，补充空格、字符集和前后端一致性等明确规则。测试预期应来自产品约定。", "ISTQB · Certified Tester Foundation Level", "https://www.istqb.org/certifications/certified-tester-foundation-level"),
  question("python-mutable", "Python 数据与参数", ["python", "数据", "后端"], "函数定义为 def add_item(item, items=[]): 时，重复调用可能发生什么？如何避免不同调用之间意外共享列表？", ["默认参数只求值一次", "可变对象被复用", "使用 None 哨兵创建新列表"], "默认列表在函数定义时创建并被后续调用共享。默认值用 None，在函数内部需要时新建列表；如果有意共享则应明确设计。", "Python Tutorial · Default Argument Values", "https://docs.python.org/3/tutorial/controlflow.html#default-argument-values"),
  question("accessibility-form", "表单与可访问性", ["前端", "html", "表单", "交互"], "一个表单只靠红色边框提示必填项错误。你会怎样让键盘用户和使用读屏的用户也能知道哪里出错？", ["提供明确文字错误", "标签和字段关联", "错误信息关联与焦点处理"], "保留可见标签与文字错误，将字段和错误说明关联，并合理使用 aria-invalid、aria-describedby 与提交后的焦点定位，不能只靠颜色。", "W3C WAI · Form Notifications", "https://www.w3.org/WAI/tutorials/forms/notifications/"),
  question("git-conflict", "协作与版本控制", ["git", "前端", "后端", "协作"], "合并分支时遇到冲突，你会怎样判断保留哪一部分并验证结果？为什么不能简单地全部选择当前版本？", ["理解双方改动意图", "逐处解决冲突", "验证并提交"], "检查冲突上下文和双方修改，必要时与协作者确认，组合正确内容后运行相关检查；全部选择一侧可能丢失有效改动。", "Git Book · Basic Merge Conflicts", "https://git-scm.com/book/en/v2/Git-Branching-Basic-Branching-and-Merging"),
  question("data-null", "缺失值分析", ["数据", "分析", "python", "pandas"], "分析转化率时发现大量记录缺少来源渠道。你会先检查什么？直接删除这些记录可能产生什么偏差？", ["检查缺失比例及分布", "了解采集机制", "比较处理方案影响"], "先核对缺失是否集中在时间、设备或用户群，并检查采集链路。直接删除可能使样本失去代表性，应说明假设、比较处理后的结果并保留未知项。", "pandas · Working with Missing Data", "https://pandas.pydata.org/docs/user_guide/missing_data.html"),
];
export function searchQuestionBank(query = "") {
  const words = query.toLowerCase().split(/[\s,，/]+/).filter(Boolean);
  return QUESTION_BANK.filter(q => !words.length || words.some(word => [q.topic, q.prompt, ...q.tags].join(" ").toLowerCase().includes(word)))
    .map(({ rubric: _rubric, reference_answer: _answer, ...item }) => item);
}
