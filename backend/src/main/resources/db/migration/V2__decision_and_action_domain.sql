-- V1 -> V2: career decision projects and the action/review loop.
-- Legacy users, reports and path plans remain in place and are not converted.

ALTER TABLE user_profiles
    ADD COLUMN grade VARCHAR(40) NULL AFTER degree,
    ADD COLUMN graduation_date DATE NULL AFTER grade,
    ADD COLUMN city VARCHAR(80) NULL AFTER graduation_date,
    ADD COLUMN current_confusion VARCHAR(500) NULL AFTER expected_salary,
    ADD COLUMN existing_directions_json JSON NULL AFTER current_confusion,
    ADD COLUMN weekly_available_minutes INT NULL AFTER existing_directions_json,
    ADD COLUMN onboarding_completed_at DATETIME NULL AFTER weekly_available_minutes,
    ADD COLUMN profile_version INT NOT NULL DEFAULT 1 AFTER onboarding_completed_at;

CREATE TABLE career_directions (
    id BIGINT NOT NULL AUTO_INCREMENT,
    owner_user_id BIGINT NULL,
    code VARCHAR(60) NULL,
    name VARCHAR(120) NOT NULL,
    category VARCHAR(80) NOT NULL,
    summary VARCHAR(800) NOT NULL,
    typical_work_json JSON NULL,
    common_skills_json JSON NULL,
    growth_path_json JSON NULL,
    misconceptions_json JSON NULL,
    major_tags_json JSON NULL,
    industry_tags_json JSON NULL,
    work_types_json JSON NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_career_directions_code (code),
    KEY idx_career_directions_catalog (owner_user_id, status, sort_order),
    CONSTRAINT fk_career_directions_owner FOREIGN KEY (owner_user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE career_direction_favorites (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    direction_id BIGINT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_direction_favorites_user_direction (user_id, direction_id),
    CONSTRAINT fk_direction_favorites_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_direction_favorites_direction FOREIGN KEY (direction_id)
        REFERENCES career_directions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE personal_evidence (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    evidence_type VARCHAR(40) NOT NULL,
    title VARCHAR(160) NOT NULL,
    description TEXT NULL,
    source_type VARCHAR(40) NOT NULL DEFAULT 'user',
    source_ref_type VARCHAR(40) NULL,
    source_ref_id BIGINT NULL,
    credibility VARCHAR(20) NOT NULL DEFAULT 'medium',
    visibility VARCHAR(20) NOT NULL DEFAULT 'visible',
    occurred_at DATE NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_personal_evidence_user (user_id, visibility, evidence_type),
    CONSTRAINT fk_personal_evidence_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE decision_projects (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    title VARCHAR(160) NOT NULL,
    question VARCHAR(500) NOT NULL,
    decision_deadline DATE NULL,
    background TEXT NULL,
    trigger_reason TEXT NULL,
    priorities_json JSON NULL,
    must_haves_json JSON NULL,
    deal_breakers_json JSON NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'clarifying',
    current_stage VARCHAR(30) NOT NULL DEFAULT 'clarify',
    is_current TINYINT NOT NULL DEFAULT 1,
    decided_at DATETIME NULL,
    archived_at DATETIME NULL,
    version INT NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_decision_projects_user (user_id, is_current, status, updated_at),
    CONSTRAINT fk_decision_projects_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE decision_candidates (
    id BIGINT NOT NULL AUTO_INCREMENT,
    project_id BIGINT NOT NULL,
    direction_id BIGINT NULL,
    name VARCHAR(120) NOT NULL,
    source_type VARCHAR(20) NOT NULL DEFAULT 'user',
    recommendation_reason TEXT NULL,
    opposing_factors TEXT NULL,
    uncertainties TEXT NULL,
    validation_actions_json JSON NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_decision_candidates_project_name (project_id, name),
    KEY idx_decision_candidates_project (project_id, status, sort_order),
    CONSTRAINT fk_decision_candidates_project FOREIGN KEY (project_id)
        REFERENCES decision_projects (id) ON DELETE CASCADE,
    CONSTRAINT fk_decision_candidates_direction FOREIGN KEY (direction_id)
        REFERENCES career_directions (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE decision_project_job_samples (
    id BIGINT NOT NULL AUTO_INCREMENT,
    project_id BIGINT NOT NULL,
    candidate_id BIGINT NOT NULL,
    job_id BIGINT NOT NULL,
    note VARCHAR(500) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_project_job_samples_project_job (project_id, job_id),
    KEY idx_project_job_samples_candidate (candidate_id),
    CONSTRAINT fk_project_job_samples_project FOREIGN KEY (project_id)
        REFERENCES decision_projects (id) ON DELETE CASCADE,
    CONSTRAINT fk_project_job_samples_candidate FOREIGN KEY (candidate_id)
        REFERENCES decision_candidates (id) ON DELETE CASCADE,
    CONSTRAINT fk_project_job_samples_job FOREIGN KEY (job_id) REFERENCES jobs (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE decision_evidence (
    id BIGINT NOT NULL AUTO_INCREMENT,
    project_id BIGINT NOT NULL,
    candidate_id BIGINT NULL,
    personal_evidence_id BIGINT NULL,
    title VARCHAR(160) NOT NULL,
    detail TEXT NULL,
    source_type VARCHAR(40) NOT NULL DEFAULT 'user',
    source_ref VARCHAR(160) NULL,
    credibility VARCHAR(20) NOT NULL DEFAULT 'medium',
    stance VARCHAR(20) NOT NULL DEFAULT 'neutral',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_decision_evidence_project (project_id, status),
    CONSTRAINT fk_decision_evidence_project FOREIGN KEY (project_id)
        REFERENCES decision_projects (id) ON DELETE CASCADE,
    CONSTRAINT fk_decision_evidence_candidate FOREIGN KEY (candidate_id)
        REFERENCES decision_candidates (id) ON DELETE CASCADE,
    CONSTRAINT fk_decision_evidence_personal FOREIGN KEY (personal_evidence_id)
        REFERENCES personal_evidence (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE comparison_criteria (
    id BIGINT NOT NULL AUTO_INCREMENT,
    project_id BIGINT NOT NULL,
    code VARCHAR(40) NOT NULL,
    name VARCHAR(80) NOT NULL,
    description VARCHAR(500) NULL,
    importance TINYINT NOT NULL DEFAULT 3,
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_comparison_criteria_project_code (project_id, code),
    CONSTRAINT fk_comparison_criteria_project FOREIGN KEY (project_id)
        REFERENCES decision_projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE comparison_results (
    id BIGINT NOT NULL AUTO_INCREMENT,
    criterion_id BIGINT NOT NULL,
    candidate_id BIGINT NOT NULL,
    score TINYINT NULL,
    assessment TEXT NULL,
    evidence_refs_json JSON NULL,
    uncertainty TEXT NULL,
    validation_action TEXT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_comparison_results_criterion_candidate (criterion_id, candidate_id),
    CONSTRAINT fk_comparison_results_criterion FOREIGN KEY (criterion_id)
        REFERENCES comparison_criteria (id) ON DELETE CASCADE,
    CONSTRAINT fk_comparison_results_candidate FOREIGN KEY (candidate_id)
        REFERENCES decision_candidates (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE decision_targets (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    project_id BIGINT NOT NULL,
    candidate_id BIGINT NOT NULL,
    target_type VARCHAR(20) NOT NULL,
    target_name VARCHAR(120) NOT NULL,
    decision_reason TEXT NOT NULL,
    main_risks TEXT NULL,
    review_date DATE NULL,
    confirmed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_decision_targets_project_type (project_id, target_type),
    KEY idx_decision_targets_user (user_id, target_type, confirmed_at),
    CONSTRAINT fk_decision_targets_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_decision_targets_project FOREIGN KEY (project_id)
        REFERENCES decision_projects (id) ON DELETE CASCADE,
    CONSTRAINT fk_decision_targets_candidate FOREIGN KEY (candidate_id)
        REFERENCES decision_candidates (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE path_plans
    ADD COLUMN decision_project_id BIGINT NULL AFTER user_id,
    ADD COLUMN decision_target_id BIGINT NULL AFTER decision_project_id,
    ADD COLUMN plan_type VARCHAR(20) NOT NULL DEFAULT 'legacy' AFTER agent_run_id,
    ADD COLUMN duration_weeks TINYINT NULL AFTER plan_type,
    ADD COLUMN generation_request_id VARCHAR(80) NULL AFTER duration_weeks,
    ADD COLUMN version INT NOT NULL DEFAULT 1 AFTER generation_request_id,
    ADD UNIQUE KEY uk_path_plans_generation_request (generation_request_id),
    ADD KEY idx_path_plans_current_action (user_id, plan_type, status, updated_at),
    ADD CONSTRAINT fk_path_plans_decision_project FOREIGN KEY (decision_project_id)
        REFERENCES decision_projects (id),
    ADD CONSTRAINT fk_path_plans_decision_target FOREIGN KEY (decision_target_id)
        REFERENCES decision_targets (id);

ALTER TABLE path_plan_milestones
    ADD COLUMN week_no TINYINT NULL AFTER plan_id,
    ADD COLUMN week_goal VARCHAR(500) NULL AFTER title;

ALTER TABLE path_plan_tasks
    ADD COLUMN week_no TINYINT NULL AFTER milestone_id,
    ADD COLUMN title VARCHAR(200) NULL AFTER week_no,
    ADD COLUMN task_type VARCHAR(40) NULL AFTER title,
    ADD COLUMN due_at DATETIME NULL AFTER due_date,
    ADD COLUMN estimated_minutes INT NULL AFTER due_at,
    ADD COLUMN acceptance_criteria VARCHAR(800) NULL AFTER estimated_minutes,
    ADD COLUMN started_at DATETIME NULL AFTER acceptance_criteria,
    ADD COLUMN deferred_to DATETIME NULL AFTER completed_at,
    ADD COLUMN skip_reason VARCHAR(500) NULL AFTER deferred_to,
    ADD COLUMN deleted TINYINT NOT NULL DEFAULT 0 AFTER skip_reason,
    ADD COLUMN version INT NOT NULL DEFAULT 1 AFTER sort_order,
    ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP AFTER version,
    ADD KEY idx_path_plan_tasks_today (status, due_at, sort_order);

CREATE TABLE task_results (
    id BIGINT NOT NULL AUTO_INCREMENT,
    task_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    description TEXT NOT NULL,
    link_url VARCHAR(1000) NULL,
    verification_status VARCHAR(30) NOT NULL DEFAULT 'unverified',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_task_results_task (task_id, created_at),
    CONSTRAINT fk_task_results_task FOREIGN KEY (task_id)
        REFERENCES path_plan_tasks (id) ON DELETE CASCADE,
    CONSTRAINT fk_task_results_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE task_change_history (
    id BIGINT NOT NULL AUTO_INCREMENT,
    task_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    change_type VARCHAR(30) NOT NULL,
    from_status VARCHAR(20) NULL,
    to_status VARCHAR(20) NULL,
    before_json JSON NULL,
    after_json JSON NULL,
    reason VARCHAR(500) NULL,
    request_id VARCHAR(80) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_task_change_history_request (request_id),
    KEY idx_task_change_history_task (task_id, created_at),
    CONSTRAINT fk_task_change_history_task FOREIGN KEY (task_id)
        REFERENCES path_plan_tasks (id),
    CONSTRAINT fk_task_change_history_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE weekly_reviews (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    plan_id BIGINT NOT NULL,
    project_id BIGINT NOT NULL,
    week_no TINYINT NOT NULL,
    completed_summary TEXT NULL,
    evidence_summary TEXT NULL,
    difficulties TEXT NULL,
    next_week_minutes INT NULL,
    confidence_trend VARCHAR(20) NULL,
    confidence_reason TEXT NULL,
    adjustment_proposal_json JSON NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    submitted_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_weekly_reviews_plan_week (plan_id, week_no),
    KEY idx_weekly_reviews_user (user_id, updated_at),
    CONSTRAINT fk_weekly_reviews_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_weekly_reviews_plan FOREIGN KEY (plan_id)
        REFERENCES path_plans (id) ON DELETE CASCADE,
    CONSTRAINT fk_weekly_reviews_project FOREIGN KEY (project_id)
        REFERENCES decision_projects (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE reports
    ADD COLUMN decision_project_id BIGINT NULL AFTER user_id,
    ADD COLUMN snapshot_version INT NULL AFTER content_json,
    ADD COLUMN generation_request_id VARCHAR(80) NULL AFTER snapshot_version,
    ADD UNIQUE KEY uk_reports_generation_request (generation_request_id),
    ADD KEY idx_reports_decision_project (decision_project_id, snapshot_version),
    ADD CONSTRAINT fk_reports_decision_project FOREIGN KEY (decision_project_id)
        REFERENCES decision_projects (id);

INSERT INTO career_directions
    (code, name, category, summary, typical_work_json, common_skills_json,
     growth_path_json, misconceptions_json, major_tags_json, industry_tags_json,
     work_types_json, sort_order)
VALUES
('backend', '后端开发', '技术研发', '设计和实现服务端业务、接口、数据与稳定性能力。', '["开发业务接口","设计数据模型","排查性能与稳定性问题"]', '["编程基础","数据库","网络与系统设计"]', '["初级工程师","后端工程师","高级工程师/架构方向"]', '["只会写接口就足够","框架熟练等于基础扎实"]', '["计算机","软件工程","信息类"]', '["互联网","企业服务","金融科技"]', '["工程","协作","深度工作"]', 10),
('frontend', '前端开发', '技术研发', '构建浏览器端产品界面、交互体验与工程体系。', '["实现交互页面","管理前端状态","优化性能和可访问性"]', '["JavaScript/TypeScript","浏览器基础","交互实现"]', '["初级工程师","前端工程师","高级工程师/体验技术"]', '["前端只是切图","会框架就不需要理解浏览器"]', '["计算机","设计","信息类"]', '["互联网","企业服务","数字内容"]', '["工程","创作","协作"]', 20),
('mobile', '移动端开发', '技术研发', '面向 Android、iOS 或跨端平台构建移动应用。', '["开发移动功能","处理设备能力","优化性能与发布质量"]', '["移动平台基础","客户端架构","网络与存储"]', '["客户端工程师","高级工程师","移动架构/技术负责人"]', '["跨端可以替代所有原生能力","只需适配一种设备"]', '["计算机","软件工程","信息类"]', '["互联网","智能硬件","生活服务"]', '["工程","产品协作","设备实践"]', 30),
('data-analysis', '数据分析', '数据与算法', '通过数据清洗、分析和表达支持业务判断与改进。', '["定义指标","分析业务问题","制作报告与提出建议"]', '["SQL","统计基础","数据表达","业务理解"]', '["数据分析师","高级分析师","分析负责人/数据产品"]', '["会做图表就是数据分析","模型越复杂结论越好"]', '["统计","数学","经管","信息类"]', '["互联网","零售","金融","咨询"]', '["分析","沟通","业务协作"]', 40),
('data-engineering', '数据工程', '数据与算法', '建设可靠的数据采集、处理、存储和服务链路。', '["开发数据管道","治理数据质量","维护数据平台"]', '["SQL","分布式系统","数据建模","工程能力"]', '["数据开发工程师","数据平台工程师","数据架构"]', '["数据工程等于写 SQL","只关心吞吐无需理解业务"]', '["计算机","软件工程","大数据"]', '["互联网","金融","制造","企业服务"]', '["工程","平台建设","稳定性"]', 50),
('ai-algorithm', 'AI 与算法', '数据与算法', '使用机器学习、深度学习或优化方法解决可量化问题。', '["构建训练数据","训练评估模型","推动模型落地"]', '["数学统计","机器学习","编程","实验设计"]', '["算法工程师","高级算法工程师","算法负责人/研究方向"]', '["调包等于算法能力","离线指标高就一定有业务价值"]', '["计算机","人工智能","数学","自动化"]', '["互联网","智能制造","医疗科技","金融科技"]', '["研究","实验","工程落地"]', 60),
('ai-application', 'AI 应用开发', '数据与算法', '把大模型等 AI 能力组合为可用、可评估的产品功能。', '["设计 AI 工作流","接入模型与工具","评估质量和成本"]', '["软件工程","提示与上下文设计","评测","产品理解"]', '["AI 应用工程师","高级工程师","AI 产品技术负责人"]', '["只写提示词即可","模型效果无需系统评测"]', '["计算机","软件工程","人工智能","跨专业"]', '["企业服务","教育科技","内容与效率工具"]', '["工程","实验","产品协作"]', 70),
('testing-quality', '测试与质量工程', '技术研发', '通过自动化、流程和风险分析保障软件质量。', '["设计测试策略","开发自动化测试","定位质量风险"]', '["测试设计","编程自动化","系统思维","沟通"]', '["测试工程师","质量工程师","测试架构/质量负责人"]', '["测试只是点点页面","质量只由测试人员负责"]', '["计算机","软件工程","信息类"]', '["互联网","软件服务","智能硬件"]', '["工程","分析","跨团队协作"]', 80),
('devops-security', '运维、云与安全', '技术研发', '保障系统交付、运行、安全和故障恢复能力。', '["建设交付流水线","监控与处置故障","实施安全控制"]', '["操作系统","网络","自动化","安全意识"]', '["运维/云工程师","SRE/安全工程师","平台或安全负责人"]', '["运维只是重启服务","安全是上线后的附加项"]', '["计算机","网络工程","信息安全"]', '["云计算","金融","政企","互联网"]', '["稳定性","自动化","应急响应"]', 90),
('product-management', '产品经理', '产品与设计', '识别用户问题，协调团队把解决方案持续交付并验证。', '["用户研究","定义需求","推动交付与复盘指标"]', '["问题定义","沟通协作","数据意识","产品判断"]', '["产品助理","产品经理","高级产品/产品负责人"]', '["产品经理只写文档","想法多就适合做产品"]', '["专业不限","经管","设计","计算机"]', '["互联网","企业服务","消费品","智能硬件"]', '["沟通","决策","跨团队推动"]', 100),
('ux-design', '用户体验与交互设计', '产品与设计', '研究用户并设计清晰、有效且一致的产品体验。', '["开展用户研究","设计信息架构与交互","验证原型"]', '["用户研究","交互设计","视觉表达","协作"]', '["设计助理","交互/体验设计师","高级设计师/设计负责人"]', '["设计只负责美化","工具熟练等于设计能力"]', '["设计","心理","工业设计","计算机"]', '["互联网","智能硬件","企业服务"]', '["创作","研究","产品协作"]', 110),
('operations-growth', '运营与增长', '市场与运营', '围绕用户、内容、活动或产品机制推动业务持续增长。', '["设计运营活动","分析用户行为","迭代增长策略"]', '["用户洞察","内容与活动","数据分析","执行力"]', '["运营专员","运营经理","增长/运营负责人"]', '["运营就是发内容","增长只看短期流量"]', '["专业不限","经管","传播","中文"]', '["互联网","消费品","教育","本地生活"]', '["执行","沟通","快速迭代"]', 120),
('marketing-brand', '市场与品牌', '市场与运营', '理解市场与受众，建立品牌认知并支持商业增长。', '["市场研究","策划传播","评估品牌与投放效果"]', '["消费者洞察","内容策略","项目管理","数据意识"]', '["市场专员","品牌/市场经理","市场负责人"]', '["市场就是投广告","创意可以脱离商业目标"]', '["市场营销","传播","经管","专业不限"]', '["消费品","互联网","文娱","汽车"]', '["创意","沟通","商业协作"]', 130),
('sales-bd', '销售与商务拓展', '商业与服务', '发现客户需求，建立信任并推动交易或合作落地。', '["开发客户","理解需求并提供方案","推进谈判与回款"]', '["沟通影响","客户洞察","谈判","目标管理"]', '["销售/BD","大客户经理","销售负责人"]', '["销售只靠外向","签单后无需关注交付"]', '["专业不限","经管","工科"]', '["企业服务","制造","金融","消费品"]', '["沟通","目标驱动","外部协作"]', 140),
('customer-success', '客户成功与服务', '商业与服务', '帮助客户获得产品价值，提升留存、满意度与长期合作。', '["客户启用与培训","跟踪使用效果","协调解决问题"]', '["沟通服务","产品理解","问题解决","数据意识"]', '["客户成功专员","客户成功经理","客户成功负责人"]', '["客户成功等于客服","只要客户满意无需关注价值结果"]', '["专业不限","经管","外语"]', '["企业服务","教育","金融","软件服务"]', '["服务","沟通","持续跟进"]', 150),
('finance-accounting', '财务与会计', '职能与专业服务', '记录和分析组织经营活动，支持合规、控制与决策。', '["核算与报表","预算分析","风险和流程控制"]', '["会计基础","Excel/数据","严谨性","业务理解"]', '["财务/会计专员","财务分析/主管","财务负责人"]', '["财务只做报销记账","考证可以替代实务经验"]', '["会计","财务管理","经济学"]', '["全行业","会计师事务所","金融"]', '["分析","规范","业务协作"]', 160),
('hr', '人力资源', '职能与专业服务', '围绕人才吸引、发展、激励和组织运行提供支持。', '["招聘与配置","培训和绩效支持","员工与组织分析"]', '["沟通判断","劳动法规","数据意识","项目执行"]', '["HR 专员","HRBP/模块经理","人力资源负责人"]', '["HR 只是招人和办手续","擅长聊天就足够"]', '["人力资源","心理","经管","专业不限"]', '["全行业","咨询","人力资源服务"]', '["沟通","服务","组织协作"]', 170),
('legal-compliance', '法律与合规', '职能与专业服务', '识别法律风险、处理规则与合同并支持合规经营。', '["法律研究","合同审查","合规与争议支持"]', '["法律检索","逻辑分析","写作","风险意识"]', '["法务/律师助理","律师/合规经理","专业负责人"]', '["背法条就能胜任","法律结论可以脱离业务场景"]', '["法学"]', '["律所","金融","互联网","制造"]', '["研究","写作","专业判断"]', 180),
('consulting-research', '咨询与行业研究', '研究与咨询', '结构化分析复杂问题，为组织提供判断和落地建议。', '["收集研究信息","建立分析框架","汇报建议并支持实施"]', '["结构化思考","研究","数据分析","表达"]', '["分析师/顾问","项目经理","咨询或研究负责人"]', '["咨询只做 PPT","聪明可以替代行业积累"]', '["专业不限","经管","理工科"]', '["咨询","金融","产业研究","企业战略"]', '["研究","高强度协作","表达"]', 190),
('education-training', '教育与培训', '教育与公共服务', '设计和实施学习体验，帮助学习者获得可验证的成长。', '["课程设计与授课","学习支持","评估和改进效果"]', '["教学设计","表达引导","专业知识","同理心"]', '["教师/培训助理","课程或培训负责人","教研/教育产品"]', '["会知识就会教","学习效果只由学生负责"]', '["教育学","师范","各学科专业"]', '["学校","职业教育","企业培训","教育科技"]', '["教学","沟通","内容设计"]', 200),
('media-content', '内容、媒体与编辑', '内容与创意', '策划、制作和分发有信息价值或传播价值的内容。', '["选题研究","内容创作与编辑","分析传播反馈"]', '["写作表达","信息判断","内容策划","平台理解"]', '["编辑/内容专员","内容主编/策划","内容负责人"]', '["有文采就够了","流量可以替代内容价值"]', '["中文","新闻传播","专业不限"]', '["媒体","互联网","品牌","出版"]', '["创作","研究","快速反馈"]', 210),
('industrial-engineering', '制造与工业工程', '工程与制造', '改善生产系统、质量、流程和资源效率。', '["分析生产流程","推进精益改善","协调质量与交付"]', '["工程基础","流程分析","质量工具","现场沟通"]', '["工业/工艺工程师","高级工程师","制造/运营负责人"]', '["制造业只有流水线工作","工业工程只做时间测量"]', '["工业工程","机械","自动化","材料"]', '["制造","汽车","新能源","电子"]', '["现场实践","工程","流程改善"]', 220),
('hardware-electronics', '硬件与电子研发', '工程与制造', '设计、验证和迭代电子、嵌入式或硬件系统。', '["电路或嵌入式设计","样机调试","可靠性验证"]', '["电子基础","嵌入式开发","调试测量","工程规范"]', '["硬件/嵌入式工程师","高级工程师","系统或研发负责人"]', '["硬件开发只需画板","一次样机成功才算能力强"]', '["电子信息","自动化","通信","计算机"]', '["智能硬件","汽车","半导体","工业设备"]', '["工程","实验室实践","跨专业协作"]', 230),
('biomedical-health', '生物医药与健康', '科学与健康', '在生命科学、医药研发、临床或健康服务中解决专业问题。', '["实验或临床支持","分析专业数据","遵循质量与伦理规范"]', '["生命科学基础","实验/临床规范","数据记录","严谨性"]', '["研究/临床/医药专员","专业骨干","项目或专业负责人"]', '["行业只需要高学历科研岗","实验结果可以忽略过程记录"]', '["生物","医学","药学","化学"]', '["医药","医疗器械","医院","科研机构"]', '["研究","规范","长期积累"]', 240),
('public-service', '公共服务与社会工作', '教育与公共服务', '面向公共事务、社会群体或社区提供管理和专业服务。', '["开展需求调研","组织公共项目","提供个案或社区支持"]', '["政策理解","沟通协调","项目执行","同理心"]', '["项目/社工专员","项目主管","公共服务管理方向"]', '["公共服务没有专业门槛","有热情就无需边界和方法"]', '["公共管理","社会学","社会工作","专业不限"]', '["政府与事业单位","公益组织","社区服务"]', '["服务","协调","长期影响"]', 250);
