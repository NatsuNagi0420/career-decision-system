package com.careerdecision.backend.assistant;

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
