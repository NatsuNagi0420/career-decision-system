package com.careerdecision.backend.job;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface JobTargetMapper {
    @Select("""
            SELECT COUNT(1)
            FROM job_targets
            WHERE user_id = #{userId}
              AND job_id = #{jobId}
            """)
    int countTarget(@Param("userId") long userId, @Param("jobId") long jobId);

    @Insert("""
            INSERT INTO job_targets (user_id, job_id)
            VALUES (#{userId}, #{jobId})
            """)
    void insert(@Param("userId") long userId, @Param("jobId") long jobId);

    @Delete("""
            DELETE FROM job_targets
            WHERE user_id = #{userId}
              AND job_id = #{jobId}
            """)
    int delete(@Param("userId") long userId, @Param("jobId") long jobId);

    @Select("""
            SELECT
            """ + JobMapper.BASE_COLUMNS + """
            FROM job_targets t
            JOIN jobs j ON j.id = t.job_id
            WHERE t.user_id = #{userId}
              AND j.status = 'active'
            ORDER BY t.updated_at DESC, t.created_at DESC, t.id DESC
            """)
    List<JobRecord> findTargetJobs(@Param("userId") long userId);
}
