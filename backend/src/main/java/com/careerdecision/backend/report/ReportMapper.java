package com.careerdecision.backend.report;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

@Mapper
public interface ReportMapper {
    @Select("""
            SELECT COUNT(1)
            FROM users
            WHERE id = #{userId}
              AND deleted = 0
            """)
    int countActiveUser(@Param("userId") long userId);

    @Insert("""
            INSERT INTO reports (user_id, agent_run_id, type, title, summary, content_json, deleted)
            VALUES (#{userId}, #{agentRunId}, #{type}, #{title}, #{summary}, #{contentJson}, 0)
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    void insert(ReportRecord report);

    @Select("""
            SELECT id, user_id, agent_run_id, type, title, summary, content_json, created_at, updated_at
            FROM reports
            WHERE id = #{id}
              AND user_id = #{userId}
              AND deleted = 0
            LIMIT 1
            """)
    ReportRecord findByIdAndUserId(@Param("userId") long userId, @Param("id") long id);

    @Select("""
            <script>
            SELECT COUNT(1)
            FROM reports
            WHERE deleted = 0
              AND user_id = #{userId}
            <if test="type != null and type != ''">
              AND type = #{type}
            </if>
            </script>
            """)
    long count(
            @Param("userId") long userId,
            @Param("type") String type
    );

    @Select("""
            <script>
            SELECT id, user_id, agent_run_id, type, title, summary, content_json, created_at, updated_at
            FROM reports
            WHERE deleted = 0
              AND user_id = #{userId}
            <if test="type != null and type != ''">
              AND type = #{type}
            </if>
            ORDER BY created_at DESC, id DESC
            LIMIT #{size} OFFSET #{offset}
            </script>
            """)
    List<ReportRecord> list(
            @Param("userId") long userId,
            @Param("type") String type,
            @Param("offset") int offset,
            @Param("size") int size
    );

    @Update("""
            UPDATE reports
            SET deleted = 1
            WHERE id = #{id}
              AND user_id = #{userId}
              AND deleted = 0
            """)
    int softDelete(@Param("userId") long userId, @Param("id") long id);
}
