package com.careerdecision.backend.job;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface JobMapper {
    String BASE_COLUMNS = """
            j.id,
            j.title,
            j.company,
            j.city,
            j.city_district,
            j.location_text,
            j.direction,
            j.industry,
            j.company_size,
            j.financing_stage,
            j.salary_min,
            j.salary_max,
            j.salary_text,
            j.salary_period,
            j.salary_months,
            j.experience_level,
            j.education,
            j.description,
            j.company_description,
            j.source_platform,
            j.source_url,
            j.source_updated_text,
            j.quality_score,
            j.source_updated_at
            """;

    @Select("""
            <script>
            SELECT COUNT(DISTINCT j.id)
            FROM jobs j
            LEFT JOIN job_tag_rel rel ON rel.job_id = j.id
            LEFT JOIN job_tags tag ON tag.id = rel.tag_id
            WHERE j.status = 'active'
            <if test="criteria.keyword != null and criteria.keyword != ''">
              AND (
                LOWER(j.title) LIKE CONCAT('%', LOWER(#{criteria.keyword}), '%')
                OR LOWER(j.company) LIKE CONCAT('%', LOWER(#{criteria.keyword}), '%')
                OR LOWER(COALESCE(j.city, '')) LIKE CONCAT('%', LOWER(#{criteria.keyword}), '%')
                OR LOWER(COALESCE(j.city_district, '')) LIKE CONCAT('%', LOWER(#{criteria.keyword}), '%')
                OR LOWER(COALESCE(j.location_text, '')) LIKE CONCAT('%', LOWER(#{criteria.keyword}), '%')
                OR LOWER(COALESCE(j.direction, '')) LIKE CONCAT('%', LOWER(#{criteria.keyword}), '%')
                OR LOWER(COALESCE(j.industry, '')) LIKE CONCAT('%', LOWER(#{criteria.keyword}), '%')
                OR LOWER(COALESCE(j.search_text, j.description, '')) LIKE CONCAT('%', LOWER(#{criteria.keyword}), '%')
                OR LOWER(COALESCE(tag.name, '')) LIKE CONCAT('%', LOWER(#{criteria.keyword}), '%')
              )
            </if>
            <if test="criteria.city != null and criteria.city != ''">
              AND (j.city = #{criteria.city} OR j.location_text = #{criteria.city})
            </if>
            <if test="criteria.direction != null and criteria.direction != ''">
              AND j.direction = #{criteria.direction}
            </if>
            <if test="criteria.salaryMin != null">
              AND j.salary_max IS NOT NULL
              AND j.salary_max &gt;= #{criteria.salaryMin}
            </if>
            <if test="criteria.salaryMax != null">
              AND j.salary_min IS NOT NULL
              AND j.salary_min &lt;= #{criteria.salaryMax}
            </if>
            <if test="criteria.experienceLevel != null and criteria.experienceLevel != ''">
              AND j.experience_level = #{criteria.experienceLevel}
            </if>
            <if test="criteria.tag != null and criteria.tag != ''">
              AND EXISTS (
                SELECT 1
                FROM job_tag_rel rel_filter
                JOIN job_tags tag_filter ON tag_filter.id = rel_filter.tag_id
                WHERE rel_filter.job_id = j.id
                  AND tag_filter.name = #{criteria.tag}
              )
            </if>
            </script>
            """)
    long countSearch(@Param("criteria") JobSearchCriteria criteria);

    @Select("""
            <script>
            SELECT DISTINCT
            """ + BASE_COLUMNS + """
            FROM jobs j
            LEFT JOIN job_tag_rel rel ON rel.job_id = j.id
            LEFT JOIN job_tags tag ON tag.id = rel.tag_id
            WHERE j.status = 'active'
            <if test="criteria.keyword != null and criteria.keyword != ''">
              AND (
                LOWER(j.title) LIKE CONCAT('%', LOWER(#{criteria.keyword}), '%')
                OR LOWER(j.company) LIKE CONCAT('%', LOWER(#{criteria.keyword}), '%')
                OR LOWER(COALESCE(j.city, '')) LIKE CONCAT('%', LOWER(#{criteria.keyword}), '%')
                OR LOWER(COALESCE(j.city_district, '')) LIKE CONCAT('%', LOWER(#{criteria.keyword}), '%')
                OR LOWER(COALESCE(j.location_text, '')) LIKE CONCAT('%', LOWER(#{criteria.keyword}), '%')
                OR LOWER(COALESCE(j.direction, '')) LIKE CONCAT('%', LOWER(#{criteria.keyword}), '%')
                OR LOWER(COALESCE(j.industry, '')) LIKE CONCAT('%', LOWER(#{criteria.keyword}), '%')
                OR LOWER(COALESCE(j.search_text, j.description, '')) LIKE CONCAT('%', LOWER(#{criteria.keyword}), '%')
                OR LOWER(COALESCE(tag.name, '')) LIKE CONCAT('%', LOWER(#{criteria.keyword}), '%')
              )
            </if>
            <if test="criteria.city != null and criteria.city != ''">
              AND (j.city = #{criteria.city} OR j.location_text = #{criteria.city})
            </if>
            <if test="criteria.direction != null and criteria.direction != ''">
              AND j.direction = #{criteria.direction}
            </if>
            <if test="criteria.salaryMin != null">
              AND j.salary_max IS NOT NULL
              AND j.salary_max &gt;= #{criteria.salaryMin}
            </if>
            <if test="criteria.salaryMax != null">
              AND j.salary_min IS NOT NULL
              AND j.salary_min &lt;= #{criteria.salaryMax}
            </if>
            <if test="criteria.experienceLevel != null and criteria.experienceLevel != ''">
              AND j.experience_level = #{criteria.experienceLevel}
            </if>
            <if test="criteria.tag != null and criteria.tag != ''">
              AND EXISTS (
                SELECT 1
                FROM job_tag_rel rel_filter
                JOIN job_tags tag_filter ON tag_filter.id = rel_filter.tag_id
                WHERE rel_filter.job_id = j.id
                  AND tag_filter.name = #{criteria.tag}
              )
            </if>
            ORDER BY COALESCE(j.quality_score, 0) DESC, j.source_updated_at DESC, j.id DESC
            LIMIT #{size} OFFSET #{offset}
            </script>
            """)
    List<JobRecord> search(
            @Param("criteria") JobSearchCriteria criteria,
            @Param("offset") int offset,
            @Param("size") int size
    );

    @Select("""
            SELECT
            """ + BASE_COLUMNS + """
            FROM jobs j
            WHERE j.id = #{id}
              AND j.status = 'active'
            LIMIT 1
            """)
    JobRecord findActiveById(@Param("id") long id);

    @Select("""
            SELECT tag.name
            FROM job_tags tag
            JOIN job_tag_rel rel ON rel.tag_id = tag.id
            WHERE rel.job_id = #{jobId}
            ORDER BY tag.type, tag.name
            """)
    List<String> findTags(@Param("jobId") long jobId);

    @Select("""
            SELECT tag.name
            FROM job_tags tag
            JOIN job_tag_rel rel ON rel.tag_id = tag.id
            WHERE rel.job_id = #{jobId} AND tag.type = 'skill'
            ORDER BY tag.name
            """)
    List<String> findSkillTags(@Param("jobId") long jobId);

    @Select("""
            SELECT j.city AS name, COUNT(1) AS count
            FROM jobs j
            WHERE j.status = 'active'
              AND j.city IS NOT NULL
              AND j.city <> ''
            GROUP BY j.city
            ORDER BY count DESC, name
            """)
    List<JobFacetRow> cityFacets();

    @Select("""
            SELECT j.direction AS name, COUNT(1) AS count
            FROM jobs j
            WHERE j.status = 'active'
              AND j.direction IS NOT NULL
              AND j.direction <> ''
            GROUP BY j.direction
            ORDER BY count DESC, name
            """)
    List<JobFacetRow> directionFacets();

    @Select("""
            SELECT tag.name AS name, COUNT(DISTINCT rel.job_id) AS count
            FROM job_tags tag
            JOIN job_tag_rel rel ON rel.tag_id = tag.id
            JOIN jobs j ON j.id = rel.job_id
            WHERE j.status = 'active'
            GROUP BY tag.name
            ORDER BY count DESC, name
            """)
    List<JobFacetRow> tagFacets();

    @Select("""
            <script>
            SELECT
            """ + BASE_COLUMNS + """
            FROM jobs j
            WHERE j.status = 'active'
            <if test="keyword != null and keyword != ''">
              AND (
                LOWER(j.title) LIKE CONCAT('%', LOWER(#{keyword}), '%')
                OR LOWER(COALESCE(j.direction, '')) LIKE CONCAT('%', LOWER(#{keyword}), '%')
                OR LOWER(COALESCE(j.industry, '')) LIKE CONCAT('%', LOWER(#{keyword}), '%')
                OR LOWER(COALESCE(j.search_text, j.description, '')) LIKE CONCAT('%', LOWER(#{keyword}), '%')
              )
            </if>
            <if test="cities != null and cities.size > 0">
              AND j.city IN
              <foreach collection="cities" item="city" open="(" separator="," close=")">
                #{city}
              </foreach>
            </if>
            ORDER BY COALESCE(j.quality_score, 0) DESC, j.source_updated_at DESC, j.id DESC
            LIMIT #{limit}
            </script>
            """)
    List<JobRecord> recommendCandidates(
            @Param("keyword") String keyword,
            @Param("cities") List<String> cities,
            @Param("limit") int limit
    );

    @Select("""
            SELECT
            """ + BASE_COLUMNS + """
            FROM jobs j
            WHERE j.status = 'active'
            ORDER BY COALESCE(j.quality_score, 0) DESC, j.source_updated_at DESC, j.id DESC
            LIMIT #{limit}
            """)
    List<JobRecord> topActiveJobs(@Param("limit") int limit);

    @Select("""
            SELECT
            """ + BASE_COLUMNS + """
            FROM jobs j
            WHERE j.status = 'active'
            ORDER BY j.id
            """)
    List<JobRecord> allActiveJobs();

    @Select("""
            SELECT rel.job_id, tag.name
            FROM job_tag_rel rel
            JOIN job_tags tag ON tag.id = rel.tag_id
            JOIN jobs j ON j.id = rel.job_id AND j.status = 'active'
            ORDER BY rel.job_id, tag.type, tag.name
            """)
    List<JobTagRow> allActiveJobTags();

    @Select("SELECT COUNT(1) FROM jobs WHERE status = 'active'")
    long activeJobCount();

    @Select("""
            SELECT COUNT(1)
            FROM job_tag_rel rel JOIN jobs j ON j.id = rel.job_id
            WHERE j.status = 'active'
            """)
    long activeJobTagRelationCount();

    @Select("SELECT MAX(updated_at) FROM jobs WHERE status = 'active'")
    java.time.LocalDateTime latestActiveJobUpdatedAt();
}
