ALTER TABLE weekly_reviews
    ADD COLUMN request_id VARCHAR(80) NULL AFTER status,
    ADD UNIQUE KEY uk_weekly_reviews_user_request (user_id, request_id);
