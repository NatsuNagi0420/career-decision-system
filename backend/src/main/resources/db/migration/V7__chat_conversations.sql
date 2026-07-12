CREATE TABLE IF NOT EXISTS chat_sessions (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    title VARCHAR(160) NOT NULL,
    last_page VARCHAR(120) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_chat_sessions_user_updated (user_id, updated_at, id),
    CONSTRAINT fk_chat_sessions_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS chat_messages (
    id BIGINT NOT NULL AUTO_INCREMENT,
    session_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    request_id VARCHAR(80) NULL,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    agent_run_id BIGINT NULL,
    metadata_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_chat_messages_user_request_role (user_id, request_id, role),
    KEY idx_chat_messages_session (session_id, id),
    CONSTRAINT fk_chat_messages_session FOREIGN KEY (session_id)
        REFERENCES chat_sessions (id) ON DELETE CASCADE,
    CONSTRAINT fk_chat_messages_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_chat_messages_agent_run FOREIGN KEY (agent_run_id)
        REFERENCES agent_runs (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DELIMITER $$

CREATE PROCEDURE migrate_v7_legacy_chat_tables()
BEGIN
    DECLARE existing_count INT DEFAULT 0;
    DECLARE desired_count INT DEFAULT 0;
    DECLARE agent_delete_rule VARCHAR(30) DEFAULT NULL;

    SELECT COUNT(*) INTO existing_count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'chat_sessions'
      AND column_name = 'last_page';
    IF existing_count = 0 THEN
        SELECT COUNT(*) INTO existing_count
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'chat_sessions'
          AND column_name = 'page_context';
        IF existing_count > 0 THEN
            ALTER TABLE chat_sessions
                CHANGE COLUMN page_context last_page VARCHAR(120) NULL;
        ELSE
            ALTER TABLE chat_sessions
                ADD COLUMN last_page VARCHAR(120) NULL AFTER title;
        END IF;
    END IF;

    SELECT COUNT(*) INTO existing_count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'chat_sessions'
      AND column_name = 'status';
    IF existing_count = 0 THEN
        ALTER TABLE chat_sessions
            ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active' AFTER last_page;
    END IF;

    UPDATE chat_sessions
    SET title = 'Untitled conversation'
    WHERE title IS NULL OR TRIM(title) = '';
    ALTER TABLE chat_sessions
        MODIFY COLUMN title VARCHAR(160) NOT NULL;

    SELECT COUNT(*) INTO desired_count
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'chat_sessions'
      AND index_name = 'idx_chat_sessions_user_updated';
    IF desired_count = 0 THEN
        SELECT COUNT(*) INTO existing_count
        FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = 'chat_sessions'
          AND index_name = 'idx_chat_sessions_user';
        IF existing_count > 0 THEN
            ALTER TABLE chat_sessions
                ADD INDEX idx_chat_sessions_user_updated_v7 (user_id, updated_at, id);
            ALTER TABLE chat_sessions DROP INDEX idx_chat_sessions_user;
            ALTER TABLE chat_sessions
                RENAME INDEX idx_chat_sessions_user_updated_v7 TO idx_chat_sessions_user_updated;
        ELSE
            ALTER TABLE chat_sessions
                ADD INDEX idx_chat_sessions_user_updated (user_id, updated_at, id);
        END IF;
    END IF;

    SELECT COUNT(*) INTO existing_count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'chat_messages'
      AND column_name = 'user_id';
    IF existing_count = 0 THEN
        ALTER TABLE chat_messages
            ADD COLUMN user_id BIGINT NULL AFTER session_id;
    END IF;

    SELECT COUNT(*) INTO existing_count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'chat_messages'
      AND column_name = 'request_id';
    IF existing_count = 0 THEN
        ALTER TABLE chat_messages
            ADD COLUMN request_id VARCHAR(80) NULL AFTER user_id;
    END IF;

    UPDATE chat_messages message
    INNER JOIN chat_sessions session ON session.id = message.session_id
    SET message.user_id = session.user_id
    WHERE message.user_id IS NULL;

    SELECT COUNT(*) INTO existing_count
    FROM chat_messages
    WHERE user_id IS NULL;
    IF existing_count > 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'V7 cannot assign one or more legacy chat messages to a user';
    END IF;
    ALTER TABLE chat_messages
        MODIFY COLUMN user_id BIGINT NOT NULL;

    SELECT COUNT(*) INTO desired_count
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'chat_messages'
      AND index_name = 'idx_chat_messages_session'
      AND seq_in_index = 2
      AND column_name = 'id';
    IF desired_count = 0 THEN
        SELECT COUNT(*) INTO existing_count
        FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = 'chat_messages'
          AND index_name = 'idx_chat_messages_session';
        IF existing_count > 0 THEN
            ALTER TABLE chat_messages
                ADD INDEX idx_chat_messages_session_v7 (session_id, id);
            ALTER TABLE chat_messages DROP INDEX idx_chat_messages_session;
            ALTER TABLE chat_messages
                RENAME INDEX idx_chat_messages_session_v7 TO idx_chat_messages_session;
        ELSE
            ALTER TABLE chat_messages
                ADD INDEX idx_chat_messages_session (session_id, id);
        END IF;
    END IF;

    SELECT COUNT(*) INTO existing_count
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'chat_messages'
      AND index_name = 'uk_chat_messages_user_request_role';
    IF existing_count = 0 THEN
        ALTER TABLE chat_messages
            ADD UNIQUE INDEX uk_chat_messages_user_request_role (user_id, request_id, role);
    END IF;

    SELECT COUNT(*) INTO existing_count
    FROM information_schema.table_constraints
    WHERE constraint_schema = DATABASE()
      AND table_name = 'chat_messages'
      AND constraint_name = 'fk_chat_messages_user'
      AND constraint_type = 'FOREIGN KEY';
    IF existing_count = 0 THEN
        ALTER TABLE chat_messages
            ADD CONSTRAINT fk_chat_messages_user
            FOREIGN KEY (user_id) REFERENCES users (id);
    END IF;

    SELECT MAX(delete_rule) INTO agent_delete_rule
    FROM information_schema.referential_constraints
    WHERE constraint_schema = DATABASE()
      AND table_name = 'chat_messages'
      AND constraint_name = 'fk_chat_messages_agent_run';
    IF agent_delete_rule IS NOT NULL AND agent_delete_rule <> 'SET NULL' THEN
        ALTER TABLE chat_messages
            DROP FOREIGN KEY fk_chat_messages_agent_run;
        SET agent_delete_rule = NULL;
    END IF;
    IF agent_delete_rule IS NULL THEN
        ALTER TABLE chat_messages
            ADD CONSTRAINT fk_chat_messages_agent_run
            FOREIGN KEY (agent_run_id) REFERENCES agent_runs (id) ON DELETE SET NULL;
    END IF;
END$$

DELIMITER ;

CALL migrate_v7_legacy_chat_tables();
DROP PROCEDURE migrate_v7_legacy_chat_tables;
