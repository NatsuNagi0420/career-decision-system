package db.migration;

import com.careerdecision.backend.career.CareerDirectionJobModels.MatchDraft;
import com.careerdecision.backend.career.CareerDirectionMatcher;
import com.careerdecision.backend.career.CareerDirectionModels.DirectionRow;
import com.careerdecision.backend.job.JobDescriptionStructurer;
import com.careerdecision.backend.job.JobRecord;
import com.careerdecision.backend.job.JobRequirementItem;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** One-time enrichment of jobs that existed before structured JD storage was introduced. */
public class V9__backfill_structured_jobs_and_direction_mappings extends BaseJavaMigration {
    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() { };
    private static final int MIN_MATCH_SCORE = 28;
    private static final int MIN_FALLBACK_SAMPLE = 8;

    @Override
    public void migrate(Context context) throws Exception {
        Connection connection = context.getConnection();
        ObjectMapper objectMapper = new ObjectMapper();
        List<JobRecord> jobs = jobs(connection);
        Map<Long, List<String>> tags = tags(connection);
        backfillItems(connection, jobs, skillTags(connection));
        backfillMappings(connection, jobs, tags, directions(connection), objectMapper);
    }

    private void backfillItems(Connection connection, List<JobRecord> jobs, Map<Long, List<String>> tags)
            throws SQLException {
        JobDescriptionStructurer structurer = new JobDescriptionStructurer();
        try (PreparedStatement insert = connection.prepareStatement("""
                INSERT INTO job_requirement_items (
                  job_id, item_type, original_text, normalized_key, confidence,
                  extraction_method, extractor_version, sort_order
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE id = id
                """)) {
            for (JobRecord job : jobs) {
                for (JobRequirementItem item : structurer.extract(job, tags.getOrDefault(job.getId(), List.of()))) {
                    insert.setLong(1, job.getId());
                    insert.setString(2, item.itemType());
                    insert.setString(3, item.originalText());
                    insert.setString(4, item.normalizedKey());
                    insert.setDouble(5, item.confidence());
                    insert.setString(6, item.extractionMethod());
                    insert.setString(7, item.extractorVersion());
                    insert.setInt(8, item.sortOrder());
                    insert.addBatch();
                }
            }
            insert.executeBatch();
        }
    }

    private void backfillMappings(
            Connection connection,
            List<JobRecord> jobs,
            Map<Long, List<String>> tags,
            List<DirectionRow> directions,
            ObjectMapper objectMapper
    ) throws Exception {
        CareerDirectionMatcher matcher = new CareerDirectionMatcher();
        try (PreparedStatement insert = connection.prepareStatement("""
                INSERT INTO career_direction_job_rel (
                  direction_id, job_id, match_score, match_source, rule_version,
                  review_status, match_reasons_json
                ) VALUES (?, ?, ?, 'rule', ?, 'pending', ?)
                ON DUPLICATE KEY UPDATE id = id
                """); PreparedStatement insertRun = connection.prepareStatement("""
                INSERT INTO career_direction_mapping_runs (
                  direction_id, rule_version, source_job_count, source_tag_relation_count,
                  latest_job_updated_at, generated_at
                ) VALUES (
                  ?, ?,
                  (SELECT COUNT(1) FROM jobs WHERE status = 'active'),
                  (SELECT COUNT(1) FROM job_tag_rel rel JOIN jobs j ON j.id = rel.job_id WHERE j.status = 'active'),
                  (SELECT MAX(updated_at) FROM jobs WHERE status = 'active'),
                  CURRENT_TIMESTAMP
                )
                ON DUPLICATE KEY UPDATE direction_id = direction_id
                """)) {
            for (DirectionRow direction : directions) {
                List<String> skills = strings(objectMapper, direction.commonSkillsJson());
                List<String> industries = strings(objectMapper, direction.industryTagsJson());
                List<MatchDraft> candidates = jobs.stream()
                        .map(job -> matcher.match(direction, skills, industries, job,
                                tags.getOrDefault(job.getId(), List.of())))
                        .sorted(Comparator.comparingDouble(MatchDraft::score).reversed()
                                .thenComparing(MatchDraft::jobId))
                        .toList();
                List<MatchDraft> selected = candidates.stream()
                        .filter(candidate -> candidate.score() >= MIN_MATCH_SCORE).toList();
                if (selected.size() < MIN_FALLBACK_SAMPLE) {
                    selected = candidates.stream().filter(candidate -> candidate.score() > 0)
                            .limit(MIN_FALLBACK_SAMPLE).toList();
                }
                for (MatchDraft match : selected) {
                    insert.setLong(1, direction.id());
                    insert.setLong(2, match.jobId());
                    insert.setDouble(3, match.score());
                    insert.setString(4, CareerDirectionMatcher.RULE_VERSION);
                    insert.setString(5, objectMapper.writeValueAsString(match.reasons()));
                    insert.addBatch();
                }
                insertRun.setLong(1, direction.id());
                insertRun.setString(2, CareerDirectionMatcher.RULE_VERSION);
                insertRun.addBatch();
            }
            insert.executeBatch();
            insertRun.executeBatch();
        }
    }

    private List<JobRecord> jobs(Connection connection) throws SQLException {
        List<JobRecord> result = new ArrayList<>();
        try (PreparedStatement statement = connection.prepareStatement("""
                SELECT id, title, direction, industry, education, experience_level, description, quality_score
                FROM jobs WHERE status = 'active' ORDER BY id
                """); ResultSet rows = statement.executeQuery()) {
            while (rows.next()) {
                JobRecord job = new JobRecord();
                job.setId(rows.getLong("id"));
                job.setTitle(rows.getString("title"));
                job.setDirection(rows.getString("direction"));
                job.setIndustry(rows.getString("industry"));
                job.setEducation(rows.getString("education"));
                job.setExperienceLevel(rows.getString("experience_level"));
                job.setDescription(rows.getString("description"));
                double quality = rows.getDouble("quality_score");
                job.setQualityScore(rows.wasNull() ? null : quality);
                result.add(job);
            }
        }
        return result;
    }

    private Map<Long, List<String>> tags(Connection connection) throws SQLException {
        Map<Long, List<String>> result = new HashMap<>();
        try (PreparedStatement statement = connection.prepareStatement("""
                SELECT rel.job_id, tag.name
                FROM job_tag_rel rel JOIN job_tags tag ON tag.id = rel.tag_id
                JOIN jobs j ON j.id = rel.job_id AND j.status = 'active'
                ORDER BY rel.job_id, tag.type, tag.name
                """); ResultSet rows = statement.executeQuery()) {
            while (rows.next()) {
                result.computeIfAbsent(rows.getLong("job_id"), ignored -> new ArrayList<>())
                        .add(rows.getString("name"));
            }
        }
        return result;
    }

    private Map<Long, List<String>> skillTags(Connection connection) throws SQLException {
        Map<Long, List<String>> result = new HashMap<>();
        try (PreparedStatement statement = connection.prepareStatement("""
                SELECT rel.job_id, tag.name
                FROM job_tag_rel rel JOIN job_tags tag ON tag.id = rel.tag_id
                JOIN jobs j ON j.id = rel.job_id AND j.status = 'active'
                WHERE tag.type = 'skill'
                ORDER BY rel.job_id, tag.name
                """); ResultSet rows = statement.executeQuery()) {
            while (rows.next()) {
                result.computeIfAbsent(rows.getLong("job_id"), ignored -> new ArrayList<>())
                        .add(rows.getString("name"));
            }
        }
        return result;
    }

    private List<DirectionRow> directions(Connection connection) throws SQLException {
        List<DirectionRow> result = new ArrayList<>();
        try (PreparedStatement statement = connection.prepareStatement("""
                SELECT id, owner_user_id, code, name, category, summary, typical_work_json,
                       common_skills_json, growth_path_json, misconceptions_json, major_tags_json,
                       industry_tags_json, work_types_json, updated_at
                FROM career_directions WHERE status = 'active' ORDER BY id
                """); ResultSet rows = statement.executeQuery()) {
            while (rows.next()) {
                long ownerId = rows.getLong("owner_user_id");
                Long owner = rows.wasNull() ? null : ownerId;
                Timestamp updated = rows.getTimestamp("updated_at");
                result.add(new DirectionRow(
                        rows.getLong("id"), owner, rows.getString("code"), rows.getString("name"),
                        rows.getString("category"), rows.getString("summary"),
                        rows.getString("typical_work_json"), rows.getString("common_skills_json"),
                        rows.getString("growth_path_json"), rows.getString("misconceptions_json"),
                        rows.getString("major_tags_json"), rows.getString("industry_tags_json"),
                        rows.getString("work_types_json"), 0,
                        updated == null ? null : updated.toLocalDateTime()
                ));
            }
        }
        return result;
    }

    private List<String> strings(ObjectMapper objectMapper, String value) {
        if (value == null || value.isBlank()) return List.of();
        try {
            return objectMapper.readValue(value, STRING_LIST);
        } catch (Exception ignored) {
            return List.of();
        }
    }
}
