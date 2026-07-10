INSERT INTO users (id, username, email, phone, password_hash, status, deleted)
VALUES
  (1, 'alice', 'alice@example.com', '18800000001', '$2a$10$testtesttesttesttesttesttesttesttesttesttesttesttestte', 'active', 0),
  (2, 'bob', 'bob@example.com', '18800000002', '$2a$10$testtesttesttesttesttesttesttesttesttesttesttesttestte', 'active', 0);

INSERT INTO user_tokens (user_id, token_hash, token_prefix, token_type, expires_at)
VALUES (1, '4c5dc9b7708905f77f5e5d16316b5dfb425e68cb326dcd55a860e90a7707031e', 'test-token', 'access', DATEADD('DAY', 1, CURRENT_TIMESTAMP));

INSERT INTO assessment_definitions (code, name, version, description)
VALUES ('MBTI', 'MBTI职业性格测评', '1.0', 'test');

INSERT INTO assessment_questions (id, assessment_code, section, question_type, content, sort_order, status)
VALUES
  (1, 'MBTI', 1, '职业场景', '面对一个新的项目组，你更自然的启动方式是？', 1, 'active'),
  (2, 'MBTI', 1, '职业场景', '研究岗位 JD 时，你最先捕捉的是？', 2, 'active'),
  (3, 'MBTI', 1, '职业场景', '收到两份 offer 时，你更依赖哪种判断？', 3, 'active'),
  (4, 'MBTI', 1, '职业场景', '准备面试前，你通常会？', 4, 'active'),
  (5, 'MBTI', 2, '职业场景', '遇到卡点时，你更愿意？', 5, 'active'),
  (6, 'MBTI', 2, '职业场景', '做职业规划时，哪类信息更能说服你？', 6, 'active'),
  (7, 'MBTI', 2, '职业场景', '复盘一次失败投递，你会先看？', 7, 'active'),
  (8, 'MBTI', 2, '职业场景', '面对不断变化的新岗位，你更像？', 8, 'active');

INSERT INTO assessment_options (id, question_id, option_code, content, score_dimension, score_value, sort_order)
VALUES
  (1, 1, 'A', '先同步想法，通过讨论快速建立节奏', 'E', 1, 1),
  (2, 1, 'B', '先独立梳理，整理结构后再进入沟通', 'I', 1, 2),
  (3, 2, 'A', '明确要求：技能、年限、工具和交付物', 'S', 1, 1),
  (4, 2, 'B', '趋势空间：行业方向、成长曲线和可能性', 'N', 1, 2),
  (5, 3, 'A', '理性权重：薪资、岗位、能力复利', 'T', 1, 1),
  (6, 3, 'B', '价值契合：团队氛围、意义感和关系质量', 'F', 1, 2),
  (7, 4, 'A', '排好清单，按计划逐项完成材料', 'J', 1, 1),
  (8, 4, 'B', '保持弹性，边探索边调整表达', 'P', 1, 2),
  (9, 5, 'A', '找人碰撞，快速获得外部反馈', 'E', 1, 1),
  (10, 5, 'B', '安静推演，自己先跑通关键逻辑', 'I', 1, 2),
  (11, 6, 'A', '真实样本：岗位要求、薪资区间、项目案例', 'S', 1, 1),
  (12, 6, 'B', '未来叙事：技术浪潮、跨界机会、长期主题', 'N', 1, 2),
  (13, 7, 'A', '系统原因：简历证据、技能差距、岗位匹配', 'T', 1, 1),
  (14, 7, 'B', '体验反馈：沟通状态、信心波动、选择动机', 'F', 1, 2),
  (15, 8, 'A', '稳定编排，建立路线并持续推进', 'J', 1, 1),
  (16, 8, 'B', '实时混音，根据机会快速切换策略', 'P', 1, 2);

INSERT INTO mbti_dimensions (id, dim_code, dim_name, code_a, name_a, code_b, name_b, tie_rule)
VALUES
  (1, 'E_I', '能量来源', 'E', '外向', 'I', '内向', 'I'),
  (2, 'S_N', '信息偏好', 'S', '实感', 'N', '直觉', 'N'),
  (3, 'T_F', '决策方式', 'T', '思考', 'F', '情感', 'T'),
  (4, 'J_P', '行动节奏', 'J', '判断', 'P', '感知', 'J');

INSERT INTO mbti_personalities (type_code, type_name, description, careers)
VALUES
  ('ESTJ', '执行型管理者', '擅长组织任务、明确规则和推动落地，适合运营管理和流程优化。', '项目经理,运营主管,交付经理');

INSERT INTO jobs (id, source_job_code, source_platform, title, company, city, location_text, direction, industry, company_size, financing_stage, salary_text, experience_level, education, description, company_description, status)
VALUES
  (1001, 'seed-1001', 'seed', '前端工程师', '星图职业智能', '上海', '上海', '技术研发', 'AI职业规划', '100-299人', 'A轮', '18k-28k', '1-3年', '本科及以上', '负责 AI 职业规划系统 Web 端体验。', '专注 AI 职业规划与个人成长工具。', 'active'),
  (1002, 'seed-1002', 'seed', '后端工程师', '启航生涯云', '北京', '北京', '技术研发', 'AI职业规划', '300-499人', 'B轮', '20k-32k', '3-5年', '本科及以上', '建设职业决策系统业务后端。', '提供生涯教育数字化解决方案。', 'active'),
  (1003, 'seed-1003', 'seed', 'AI 应用工程师', '知行智能咨询', '深圳', '深圳', 'AI应用', '人工智能', '100-299人', 'A轮', '22k-36k', '1-3年', '本科及以上', '落地大模型应用，让 AI 建议更稳定、更可解释。', '面向教育和就业场景提供智能咨询能力。', 'active'),
  (1004, 'seed-1004', 'seed', '产品经理', '跃迁职业科技', '杭州', '杭州', '产品设计', '互联网产品', '100-299人', 'A轮', '18k-30k', '3-5年', '本科及以上', '负责 AI 职业规划产品从需求洞察到功能落地。', '提供职业成长产品和组织人才工具。', 'active'),
  (1005, 'seed-1005', 'seed', '数据分析师', '北辰教育智能', '成都', '成都', '数据分析', '教育科技', '300-499人', '未融资', '14k-24k', '1-3年', '本科及以上', '分析用户测评和岗位浏览数据。', '用数据驱动教育服务和职业推荐。', 'active'),
  (1006, 'seed-1006', 'seed', '职业规划顾问', '未来栈生涯中心', '广州', '广州', '咨询服务', '职业教育', '20-99人', '未融资', '12k-20k', '不限', '本科及以上', '提供职业探索和求职路径建议。', '专注职业咨询和测评解读。', 'active'),
  (1007, 'seed-1007', 'seed', '算法产品运营', '凌云人才科技', '上海', '上海', '运营增长', '人才科技', '100-299人', 'A轮', '16k-26k', '1-3年', '本科及以上', '连接用户反馈、岗位内容和推荐策略。', '建设人才推荐和职业内容平台。', 'active'),
  (1008, 'seed-1008', 'seed', '全栈工程师', '青藤成长平台', '远程', '远程', '技术研发', 'AI工具', '20-99人', '天使轮', '18k-30k', '3-5年', '本科及以上', '交付职业规划系统的新功能原型。', '面向年轻人的成长工具平台。', 'active');

INSERT INTO job_tags (id, name, type)
VALUES
  (1, 'Vue 3', 'skill'),
  (2, 'TypeScript', 'skill'),
  (3, 'React', 'skill'),
  (4, 'Java', 'skill'),
  (5, 'Spring Boot', 'skill'),
  (6, 'Python', 'skill'),
  (7, 'LLM', 'skill'),
  (8, 'RAG', 'skill'),
  (9, 'AI产品', 'skill'),
  (10, 'SQL', 'skill'),
  (11, 'BI', 'skill'),
  (12, '职业咨询', 'skill'),
  (13, '推荐策略', 'skill'),
  (14, 'Node.js', 'skill');

INSERT INTO job_tag_rel (job_id, tag_id)
VALUES
  (1001, 1), (1001, 2), (1001, 3), (1001, 9),
  (1002, 4), (1002, 5), (1002, 13),
  (1003, 6), (1003, 7), (1003, 8), (1003, 9),
  (1004, 9),
  (1005, 6), (1005, 10), (1005, 11),
  (1006, 12),
  (1007, 9), (1007, 13),
  (1008, 1), (1008, 5), (1008, 14), (1008, 9);

UPDATE jobs
SET salary_min = 18000, salary_max = 28000, salary_period = 'month', quality_score = 82, search_text = title
WHERE id = 1001;

UPDATE jobs
SET salary_min = 20000, salary_max = 32000, salary_period = 'month', quality_score = 86, search_text = title
WHERE id = 1002;

UPDATE jobs
SET salary_min = 22000, salary_max = 36000, salary_period = 'month', quality_score = 94, search_text = title
WHERE id = 1003;

UPDATE jobs
SET salary_min = 18000, salary_max = 30000, salary_period = 'month', quality_score = 78, search_text = title
WHERE id = 1004;

UPDATE jobs
SET salary_min = 14000, salary_max = 24000, salary_period = 'month', quality_score = 76, search_text = title
WHERE id = 1005;

UPDATE jobs
SET salary_min = 12000, salary_max = 20000, salary_period = 'month', quality_score = 72, search_text = title
WHERE id = 1006;

UPDATE jobs
SET salary_min = 16000, salary_max = 26000, salary_period = 'month', quality_score = 74, search_text = title
WHERE id = 1007;

UPDATE jobs
SET salary_min = 18000, salary_max = 30000, salary_period = 'month', quality_score = 80, search_text = title
WHERE id = 1008;
