DROP TABLE IF EXISTS reports;
DROP TABLE IF EXISTS resume_analyses;
DROP TABLE IF EXISTS resumes;
DROP TABLE IF EXISTS path_plan_tasks;
DROP TABLE IF EXISTS path_plan_milestones;
DROP TABLE IF EXISTS path_plans;
DROP TABLE IF EXISTS agent_runs;
DROP TABLE IF EXISTS job_targets;
DROP TABLE IF EXISTS job_favorites;
DROP TABLE IF EXISTS job_tag_rel;
DROP TABLE IF EXISTS job_tags;
DROP TABLE IF EXISTS jobs;
DROP TABLE IF EXISTS assessment_answers;
DROP TABLE IF EXISTS assessment_sessions;
DROP TABLE IF EXISTS mbti_personalities;
DROP TABLE IF EXISTS mbti_dimensions;
DROP TABLE IF EXISTS assessment_options;
DROP TABLE IF EXISTS assessment_questions;
DROP TABLE IF EXISTS assessment_definitions;
DROP TABLE IF EXISTS user_profiles;
DROP TABLE IF EXISTS user_tokens;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(100) NULL UNIQUE,
  phone VARCHAR(20) NULL UNIQUE,
  password_hash VARCHAR(120) NOT NULL,
  avatar_url VARCHAR(255) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  deleted TINYINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_tokens (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  token_prefix VARCHAR(12) NULL,
  token_type VARCHAR(20) NOT NULL DEFAULT 'access',
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_profiles (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE,
  display_name VARCHAR(80) NULL,
  identity_type VARCHAR(40) NULL,
  school VARCHAR(120) NULL,
  major VARCHAR(120) NULL,
  degree VARCHAR(40) NULL,
  target_role VARCHAR(120) NULL,
  target_cities CLOB NULL,
  expected_salary VARCHAR(60) NULL,
  skills CLOB NULL,
  certificates CLOB NULL,
  experiences CLOB NULL,
  values_json CLOB NULL,
  raw_profile CLOB NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE assessment_definitions (
  code VARCHAR(40) PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  version VARCHAR(20) NOT NULL DEFAULT '1.0',
  description VARCHAR(500) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE assessment_questions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  assessment_code VARCHAR(40) NOT NULL,
  section INT NOT NULL DEFAULT 1,
  question_type VARCHAR(40) NULL,
  content CLOB NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE assessment_options (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  question_id BIGINT NOT NULL,
  option_code VARCHAR(10) NOT NULL,
  content VARCHAR(500) NOT NULL,
  score_dimension VARCHAR(20) NULL,
  score_value INT NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE mbti_dimensions (
  id TINYINT PRIMARY KEY,
  dim_code VARCHAR(10) NOT NULL,
  dim_name VARCHAR(20) NOT NULL,
  code_a CHAR(1) NOT NULL,
  name_a VARCHAR(20) NOT NULL,
  code_b CHAR(1) NOT NULL,
  name_b VARCHAR(20) NOT NULL,
  tie_rule CHAR(1) NOT NULL
);

CREATE TABLE mbti_personalities (
  type_code CHAR(4) PRIMARY KEY,
  type_name VARCHAR(40) NOT NULL,
  description CLOB NOT NULL,
  careers CLOB NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE assessment_sessions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  assessment_code VARCHAR(40) NOT NULL,
  test_no VARCHAR(64) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'submitted',
  result_code VARCHAR(40) NULL,
  score_json CLOB NULL,
  result_json CLOB NULL,
  submitted_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE assessment_answers (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_id BIGINT NOT NULL,
  question_id BIGINT NOT NULL,
  option_code VARCHAR(10) NOT NULL,
  score_dimension VARCHAR(20) NULL,
  score_value INT NOT NULL DEFAULT 1,
  answered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE jobs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
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
  description CLOB NULL,
  company_description CLOB NULL,
  source_url VARCHAR(800) NULL,
  source_updated_text VARCHAR(80) NULL,
  source_updated_at TIMESTAMP NULL,
  quality_score DOUBLE NOT NULL DEFAULT 0,
  search_text CLOB NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE job_tags (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  type VARCHAR(40) NOT NULL DEFAULT 'skill',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE job_tag_rel (
  job_id BIGINT NOT NULL,
  tag_id BIGINT NOT NULL,
  PRIMARY KEY (job_id, tag_id)
);

CREATE TABLE job_favorites (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  job_id BIGINT NOT NULL,
  note VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_job_favorites_user_job UNIQUE (user_id, job_id)
);

CREATE TABLE job_targets (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  job_id BIGINT NOT NULL,
  note VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_job_targets_user_job UNIQUE (user_id, job_id)
);

CREATE TABLE agent_runs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  request_id VARCHAR(80) NOT NULL UNIQUE,
  user_id BIGINT NULL,
  agent_type VARCHAR(60) NOT NULL,
  model_name VARCHAR(80) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'success',
  input_json CLOB NULL,
  output_json CLOB NULL,
  error_message CLOB NULL,
  latency_ms INT NULL,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP NULL
);

CREATE TABLE path_plans (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  agent_run_id BIGINT NULL,
  target_role VARCHAR(120) NOT NULL,
  overview CLOB NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  start_date DATE NULL,
  end_date DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE path_plan_milestones (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  plan_id BIGINT NOT NULL,
  title VARCHAR(160) NOT NULL,
  duration VARCHAR(80) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  acceptance_json CLOB NULL
);

CREATE TABLE path_plan_tasks (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  milestone_id BIGINT NOT NULL,
  content VARCHAR(500) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'todo',
  due_date DATE NULL,
  completed_at TIMESTAMP NULL,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE resumes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  file_name VARCHAR(255) NULL,
  content_hash CHAR(64) NULL,
  resume_text CLOB NULL,
  parsed_json CLOB NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE resume_analyses (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  resume_id BIGINT NULL,
  user_id BIGINT NOT NULL,
  agent_run_id BIGINT NULL,
  target_role VARCHAR(120) NULL,
  score INT NULL,
  ats_score INT NULL,
  keyword_match INT NULL,
  issues_json CLOB NULL,
  suggestions_json CLOB NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE reports (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  agent_run_id BIGINT NULL,
  type VARCHAR(40) NOT NULL,
  title VARCHAR(255) NOT NULL,
  summary CLOB NULL,
  content_json CLOB NULL,
  confidence DECIMAL(5,4) NULL,
  deleted TINYINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
