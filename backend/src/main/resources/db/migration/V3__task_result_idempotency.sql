ALTER TABLE task_results
    ADD COLUMN request_id VARCHAR(80) NULL AFTER user_id,
    ADD UNIQUE KEY uk_task_results_user_request (user_id, request_id);
