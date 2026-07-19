-- Structured JD facts and versioned career-direction/job mappings.
-- Raw jobs.description remains the source of truth; extracted facts can be rebuilt safely.

CREATE TABLE job_requirement_items (
    id BIGINT NOT NULL AUTO_INCREMENT,
    job_id BIGINT NOT NULL,
    item_type VARCHAR(40) NOT NULL,
    original_text VARCHAR(1000) NOT NULL,
    normalized_key VARCHAR(255) NOT NULL,
    confidence DECIMAL(5,4) NOT NULL DEFAULT 0.8000,
    extraction_method VARCHAR(30) NOT NULL DEFAULT 'rule',
    extractor_version VARCHAR(40) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_job_requirement_item (job_id, item_type, normalized_key),
    KEY idx_job_requirement_items_type (job_id, item_type, sort_order),
    CONSTRAINT fk_job_requirement_items_job FOREIGN KEY (job_id)
        REFERENCES jobs (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE career_direction_job_rel (
    id BIGINT NOT NULL AUTO_INCREMENT,
    direction_id BIGINT NOT NULL,
    job_id BIGINT NOT NULL,
    match_score DECIMAL(5,2) NOT NULL,
    match_source VARCHAR(30) NOT NULL DEFAULT 'rule',
    rule_version VARCHAR(40) NOT NULL,
    review_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    match_reasons_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_direction_job_mapping (direction_id, job_id),
    KEY idx_direction_job_rank (direction_id, match_score, job_id),
    KEY idx_direction_job_job (job_id, direction_id),
    CONSTRAINT fk_direction_job_mapping_direction FOREIGN KEY (direction_id)
        REFERENCES career_directions (id) ON DELETE CASCADE,
    CONSTRAINT fk_direction_job_mapping_job FOREIGN KEY (job_id)
        REFERENCES jobs (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE career_direction_mapping_runs (
    direction_id BIGINT NOT NULL,
    rule_version VARCHAR(40) NOT NULL,
    source_job_count BIGINT NOT NULL,
    source_tag_relation_count BIGINT NOT NULL,
    latest_job_updated_at DATETIME NULL,
    generated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (direction_id),
    CONSTRAINT fk_direction_mapping_runs_direction FOREIGN KEY (direction_id)
        REFERENCES career_directions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
