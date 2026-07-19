package com.careerdecision.backend.job;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface JobRequirementItemMapper {
    @Select("""
            SELECT id, job_id, item_type, original_text, normalized_key, confidence,
                   extraction_method, extractor_version, sort_order
            FROM job_requirement_items
            WHERE job_id = #{jobId}
            ORDER BY sort_order, id
            """)
    List<JobRequirementItem> findByJobId(@Param("jobId") long jobId);

    @Delete("DELETE FROM job_requirement_items WHERE job_id = #{jobId} AND extraction_method = 'rule'")
    int deleteRuleItems(@Param("jobId") long jobId);

    @Insert("""
            INSERT INTO job_requirement_items (
              job_id, item_type, original_text, normalized_key, confidence,
              extraction_method, extractor_version, sort_order
            ) VALUES (
              #{jobId}, #{itemType}, #{originalText}, #{normalizedKey}, #{confidence},
              #{extractionMethod}, #{extractorVersion}, #{sortOrder}
            )
            ON DUPLICATE KEY UPDATE id = id
            """)
    void insert(JobRequirementItem item);
}
