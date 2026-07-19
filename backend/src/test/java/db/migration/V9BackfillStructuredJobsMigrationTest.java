package db.migration;

import org.flywaydb.core.api.configuration.Configuration;
import org.flywaydb.core.api.migration.Context;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;

import static org.assertj.core.api.Assertions.assertThat;

class V9BackfillStructuredJobsMigrationTest {
    @Test
    void backfillsExistingActiveJobsAndCanBeSafelyRetried() throws Exception {
        try (Connection connection = DriverManager.getConnection(
                "jdbc:h2:mem:v9_backfill;MODE=MySQL;DATABASE_TO_UPPER=false;DB_CLOSE_DELAY=-1", "sa", "")) {
            createSchema(connection);
            seedLegacyRows(connection);

            V9__backfill_structured_jobs_and_direction_mappings migration =
                    new V9__backfill_structured_jobs_and_direction_mappings();
            Context context = context(connection);
            migration.migrate(context);
            migration.migrate(context);

            assertThat(count(connection, "SELECT COUNT(*) FROM job_requirement_items WHERE job_id = 1001"))
                    .isGreaterThanOrEqualTo(4);
            assertThat(count(connection, """
                    SELECT COUNT(*) FROM job_requirement_items
                    WHERE job_id = 1001 AND item_type = 'requirement'
                      AND original_text = '熟悉 Java 与关系型数据库。'
                    """)).isEqualTo(1);
            assertThat(count(connection, """
                    SELECT COUNT(*) FROM job_requirement_items
                    WHERE job_id = 1001 AND item_type = 'skill' AND normalized_key = 'java'
                    """)).isEqualTo(1);
            assertThat(count(connection, "SELECT COUNT(*) FROM job_requirement_items WHERE job_id = 1002"))
                    .isZero();
            assertThat(count(connection, """
                    SELECT COUNT(*) FROM career_direction_job_rel
                    WHERE direction_id = 1 AND job_id = 1001
                    """)).isEqualTo(1);
            assertThat(count(connection, "SELECT COUNT(*) FROM career_direction_mapping_runs WHERE direction_id = 1"))
                    .isEqualTo(1);
            assertThat(text(connection, "SELECT description FROM jobs WHERE id = 1001"))
                    .contains("<br>").contains("任职要求");
        }
    }

    private Context context(Connection connection) {
        return new Context() {
            @Override
            public Configuration getConfiguration() {
                return null;
            }

            @Override
            public Connection getConnection() {
                return connection;
            }
        };
    }

    private void createSchema(Connection connection) throws Exception {
        try (Statement statement = connection.createStatement()) {
            statement.execute("""
                    CREATE TABLE jobs (
                      id BIGINT PRIMARY KEY, title VARCHAR(160) NOT NULL, direction VARCHAR(80),
                      industry VARCHAR(200), education VARCHAR(80), experience_level VARCHAR(80),
                      description CLOB, quality_score DOUBLE, status VARCHAR(20) NOT NULL,
                      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                    """);
            statement.execute("CREATE TABLE job_tags (id BIGINT PRIMARY KEY, name VARCHAR(80), type VARCHAR(40))");
            statement.execute("CREATE TABLE job_tag_rel (job_id BIGINT, tag_id BIGINT, PRIMARY KEY(job_id, tag_id))");
            statement.execute("""
                    CREATE TABLE career_directions (
                      id BIGINT PRIMARY KEY, owner_user_id BIGINT, code VARCHAR(60), name VARCHAR(120),
                      category VARCHAR(80), summary VARCHAR(800), typical_work_json CLOB,
                      common_skills_json CLOB, growth_path_json CLOB, misconceptions_json CLOB,
                      major_tags_json CLOB, industry_tags_json CLOB, work_types_json CLOB,
                      status VARCHAR(20), updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                    """);
            statement.execute("""
                    CREATE TABLE job_requirement_items (
                      id BIGINT AUTO_INCREMENT PRIMARY KEY, job_id BIGINT NOT NULL, item_type VARCHAR(40) NOT NULL,
                      original_text VARCHAR(1000) NOT NULL, normalized_key VARCHAR(255) NOT NULL,
                      confidence DECIMAL(5,4), extraction_method VARCHAR(30), extractor_version VARCHAR(40),
                      sort_order INT, CONSTRAINT uk_job_requirement_item UNIQUE(job_id, item_type, normalized_key)
                    )
                    """);
            statement.execute("""
                    CREATE TABLE career_direction_job_rel (
                      id BIGINT AUTO_INCREMENT PRIMARY KEY, direction_id BIGINT NOT NULL, job_id BIGINT NOT NULL,
                      match_score DECIMAL(5,2), match_source VARCHAR(30), rule_version VARCHAR(40),
                      review_status VARCHAR(20), match_reasons_json CLOB,
                      CONSTRAINT uk_direction_job_mapping UNIQUE(direction_id, job_id)
                    )
                    """);
            statement.execute("""
                    CREATE TABLE career_direction_mapping_runs (
                      direction_id BIGINT PRIMARY KEY, rule_version VARCHAR(40), source_job_count BIGINT,
                      source_tag_relation_count BIGINT, latest_job_updated_at TIMESTAMP, generated_at TIMESTAMP
                    )
                    """);
        }
    }

    private void seedLegacyRows(Connection connection) throws Exception {
        try (Statement statement = connection.createStatement()) {
            statement.executeUpdate("""
                    INSERT INTO jobs (
                      id, title, direction, industry, education, experience_level,
                      description, quality_score, status
                    ) VALUES (
                      1001, '后端工程师', '技术研发', '互联网', '本科及以上', '1-3年',
                      '岗位职责：<br>1、建设业务接口。<br>任职要求：<br>1、熟悉 Java 与关系型数据库。',
                      90, 'active'
                    )
                    """);
            statement.executeUpdate("""
                    INSERT INTO jobs (id, title, description, quality_score, status)
                    VALUES (1002, '历史下线岗位', '不应被回填', 50, 'archived')
                    """);
            statement.executeUpdate("INSERT INTO job_tags (id, name, type) VALUES (1, 'Java', 'skill')");
            statement.executeUpdate("INSERT INTO job_tag_rel (job_id, tag_id) VALUES (1001, 1)");
            statement.executeUpdate("""
                    INSERT INTO career_directions (
                      id, code, name, category, summary, common_skills_json,
                      industry_tags_json, status
                    ) VALUES (
                      1, 'backend', '后端开发', '技术研发', '后端方向', '["Java"]', '["互联网"]', 'active'
                    )
                    """);
        }
    }

    private long count(Connection connection, String sql) throws Exception {
        try (Statement statement = connection.createStatement(); ResultSet rows = statement.executeQuery(sql)) {
            rows.next();
            return rows.getLong(1);
        }
    }

    private String text(Connection connection, String sql) throws Exception {
        try (Statement statement = connection.createStatement(); ResultSet rows = statement.executeQuery(sql)) {
            rows.next();
            return rows.getString(1);
        }
    }
}
