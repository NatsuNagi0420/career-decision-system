package com.careerdecision.backend.agent;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface AgentRunMapper {
    @Insert("""
            INSERT INTO agent_runs (
              request_id, user_id, agent_type, model_name, status,
              input_json, output_json, error_message, latency_ms,
              started_at, finished_at
            )
            VALUES (
              #{requestId}, #{userId}, #{agentType}, #{modelName}, #{status},
              #{inputJson}, #{outputJson}, #{errorMessage}, #{latencyMs},
              #{startedAt}, #{finishedAt}
            )
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    void insert(AgentRunRecord record);

    @Select("""
            SELECT id, request_id, user_id, agent_type, model_name, status,
                   input_json, output_json, error_message, latency_ms,
                   started_at, finished_at
            FROM agent_runs
            WHERE request_id = #{requestId}
            LIMIT 1
            """)
    AgentRunRecord findByRequestId(@Param("requestId") String requestId);

    @Update("""
            UPDATE agent_runs
            SET model_name = #{modelName}, status = 'success', output_json = #{outputJson},
                error_message = NULL, latency_ms = #{latencyMs}, finished_at = #{finishedAt}
            WHERE id = #{id}
            """)
    int upgradeToSuccess(AgentRunRecord record);

    @Select("""
            SELECT COUNT(1)
            FROM agent_runs
            WHERE id = #{id}
              AND agent_type = #{agentType}
              AND (user_id = #{userId} OR user_id IS NULL)
            """)
    int countLinkable(
            @Param("id") long id,
            @Param("userId") long userId,
            @Param("agentType") String agentType
    );
}
