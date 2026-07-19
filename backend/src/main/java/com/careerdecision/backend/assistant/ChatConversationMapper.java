package com.careerdecision.backend.assistant;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

@Mapper
public interface ChatConversationMapper {
    @Insert("""
            INSERT INTO chat_sessions (user_id, title, last_page)
            VALUES (#{userId}, #{title}, #{lastPage})
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    void insertSession(ChatSessionRecord record);

    @Select("""
            SELECT id, user_id, title, last_page, status, created_at, updated_at
            FROM chat_sessions
            WHERE id = #{sessionId} AND user_id = #{userId} AND status = 'active'
            LIMIT 1
            """)
    ChatSessionRecord findSession(@Param("userId") long userId, @Param("sessionId") long sessionId);

    @Select("""
            SELECT id, user_id, title, last_page, status, created_at, updated_at
            FROM chat_sessions
            WHERE id = #{sessionId} AND user_id = #{userId}
              AND status IN ('active', 'archived')
            LIMIT 1
            FOR UPDATE
            """)
    ChatSessionRecord findSessionForDelete(@Param("userId") long userId, @Param("sessionId") long sessionId);

    @Select("""
            SELECT session.id, session.user_id, session.title, session.last_page, session.status,
                   session.created_at, session.updated_at,
                   COUNT(message.id) AS message_count,
                   (
                     SELECT latest.content
                     FROM chat_messages latest
                     WHERE latest.session_id = session.id AND latest.user_id = #{userId}
                     ORDER BY latest.id DESC
                     LIMIT 1
                   ) AS last_message
            FROM chat_sessions session
            LEFT JOIN chat_messages message
              ON message.session_id = session.id AND message.user_id = #{userId}
            WHERE session.user_id = #{userId} AND session.status = 'active'
            GROUP BY session.id, session.user_id, session.title, session.last_page, session.status,
                     session.created_at, session.updated_at
            ORDER BY session.updated_at DESC, session.id DESC
            LIMIT #{limit}
            """)
    List<ChatSessionRecord> listSessions(@Param("userId") long userId, @Param("limit") int limit);

    @Select("""
            SELECT id, session_id, user_id, request_id, role, content,
                   agent_run_id, metadata_json, created_at
            FROM chat_messages
            WHERE session_id = #{sessionId} AND user_id = #{userId}
            ORDER BY id ASC
            """)
    List<ChatMessageRecord> listMessages(
            @Param("userId") long userId,
            @Param("sessionId") long sessionId
    );

    @Update("""
            UPDATE chat_sessions
            SET title = #{title}, updated_at = CURRENT_TIMESTAMP
            WHERE id = #{sessionId} AND user_id = #{userId} AND status = 'active'
            """)
    int renameSession(
            @Param("userId") long userId,
            @Param("sessionId") long sessionId,
            @Param("title") String title
    );

    /**
     * Redacts chat-only agent audit rows before the session's messages are
     * removed. Runs referenced by a durable business artifact are left intact
     * so deleting a chat cannot alter that artifact's audit history.
     */
    @Update("""
            UPDATE agent_runs
            SET input_json = #{redactedJson}, output_json = #{redactedJson},
                error_message = NULL, user_id = NULL
            WHERE agent_type = 'chat'
              AND (
                  id IN (
                      SELECT DISTINCT message.agent_run_id
                      FROM chat_messages message
                      WHERE message.session_id = #{sessionId}
                        AND message.user_id = #{userId}
                        AND message.agent_run_id IS NOT NULL
                  )
                  OR (
                      user_id = #{userId}
                      AND request_id IN (
                          SELECT message.request_id
                          FROM chat_messages message
                          WHERE message.session_id = #{sessionId}
                            AND message.user_id = #{userId}
                            AND message.request_id IS NOT NULL
                      )
                  )
              )
              AND NOT EXISTS (
                  SELECT 1 FROM chat_messages other_message
                  WHERE other_message.agent_run_id = agent_runs.id
                    AND other_message.session_id <> #{sessionId}
              )
              AND NOT EXISTS (SELECT 1 FROM path_plans plan WHERE plan.agent_run_id = agent_runs.id)
              AND NOT EXISTS (SELECT 1 FROM resume_analyses analysis WHERE analysis.agent_run_id = agent_runs.id)
              AND NOT EXISTS (SELECT 1 FROM reports report WHERE report.agent_run_id = agent_runs.id)
            """)
    int redactChatAgentRuns(
            @Param("userId") long userId,
            @Param("sessionId") long sessionId,
            @Param("redactedJson") String redactedJson
    );

    @Update("""
            UPDATE agent_runs
            SET input_json = #{redactedJson}, output_json = #{redactedJson},
                error_message = NULL, user_id = NULL
            WHERE agent_type = 'chat'
              AND (id = #{agentRunId} OR (user_id = #{userId} AND request_id = #{requestId}))
              AND (user_id = #{userId} OR user_id IS NULL)
              AND NOT EXISTS (
                  SELECT 1 FROM chat_messages message
                  WHERE message.agent_run_id = agent_runs.id
                     OR (message.user_id = #{userId} AND message.request_id = agent_runs.request_id)
              )
              AND NOT EXISTS (SELECT 1 FROM path_plans plan WHERE plan.agent_run_id = agent_runs.id)
              AND NOT EXISTS (SELECT 1 FROM resume_analyses analysis WHERE analysis.agent_run_id = agent_runs.id)
              AND NOT EXISTS (SELECT 1 FROM reports report WHERE report.agent_run_id = agent_runs.id)
            """)
    int redactDetachedChatAgentRun(
            @Param("userId") long userId,
            @Param("agentRunId") Long agentRunId,
            @Param("requestId") String requestId,
            @Param("redactedJson") String redactedJson
    );

    @Delete("""
            DELETE FROM chat_sessions
            WHERE id = #{sessionId} AND user_id = #{userId}
              AND status IN ('active', 'archived')
            """)
    int deleteSession(@Param("userId") long userId, @Param("sessionId") long sessionId);

    @Update("""
            UPDATE chat_sessions SET last_page = #{page}, updated_at = CURRENT_TIMESTAMP
            WHERE id = #{sessionId} AND user_id = #{userId} AND status = 'active'
            """)
    int touchSession(
            @Param("userId") long userId,
            @Param("sessionId") long sessionId,
            @Param("page") String page
    );

    @Insert("""
            INSERT INTO chat_messages (
              session_id, user_id, request_id, role, content, agent_run_id, metadata_json
            ) VALUES (
              #{sessionId}, #{userId}, #{requestId}, #{role}, #{content}, #{agentRunId}, #{metadataJson}
            )
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    void insertMessage(ChatMessageRecord record);

    @Select("""
            SELECT id, session_id, user_id, request_id, role, content,
                   agent_run_id, metadata_json, created_at
            FROM chat_messages
            WHERE user_id = #{userId} AND request_id = #{requestId} AND role = #{role}
            LIMIT 1
            """)
    ChatMessageRecord findByRequest(
            @Param("userId") long userId,
            @Param("requestId") String requestId,
            @Param("role") String role
    );

    @Select("""
            SELECT id, session_id, user_id, request_id, role, content,
                   agent_run_id, metadata_json, created_at
            FROM chat_messages
            WHERE session_id = #{sessionId} AND user_id = #{userId}
            ORDER BY id DESC
            LIMIT #{limit}
            """)
    List<ChatMessageRecord> listRecent(
            @Param("userId") long userId,
            @Param("sessionId") long sessionId,
            @Param("limit") int limit
    );
}
