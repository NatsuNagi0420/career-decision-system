ALTER TABLE user_profiles
    ADD COLUMN preferred_industries_json JSON NULL AFTER expected_salary,
    ADD COLUMN preferred_work_modes_json JSON NULL AFTER preferred_industries_json,
    ADD COLUMN constraints_json JSON NULL AFTER preferred_work_modes_json,
    ADD COLUMN external_ai_consent_at DATETIME NULL AFTER onboarding_completed_at;

ALTER TABLE personal_evidence
    ADD COLUMN role_name VARCHAR(160) NULL AFTER description,
    ADD COLUMN result_summary TEXT NULL AFTER role_name,
    ADD COLUMN link_url VARCHAR(1000) NULL AFTER result_summary,
    ADD COLUMN proficiency VARCHAR(40) NULL AFTER link_url,
    ADD COLUMN last_used_at DATE NULL AFTER proficiency,
    ADD COLUMN feedback TEXT NULL AFTER last_used_at;

CREATE TABLE target_confidence_feedback (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    project_id BIGINT NOT NULL,
    target_id BIGINT NOT NULL,
    trend VARCHAR(20) NOT NULL,
    reason VARCHAR(1000) NOT NULL,
    request_id VARCHAR(80) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_target_confidence_request (request_id),
    KEY idx_target_confidence_user (user_id, project_id, created_at),
    CONSTRAINT fk_target_confidence_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_target_confidence_project FOREIGN KEY (project_id)
        REFERENCES decision_projects (id) ON DELETE CASCADE,
    CONSTRAINT fk_target_confidence_target FOREIGN KEY (target_id)
        REFERENCES decision_targets (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
