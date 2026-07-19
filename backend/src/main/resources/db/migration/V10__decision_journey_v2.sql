-- Additive storage for the V2 decision journey. Existing projects remain readable.
ALTER TABLE decision_projects
    ADD COLUMN flow_version INT NOT NULL DEFAULT 1 AFTER version,
    ADD COLUMN comparison_reviewed_at DATETIME NULL AFTER flow_version;

ALTER TABLE decision_candidates
    ADD COLUMN exclusion_reason TEXT NULL AFTER status;

ALTER TABLE decision_project_job_samples
    ADD COLUMN reviewed_at DATETIME NULL AFTER note;

UPDATE decision_project_job_samples
SET reviewed_at = created_at
WHERE reviewed_at IS NULL;

ALTER TABLE comparison_criteria
    MODIFY COLUMN name VARCHAR(160) NOT NULL,
    ADD COLUMN criterion_kind VARCHAR(24) NOT NULL DEFAULT 'legacy' AFTER description,
    ADD COLUMN source_type VARCHAR(24) NOT NULL DEFAULT 'system' AFTER criterion_kind;

ALTER TABLE comparison_results
    ADD COLUMN verdict VARCHAR(24) NULL AFTER score,
    ADD COLUMN confirmed_at DATETIME NULL AFTER validation_action;

ALTER TABLE decision_targets
    ADD COLUMN verification_status VARCHAR(20) NOT NULL DEFAULT 'verified' AFTER review_date,
    ADD COLUMN verified_at DATETIME NULL AFTER verification_status,
    ADD COLUMN override_reason TEXT NULL AFTER verified_at;

CREATE INDEX idx_decision_targets_verification
    ON decision_targets (project_id, verification_status, target_type);
