DROP TABLE IF EXISTS task_change_history;
DROP TABLE IF EXISTS task_results;
DROP TABLE IF EXISTS weekly_reviews;
DROP TABLE IF EXISTS target_confidence_feedback;
DROP TABLE IF EXISTS reports;
DROP TABLE IF EXISTS resume_analyses;
DROP TABLE IF EXISTS resumes;
DROP TABLE IF EXISTS path_plan_tasks;
DROP TABLE IF EXISTS path_plan_milestones;
DROP TABLE IF EXISTS path_plans;
DROP TABLE IF EXISTS decision_targets;
DROP TABLE IF EXISTS comparison_results;
DROP TABLE IF EXISTS comparison_criteria;
DROP TABLE IF EXISTS decision_evidence;
DROP TABLE IF EXISTS decision_project_job_samples;
DROP TABLE IF EXISTS decision_candidates;
DROP TABLE IF EXISTS decision_projects;
DROP TABLE IF EXISTS personal_evidence;
DROP TABLE IF EXISTS career_direction_mapping_runs;
DROP TABLE IF EXISTS career_direction_job_rel;
DROP TABLE IF EXISTS career_direction_favorites;
DROP TABLE IF EXISTS career_directions;
DROP TABLE IF EXISTS chat_messages;
DROP TABLE IF EXISTS chat_sessions;
DROP TABLE IF EXISTS agent_runs;
DROP TABLE IF EXISTS job_targets;
DROP TABLE IF EXISTS job_favorites;
DROP TABLE IF EXISTS job_requirement_items;
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
  grade VARCHAR(40) NULL,
  graduation_date DATE NULL,
  city VARCHAR(80) NULL,
  target_role VARCHAR(120) NULL,
  target_cities CLOB NULL,
  expected_salary VARCHAR(60) NULL,
  preferred_industries_json CLOB NULL,
  preferred_work_modes_json CLOB NULL,
  constraints_json CLOB NULL,
  current_confusion VARCHAR(500) NULL,
  existing_directions_json CLOB NULL,
  weekly_available_minutes INT NULL,
  onboarding_completed_at TIMESTAMP NULL,
  external_ai_consent_at TIMESTAMP NULL,
  profile_version INT NOT NULL DEFAULT 1,
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

CREATE TABLE job_requirement_items (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  job_id BIGINT NOT NULL,
  item_type VARCHAR(40) NOT NULL,
  original_text VARCHAR(1000) NOT NULL,
  normalized_key VARCHAR(255) NOT NULL,
  confidence DECIMAL(5,4) NOT NULL DEFAULT 0.8000,
  extraction_method VARCHAR(30) NOT NULL DEFAULT 'rule',
  extractor_version VARCHAR(40) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_job_requirement_item UNIQUE (job_id, item_type, normalized_key),
  CONSTRAINT fk_job_requirement_items_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
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

CREATE TABLE chat_sessions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  title VARCHAR(160) NOT NULL,
  last_page VARCHAR(120) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_chat_sessions_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE chat_messages (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  request_id VARCHAR(80) NULL,
  role VARCHAR(20) NOT NULL,
  content CLOB NOT NULL,
  agent_run_id BIGINT NULL,
  metadata_json CLOB NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_chat_messages_user_request_role UNIQUE (user_id, request_id, role),
  CONSTRAINT fk_chat_messages_session FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_messages_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_chat_messages_agent_run FOREIGN KEY (agent_run_id) REFERENCES agent_runs(id) ON DELETE SET NULL
);

CREATE TABLE career_directions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  owner_user_id BIGINT NULL,
  code VARCHAR(60) NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  category VARCHAR(80) NOT NULL,
  summary VARCHAR(800) NOT NULL,
  typical_work_json CLOB NULL,
  common_skills_json CLOB NULL,
  growth_path_json CLOB NULL,
  misconceptions_json CLOB NULL,
  major_tags_json CLOB NULL,
  industry_tags_json CLOB NULL,
  work_types_json CLOB NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE career_direction_favorites (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  direction_id BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_direction_favorites_user_direction UNIQUE (user_id, direction_id),
  CONSTRAINT fk_direction_favorites_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_direction_favorites_direction FOREIGN KEY (direction_id) REFERENCES career_directions(id) ON DELETE CASCADE
);

CREATE TABLE career_direction_job_rel (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  direction_id BIGINT NOT NULL,
  job_id BIGINT NOT NULL,
  match_score DECIMAL(5,2) NOT NULL,
  match_source VARCHAR(30) NOT NULL DEFAULT 'rule',
  rule_version VARCHAR(40) NOT NULL,
  review_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  match_reasons_json CLOB NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_direction_job_mapping UNIQUE (direction_id, job_id),
  CONSTRAINT fk_direction_job_mapping_direction FOREIGN KEY (direction_id) REFERENCES career_directions(id) ON DELETE CASCADE,
  CONSTRAINT fk_direction_job_mapping_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

CREATE TABLE career_direction_mapping_runs (
  direction_id BIGINT PRIMARY KEY,
  rule_version VARCHAR(40) NOT NULL,
  source_job_count BIGINT NOT NULL,
  source_tag_relation_count BIGINT NOT NULL,
  latest_job_updated_at TIMESTAMP NULL,
  generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_direction_mapping_runs_direction FOREIGN KEY (direction_id) REFERENCES career_directions(id) ON DELETE CASCADE
);

CREATE TABLE personal_evidence (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  evidence_type VARCHAR(40) NOT NULL,
  title VARCHAR(160) NOT NULL,
  description CLOB NULL,
  role_name VARCHAR(160) NULL,
  result_summary CLOB NULL,
  link_url VARCHAR(1000) NULL,
  proficiency VARCHAR(40) NULL,
  last_used_at DATE NULL,
  feedback CLOB NULL,
  source_type VARCHAR(40) NOT NULL DEFAULT 'user',
  source_ref_type VARCHAR(40) NULL,
  source_ref_id BIGINT NULL,
  credibility VARCHAR(20) NOT NULL DEFAULT 'medium',
  visibility VARCHAR(20) NOT NULL DEFAULT 'visible',
  occurred_at DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_personal_evidence_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE decision_projects (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  title VARCHAR(160) NOT NULL,
  question VARCHAR(500) NOT NULL,
  decision_deadline DATE NULL,
  background CLOB NULL,
  trigger_reason CLOB NULL,
  priorities_json CLOB NULL,
  must_haves_json CLOB NULL,
  deal_breakers_json CLOB NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'clarifying',
  current_stage VARCHAR(30) NOT NULL DEFAULT 'clarify',
  is_current TINYINT NOT NULL DEFAULT 1,
  decided_at TIMESTAMP NULL,
  archived_at TIMESTAMP NULL,
  version INT NOT NULL DEFAULT 1,
  flow_version INT NOT NULL DEFAULT 1,
  comparison_reviewed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_decision_projects_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE decision_candidates (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT NOT NULL,
  direction_id BIGINT NULL,
  name VARCHAR(120) NOT NULL,
  source_type VARCHAR(20) NOT NULL DEFAULT 'user',
  recommendation_reason CLOB NULL,
  opposing_factors CLOB NULL,
  uncertainties CLOB NULL,
  validation_actions_json CLOB NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  exclusion_reason CLOB NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_decision_candidates_project_name UNIQUE (project_id, name),
  CONSTRAINT fk_decision_candidates_project FOREIGN KEY (project_id) REFERENCES decision_projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_decision_candidates_direction FOREIGN KEY (direction_id) REFERENCES career_directions(id)
);

CREATE TABLE decision_project_job_samples (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT NOT NULL,
  candidate_id BIGINT NOT NULL,
  job_id BIGINT NOT NULL,
  note VARCHAR(500) NULL,
  reviewed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_project_job_samples_project_job UNIQUE (project_id, job_id),
  CONSTRAINT fk_project_job_samples_project FOREIGN KEY (project_id) REFERENCES decision_projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_job_samples_candidate FOREIGN KEY (candidate_id) REFERENCES decision_candidates(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_job_samples_job FOREIGN KEY (job_id) REFERENCES jobs(id)
);

CREATE TABLE decision_evidence (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT NOT NULL,
  candidate_id BIGINT NULL,
  personal_evidence_id BIGINT NULL,
  title VARCHAR(160) NOT NULL,
  detail CLOB NULL,
  source_type VARCHAR(40) NOT NULL DEFAULT 'user',
  source_ref VARCHAR(160) NULL,
  credibility VARCHAR(20) NOT NULL DEFAULT 'medium',
  stance VARCHAR(20) NOT NULL DEFAULT 'neutral',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_decision_evidence_project FOREIGN KEY (project_id) REFERENCES decision_projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_decision_evidence_candidate FOREIGN KEY (candidate_id) REFERENCES decision_candidates(id) ON DELETE CASCADE,
  CONSTRAINT fk_decision_evidence_personal FOREIGN KEY (personal_evidence_id) REFERENCES personal_evidence(id)
);

CREATE TABLE comparison_criteria (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT NOT NULL,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(160) NOT NULL,
  description VARCHAR(500) NULL,
  criterion_kind VARCHAR(24) NOT NULL DEFAULT 'legacy',
  source_type VARCHAR(24) NOT NULL DEFAULT 'system',
  importance TINYINT NOT NULL DEFAULT 3,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_comparison_criteria_project_code UNIQUE (project_id, code),
  CONSTRAINT fk_comparison_criteria_project FOREIGN KEY (project_id) REFERENCES decision_projects(id) ON DELETE CASCADE
);

CREATE TABLE comparison_results (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  criterion_id BIGINT NOT NULL,
  candidate_id BIGINT NOT NULL,
  score TINYINT NULL,
  verdict VARCHAR(24) NULL,
  assessment CLOB NULL,
  evidence_refs_json CLOB NULL,
  uncertainty CLOB NULL,
  validation_action CLOB NULL,
  confirmed_at TIMESTAMP NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_comparison_results_criterion_candidate UNIQUE (criterion_id, candidate_id),
  CONSTRAINT fk_comparison_results_criterion FOREIGN KEY (criterion_id) REFERENCES comparison_criteria(id) ON DELETE CASCADE,
  CONSTRAINT fk_comparison_results_candidate FOREIGN KEY (candidate_id) REFERENCES decision_candidates(id) ON DELETE CASCADE
);

CREATE TABLE decision_targets (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  project_id BIGINT NOT NULL,
  candidate_id BIGINT NOT NULL,
  target_type VARCHAR(20) NOT NULL,
  target_name VARCHAR(120) NOT NULL,
  decision_reason CLOB NOT NULL,
  main_risks CLOB NULL,
  review_date DATE NULL,
  verification_status VARCHAR(20) NOT NULL DEFAULT 'verified',
  verified_at TIMESTAMP NULL,
  override_reason CLOB NULL,
  confirmed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_decision_targets_project_type UNIQUE (project_id, target_type),
  CONSTRAINT fk_decision_targets_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_decision_targets_project FOREIGN KEY (project_id) REFERENCES decision_projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_decision_targets_candidate FOREIGN KEY (candidate_id) REFERENCES decision_candidates(id)
);

CREATE TABLE path_plans (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  decision_project_id BIGINT NULL,
  decision_target_id BIGINT NULL,
  agent_run_id BIGINT NULL,
  plan_type VARCHAR(20) NOT NULL DEFAULT 'legacy',
  duration_weeks TINYINT NULL,
  generation_request_id VARCHAR(80) NULL UNIQUE,
  version INT NOT NULL DEFAULT 1,
  target_role VARCHAR(120) NOT NULL,
  overview CLOB NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  start_date DATE NULL,
  end_date DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_path_plans_decision_project FOREIGN KEY (decision_project_id) REFERENCES decision_projects(id),
  CONSTRAINT fk_path_plans_decision_target FOREIGN KEY (decision_target_id) REFERENCES decision_targets(id)
);

CREATE TABLE path_plan_milestones (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  plan_id BIGINT NOT NULL,
  week_no TINYINT NULL,
  title VARCHAR(160) NOT NULL,
  week_goal VARCHAR(500) NULL,
  duration VARCHAR(80) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  acceptance_json CLOB NULL
);

CREATE TABLE path_plan_tasks (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  milestone_id BIGINT NOT NULL,
  week_no TINYINT NULL,
  title VARCHAR(200) NULL,
  task_type VARCHAR(40) NULL,
  content VARCHAR(500) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'todo',
  due_date DATE NULL,
  due_at TIMESTAMP NULL,
  estimated_minutes INT NULL,
  acceptance_criteria VARCHAR(800) NULL,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  deferred_to TIMESTAMP NULL,
  skip_reason VARCHAR(500) NULL,
  deleted TINYINT NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0
  ,version INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
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
  decision_project_id BIGINT NULL,
  agent_run_id BIGINT NULL,
  type VARCHAR(40) NOT NULL,
  title VARCHAR(255) NOT NULL,
  summary CLOB NULL,
  content_json CLOB NULL,
  snapshot_version INT NULL,
  generation_request_id VARCHAR(80) NULL UNIQUE,
  confidence DECIMAL(5,4) NULL,
  deleted TINYINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reports_decision_project FOREIGN KEY (decision_project_id) REFERENCES decision_projects(id)
);

CREATE TABLE task_results (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  task_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  request_id VARCHAR(80) NULL,
  description CLOB NOT NULL,
  link_url VARCHAR(1000) NULL,
  verification_status VARCHAR(30) NOT NULL DEFAULT 'unverified',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_task_results_task FOREIGN KEY (task_id) REFERENCES path_plan_tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_task_results_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT uk_task_results_user_request UNIQUE (user_id, request_id)
);

CREATE TABLE task_change_history (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  task_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  change_type VARCHAR(30) NOT NULL,
  from_status VARCHAR(20) NULL,
  to_status VARCHAR(20) NULL,
  before_json CLOB NULL,
  after_json CLOB NULL,
  reason VARCHAR(500) NULL,
  request_id VARCHAR(80) NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_task_change_history_task FOREIGN KEY (task_id) REFERENCES path_plan_tasks(id),
  CONSTRAINT fk_task_change_history_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE weekly_reviews (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  plan_id BIGINT NOT NULL,
  project_id BIGINT NOT NULL,
  week_no TINYINT NOT NULL,
  completed_summary CLOB NULL,
  evidence_summary CLOB NULL,
  difficulties CLOB NULL,
  next_week_minutes INT NULL,
  confidence_trend VARCHAR(20) NULL,
  confidence_reason CLOB NULL,
  adjustment_proposal_json CLOB NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  request_id VARCHAR(80) NULL,
  submitted_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_weekly_reviews_plan_week UNIQUE (plan_id, week_no),
  CONSTRAINT uk_weekly_reviews_user_request UNIQUE (user_id, request_id),
  CONSTRAINT fk_weekly_reviews_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_weekly_reviews_plan FOREIGN KEY (plan_id) REFERENCES path_plans(id) ON DELETE CASCADE,
  CONSTRAINT fk_weekly_reviews_project FOREIGN KEY (project_id) REFERENCES decision_projects(id)
);

CREATE TABLE target_confidence_feedback (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  project_id BIGINT NOT NULL,
  target_id BIGINT NOT NULL,
  trend VARCHAR(20) NOT NULL,
  reason VARCHAR(1000) NOT NULL,
  request_id VARCHAR(80) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_target_confidence_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_target_confidence_project FOREIGN KEY (project_id) REFERENCES decision_projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_target_confidence_target FOREIGN KEY (target_id) REFERENCES decision_targets(id) ON DELETE CASCADE
);
