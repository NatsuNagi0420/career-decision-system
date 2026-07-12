-- Clean-install baseline for the legacy Web/backend application.
-- Existing databases are baselined at version 1 and are not rebuilt from this file.

CREATE TABLE users (
    id BIGINT NOT NULL AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL,
    email VARCHAR(100) NULL,
    phone VARCHAR(20) NULL,
    password_hash VARCHAR(120) NOT NULL,
    avatar_url VARCHAR(255) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    deleted TINYINT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_users_username (username),
    UNIQUE KEY uk_users_email (email),
    UNIQUE KEY uk_users_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE user_tokens (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    token_hash CHAR(64) NOT NULL,
    token_prefix VARCHAR(12) NULL,
    token_type VARCHAR(20) NOT NULL DEFAULT 'access',
    expires_at DATETIME NOT NULL,
    revoked_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_user_tokens_hash (token_hash),
    KEY idx_user_tokens_user (user_id, token_type),
    CONSTRAINT fk_user_tokens_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE user_profiles (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    display_name VARCHAR(80) NULL,
    identity_type VARCHAR(40) NULL,
    school VARCHAR(120) NULL,
    major VARCHAR(120) NULL,
    degree VARCHAR(40) NULL,
    target_role VARCHAR(120) NULL,
    target_cities JSON NULL,
    expected_salary VARCHAR(60) NULL,
    skills JSON NULL,
    certificates JSON NULL,
    experiences JSON NULL,
    values_json JSON NULL,
    raw_profile JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_user_profiles_user (user_id),
    CONSTRAINT fk_user_profiles_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE assessment_definitions (
    code VARCHAR(40) NOT NULL,
    name VARCHAR(80) NOT NULL,
    version VARCHAR(20) NOT NULL DEFAULT '1.0',
    description VARCHAR(500) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE assessment_questions (
    id BIGINT NOT NULL AUTO_INCREMENT,
    assessment_code VARCHAR(40) NOT NULL,
    section INT NOT NULL DEFAULT 1,
    question_type VARCHAR(40) NULL,
    content TEXT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_assessment_questions_definition FOREIGN KEY (assessment_code)
        REFERENCES assessment_definitions (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE assessment_options (
    id BIGINT NOT NULL AUTO_INCREMENT,
    question_id BIGINT NOT NULL,
    option_code VARCHAR(10) NOT NULL,
    content VARCHAR(500) NOT NULL,
    score_dimension VARCHAR(20) NULL,
    score_value INT NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    CONSTRAINT fk_assessment_options_question FOREIGN KEY (question_id)
        REFERENCES assessment_questions (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE mbti_dimensions (
    id TINYINT NOT NULL,
    dim_code VARCHAR(10) NOT NULL,
    dim_name VARCHAR(20) NOT NULL,
    code_a CHAR(1) NOT NULL,
    name_a VARCHAR(20) NOT NULL,
    code_b CHAR(1) NOT NULL,
    name_b VARCHAR(20) NOT NULL,
    tie_rule CHAR(1) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_mbti_dimensions_code (dim_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE mbti_personalities (
    type_code CHAR(4) NOT NULL,
    type_name VARCHAR(40) NOT NULL,
    description TEXT NOT NULL,
    careers TEXT NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (type_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE assessment_sessions (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    assessment_code VARCHAR(40) NOT NULL,
    test_no VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'submitted',
    result_code VARCHAR(40) NULL,
    score_json JSON NULL,
    result_json JSON NULL,
    submitted_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_assessment_sessions_test_no (test_no),
    CONSTRAINT fk_assessment_sessions_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_assessment_sessions_definition FOREIGN KEY (assessment_code)
        REFERENCES assessment_definitions (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE assessment_answers (
    id BIGINT NOT NULL AUTO_INCREMENT,
    session_id BIGINT NOT NULL,
    question_id BIGINT NOT NULL,
    option_code VARCHAR(10) NOT NULL,
    score_dimension VARCHAR(20) NULL,
    score_value INT NOT NULL DEFAULT 1,
    answered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_assessment_answers_session FOREIGN KEY (session_id)
        REFERENCES assessment_sessions (id) ON DELETE CASCADE,
    CONSTRAINT fk_assessment_answers_question FOREIGN KEY (question_id)
        REFERENCES assessment_questions (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE jobs (
    id BIGINT NOT NULL AUTO_INCREMENT,
    import_batch_id BIGINT NULL,
    raw_record_id BIGINT NULL,
    source_job_code VARCHAR(80) NULL,
    source_platform VARCHAR(40) NULL,
    title VARCHAR(160) NOT NULL,
    company VARCHAR(200) NOT NULL,
    city VARCHAR(80) NULL,
    city_district VARCHAR(80) NULL,
    location_text VARCHAR(160) NULL,
    direction VARCHAR(80) NULL,
    industry VARCHAR(200) NULL,
    company_size VARCHAR(60) NULL,
    financing_stage VARCHAR(60) NULL,
    salary_min INT NULL,
    salary_max INT NULL,
    salary_text VARCHAR(80) NULL,
    salary_period VARCHAR(20) NULL,
    salary_months TINYINT NULL,
    experience_level VARCHAR(80) NULL,
    education VARCHAR(80) NULL,
    description TEXT NULL,
    company_description TEXT NULL,
    source_url VARCHAR(800) NULL,
    source_updated_text VARCHAR(80) NULL,
    source_updated_at DATETIME NULL,
    quality_score DOUBLE NOT NULL DEFAULT 0,
    search_text TEXT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_jobs_status_direction (status, direction),
    KEY idx_jobs_status_city (status, city)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE job_tags (
    id BIGINT NOT NULL AUTO_INCREMENT,
    name VARCHAR(80) NOT NULL,
    type VARCHAR(40) NOT NULL DEFAULT 'skill',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE job_tag_rel (
    job_id BIGINT NOT NULL,
    tag_id BIGINT NOT NULL,
    PRIMARY KEY (job_id, tag_id),
    CONSTRAINT fk_job_tag_rel_job FOREIGN KEY (job_id) REFERENCES jobs (id) ON DELETE CASCADE,
    CONSTRAINT fk_job_tag_rel_tag FOREIGN KEY (tag_id) REFERENCES job_tags (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE job_favorites (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    job_id BIGINT NOT NULL,
    note VARCHAR(500) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_job_favorites_user_job (user_id, job_id),
    CONSTRAINT fk_job_favorites_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_job_favorites_job FOREIGN KEY (job_id) REFERENCES jobs (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE job_targets (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    job_id BIGINT NOT NULL,
    note VARCHAR(500) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_job_targets_user_job (user_id, job_id),
    CONSTRAINT fk_job_targets_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_job_targets_job FOREIGN KEY (job_id) REFERENCES jobs (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE agent_runs (
    id BIGINT NOT NULL AUTO_INCREMENT,
    request_id VARCHAR(80) NOT NULL,
    user_id BIGINT NULL,
    agent_type VARCHAR(60) NOT NULL,
    model_name VARCHAR(80) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'success',
    input_json JSON NULL,
    output_json JSON NULL,
    error_message TEXT NULL,
    latency_ms INT NULL,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_agent_runs_request (request_id),
    CONSTRAINT fk_agent_runs_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE path_plans (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    agent_run_id BIGINT NULL,
    target_role VARCHAR(120) NOT NULL,
    overview TEXT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    start_date DATE NULL,
    end_date DATE NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_path_plans_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_path_plans_agent_run FOREIGN KEY (agent_run_id) REFERENCES agent_runs (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE path_plan_milestones (
    id BIGINT NOT NULL AUTO_INCREMENT,
    plan_id BIGINT NOT NULL,
    title VARCHAR(160) NOT NULL,
    duration VARCHAR(80) NULL,
    sort_order INT NOT NULL DEFAULT 0,
    acceptance_json JSON NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_path_plan_milestones_plan FOREIGN KEY (plan_id)
        REFERENCES path_plans (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE path_plan_tasks (
    id BIGINT NOT NULL AUTO_INCREMENT,
    milestone_id BIGINT NOT NULL,
    content VARCHAR(500) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'todo',
    due_date DATE NULL,
    completed_at DATETIME NULL,
    sort_order INT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    CONSTRAINT fk_path_plan_tasks_milestone FOREIGN KEY (milestone_id)
        REFERENCES path_plan_milestones (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE resumes (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    file_name VARCHAR(255) NULL,
    content_hash CHAR(64) NULL,
    resume_text TEXT NULL,
    parsed_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_resumes_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE resume_analyses (
    id BIGINT NOT NULL AUTO_INCREMENT,
    resume_id BIGINT NULL,
    user_id BIGINT NOT NULL,
    agent_run_id BIGINT NULL,
    target_role VARCHAR(120) NULL,
    score INT NULL,
    ats_score INT NULL,
    keyword_match INT NULL,
    issues_json JSON NULL,
    suggestions_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_resume_analyses_resume FOREIGN KEY (resume_id) REFERENCES resumes (id),
    CONSTRAINT fk_resume_analyses_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_resume_analyses_agent_run FOREIGN KEY (agent_run_id) REFERENCES agent_runs (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE reports (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    agent_run_id BIGINT NULL,
    type VARCHAR(40) NOT NULL,
    title VARCHAR(255) NOT NULL,
    summary TEXT NULL,
    content_json JSON NULL,
    confidence DECIMAL(5,4) NULL,
    deleted TINYINT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_reports_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_reports_agent_run FOREIGN KEY (agent_run_id) REFERENCES agent_runs (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
