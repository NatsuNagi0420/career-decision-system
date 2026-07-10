package com.careerdecision.backend.job;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface JobFavoriteMapper {
    @Select("""
            SELECT COUNT(1)
            FROM jobs
            WHERE id = #{jobId}
              AND status = 'active'
            """)
    int countActiveJob(@Param("jobId") long jobId);

    @Select("""
            SELECT COUNT(1)
            FROM job_favorites
            WHERE user_id = #{userId}
              AND job_id = #{jobId}
            """)
    int countFavorite(@Param("userId") long userId, @Param("jobId") long jobId);

    @Insert("""
            INSERT INTO job_favorites (user_id, job_id)
            VALUES (#{userId}, #{jobId})
            """)
    void insert(@Param("userId") long userId, @Param("jobId") long jobId);

    @Delete("""
            DELETE FROM job_favorites
            WHERE user_id = #{userId}
              AND job_id = #{jobId}
            """)
    int delete(@Param("userId") long userId, @Param("jobId") long jobId);

    @Select("""
            SELECT
            """ + JobMapper.BASE_COLUMNS + """
            FROM job_favorites f
            JOIN jobs j ON j.id = f.job_id
            WHERE f.user_id = #{userId}
              AND j.status = 'active'
            ORDER BY f.created_at DESC, f.id DESC
            """)
    List<JobRecord> findFavoriteJobs(@Param("userId") long userId);
}
