package com.careerdecision.backend.career;

import com.careerdecision.backend.career.CareerDirectionJobModels.MappingRow;
import com.careerdecision.backend.career.CareerDirectionJobModels.MappingRun;
import com.careerdecision.backend.job.JobFacetRow;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface CareerDirectionJobMapper {
    @Select("""
            SELECT COUNT(1)
            FROM career_direction_job_rel rel
            JOIN jobs j ON j.id = rel.job_id AND j.status = 'active'
            WHERE rel.direction_id = #{directionId}
            """)
    long count(@Param("directionId") long directionId);

    @Select("""
            SELECT COUNT(1)
            FROM career_direction_job_rel rel
            JOIN jobs j ON j.id = rel.job_id AND j.status = 'active'
            WHERE rel.direction_id = #{directionId} AND rel.rule_version = #{version}
            """)
    long countVersion(@Param("directionId") long directionId, @Param("version") String version);

    @Select("""
            SELECT direction_id, rule_version, source_job_count, source_tag_relation_count,
                   latest_job_updated_at, generated_at
            FROM career_direction_mapping_runs WHERE direction_id = #{directionId}
            """)
    MappingRun findRun(@Param("directionId") long directionId);

    @Select("""
            SELECT rel.job_id, rel.match_score, rel.match_source, rel.rule_version,
                   rel.review_status, rel.match_reasons_json
            FROM career_direction_job_rel rel
            JOIN jobs j ON j.id = rel.job_id AND j.status = 'active'
            WHERE rel.direction_id = #{directionId}
            ORDER BY rel.match_score DESC, COALESCE(j.quality_score, 0) DESC, rel.job_id DESC
            LIMIT #{size} OFFSET #{offset}
            """)
    List<MappingRow> page(
            @Param("directionId") long directionId,
            @Param("offset") int offset,
            @Param("size") int size
    );

    @Delete("DELETE FROM career_direction_job_rel WHERE direction_id = #{directionId} AND match_source = 'rule'")
    int deleteRuleMappings(@Param("directionId") long directionId);

    @Delete("DELETE FROM career_direction_mapping_runs WHERE direction_id = #{directionId}")
    int deleteRun(@Param("directionId") long directionId);

    @Insert("""
            INSERT INTO career_direction_mapping_runs (
              direction_id, rule_version, source_job_count, source_tag_relation_count,
              latest_job_updated_at, generated_at
            ) VALUES (
              #{directionId}, #{version}, #{sourceJobCount}, #{sourceTagRelationCount},
              #{latestJobUpdatedAt}, CURRENT_TIMESTAMP
            )
            """)
    void insertRun(
            @Param("directionId") long directionId,
            @Param("version") String version,
            @Param("sourceJobCount") long sourceJobCount,
            @Param("sourceTagRelationCount") long sourceTagRelationCount,
            @Param("latestJobUpdatedAt") LocalDateTime latestJobUpdatedAt
    );

    @Insert("""
            INSERT INTO career_direction_job_rel (
              direction_id, job_id, match_score, match_source, rule_version,
              review_status, match_reasons_json
            )
            SELECT #{directionId}, #{jobId}, #{score}, 'rule', #{version}, 'pending', #{reasonsJson}
            WHERE NOT EXISTS (
              SELECT 1 FROM career_direction_job_rel
              WHERE direction_id = #{directionId} AND job_id = #{jobId}
            )
            """)
    void insertRuleMapping(
            @Param("directionId") long directionId,
            @Param("jobId") long jobId,
            @Param("score") double score,
            @Param("version") String version,
            @Param("reasonsJson") String reasonsJson
    );

    @Select("""
            SELECT j.city AS name, COUNT(1) AS count
            FROM career_direction_job_rel rel JOIN jobs j ON j.id = rel.job_id
            WHERE rel.direction_id = #{directionId} AND j.status = 'active'
              AND j.city IS NOT NULL AND j.city <> ''
            GROUP BY j.city ORDER BY count DESC, name LIMIT #{limit}
            """)
    List<JobFacetRow> cityFacets(@Param("directionId") long directionId, @Param("limit") int limit);

    @Select("""
            SELECT j.education AS name, COUNT(1) AS count
            FROM career_direction_job_rel rel JOIN jobs j ON j.id = rel.job_id
            WHERE rel.direction_id = #{directionId} AND j.status = 'active'
              AND j.education IS NOT NULL AND j.education <> ''
            GROUP BY j.education ORDER BY count DESC, name LIMIT #{limit}
            """)
    List<JobFacetRow> educationFacets(@Param("directionId") long directionId, @Param("limit") int limit);

    @Select("""
            SELECT j.experience_level AS name, COUNT(1) AS count
            FROM career_direction_job_rel rel JOIN jobs j ON j.id = rel.job_id
            WHERE rel.direction_id = #{directionId} AND j.status = 'active'
              AND j.experience_level IS NOT NULL AND j.experience_level <> ''
            GROUP BY j.experience_level ORDER BY count DESC, name LIMIT #{limit}
            """)
    List<JobFacetRow> experienceFacets(@Param("directionId") long directionId, @Param("limit") int limit);

    @Select("""
            SELECT tag.name AS name, COUNT(DISTINCT rel.job_id) AS count
            FROM career_direction_job_rel rel
            JOIN jobs j ON j.id = rel.job_id AND j.status = 'active'
            JOIN job_tag_rel tag_rel ON tag_rel.job_id = rel.job_id
            JOIN job_tags tag ON tag.id = tag_rel.tag_id
            WHERE rel.direction_id = #{directionId}
              AND tag.type = 'skill'
            GROUP BY tag.name ORDER BY count DESC, name LIMIT #{limit}
            """)
    List<JobFacetRow> skillFacets(@Param("directionId") long directionId, @Param("limit") int limit);

    @Select("""
            SELECT MIN(item.original_text) AS name, COUNT(DISTINCT rel.job_id) AS count
            FROM career_direction_job_rel rel
            JOIN jobs j ON j.id = rel.job_id AND j.status = 'active'
            JOIN job_requirement_items item ON item.job_id = rel.job_id
            WHERE rel.direction_id = #{directionId} AND item.item_type = 'requirement'
            GROUP BY item.normalized_key
            ORDER BY count DESC, name LIMIT #{limit}
            """)
    List<JobFacetRow> requirementFacets(@Param("directionId") long directionId, @Param("limit") int limit);

    @Select("""
            SELECT COUNT(1) FROM career_direction_job_rel rel JOIN jobs j ON j.id = rel.job_id
            WHERE rel.direction_id = #{directionId} AND j.status = 'active'
              AND j.salary_period = 'month'
              AND (j.salary_min IS NOT NULL OR j.salary_max IS NOT NULL)
            """)
    long salarySampleSize(@Param("directionId") long directionId);

    @Select("""
            SELECT MIN(j.salary_min) FROM career_direction_job_rel rel JOIN jobs j ON j.id = rel.job_id
            WHERE rel.direction_id = #{directionId} AND j.status = 'active'
              AND j.salary_period = 'month' AND j.salary_min IS NOT NULL
            """)
    Integer minimumSalary(@Param("directionId") long directionId);

    @Select("""
            SELECT MAX(j.salary_max) FROM career_direction_job_rel rel JOIN jobs j ON j.id = rel.job_id
            WHERE rel.direction_id = #{directionId} AND j.status = 'active'
              AND j.salary_period = 'month' AND j.salary_max IS NOT NULL
            """)
    Integer maximumSalary(@Param("directionId") long directionId);

    @Select("""
            SELECT AVG(j.salary_min) FROM career_direction_job_rel rel JOIN jobs j ON j.id = rel.job_id
            WHERE rel.direction_id = #{directionId} AND j.status = 'active'
              AND j.salary_period = 'month' AND j.salary_min IS NOT NULL
            """)
    Double averageMinimumSalary(@Param("directionId") long directionId);

    @Select("""
            SELECT AVG(j.salary_max) FROM career_direction_job_rel rel JOIN jobs j ON j.id = rel.job_id
            WHERE rel.direction_id = #{directionId} AND j.status = 'active'
              AND j.salary_period = 'month' AND j.salary_max IS NOT NULL
            """)
    Double averageMaximumSalary(@Param("directionId") long directionId);

    @Select("""
            SELECT MAX(COALESCE(j.source_updated_at, j.updated_at))
            FROM career_direction_job_rel rel JOIN jobs j ON j.id = rel.job_id
            WHERE rel.direction_id = #{directionId} AND j.status = 'active'
            """)
    LocalDateTime latestSourceUpdatedAt(@Param("directionId") long directionId);
}
