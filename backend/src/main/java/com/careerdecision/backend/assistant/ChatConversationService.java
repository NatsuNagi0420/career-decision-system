package com.careerdecision.backend.assistant;

import com.careerdecision.backend.exception.BusinessException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class ChatConversationService {
    private static final int MAX_HISTORY_MESSAGES = 12;
    private static final int MAX_HISTORY_CONTENT = 1200;
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() { };

    private final ChatConversationMapper mapper;
    private final ObjectMapper objectMapper;

    public ChatConversationService(ChatConversationMapper mapper, ObjectMapper objectMapper) {
        this.mapper = mapper;
        this.objectMapper = objectMapper;
    }

    public String effectiveRequestId(String requestId) {
        return requestId == null || requestId.isBlank() ? UUID.randomUUID().toString() : requestId.trim();
    }

    @Transactional
    public PreparedConversation prepare(
            long userId,
            Long requestedSessionId,
            String page,
            String requestId,
            String message
    ) {
        ChatMessageRecord cachedAssistant = mapper.findByRequest(userId, requestId, "assistant");
        if (cachedAssistant != null) {
            verifyRequestedSession(requestedSessionId, cachedAssistant.getSessionId());
            return new PreparedConversation(
                    cachedAssistant.getSessionId(), requestId, List.of(), fromJson(cachedAssistant.getMetadataJson())
            );
        }

        ChatMessageRecord existingUserMessage = mapper.findByRequest(userId, requestId, "user");
        long sessionId;
        if (existingUserMessage != null) {
            sessionId = existingUserMessage.getSessionId();
            verifyRequestedSession(requestedSessionId, sessionId);
        } else if (requestedSessionId != null) {
            sessionId = requireSession(userId, requestedSessionId).getId();
        } else {
            sessionId = createSession(userId, page, message);
        }

        List<Map<String, Object>> history = recentHistory(userId, sessionId, requestId);
        if (existingUserMessage == null) {
            ChatMessageRecord userMessage = message(sessionId, userId, requestId, "user", message, null, null);
            try {
                mapper.insertMessage(userMessage);
            } catch (DuplicateKeyException ex) {
                ChatMessageRecord raced = mapper.findByRequest(userId, requestId, "user");
                if (raced == null) throw ex;
                verifyRequestedSession(sessionId, raced.getSessionId());
            }
        }
        mapper.touchSession(userId, sessionId, trim(page));
        return new PreparedConversation(sessionId, requestId, history, null);
    }

    @Transactional
    public void complete(long userId, long sessionId, String requestId, String page, Map<String, Object> response) {
        requireSession(userId, sessionId);
        if (mapper.findByRequest(userId, requestId, "assistant") != null) return;

        String reply = String.valueOf(response.getOrDefault("reply", "导师已返回结果。"));
        Long agentRunId = response.get("agentRunId") instanceof Number number ? number.longValue() : null;
        ChatMessageRecord assistant = message(
                sessionId, userId, requestId, "assistant", reply, agentRunId, toJson(response)
        );
        try {
            mapper.insertMessage(assistant);
        } catch (DuplicateKeyException ex) {
            if (mapper.findByRequest(userId, requestId, "assistant") == null) throw ex;
        }
        mapper.touchSession(userId, sessionId, trim(page));
    }

    private long createSession(long userId, String page, String message) {
        ChatSessionRecord session = new ChatSessionRecord();
        session.setUserId(userId);
        session.setTitle(limit(message.trim(), 80));
        session.setLastPage(trim(page));
        mapper.insertSession(session);
        return session.getId();
    }

    private ChatSessionRecord requireSession(long userId, long sessionId) {
        ChatSessionRecord session = mapper.findSession(userId, sessionId);
        if (session == null) throw new BusinessException(40490, "Chat session not found: " + sessionId);
        return session;
    }

    private void verifyRequestedSession(Long requestedSessionId, long actualSessionId) {
        if (requestedSessionId != null && requestedSessionId != actualSessionId) {
            throw new BusinessException(40990, "requestId belongs to another chat session.");
        }
    }

    private List<Map<String, Object>> recentHistory(long userId, long sessionId, String currentRequestId) {
        List<ChatMessageRecord> rows = new ArrayList<>(mapper.listRecent(userId, sessionId, MAX_HISTORY_MESSAGES + 2));
        Collections.reverse(rows);
        return rows.stream()
                .filter(row -> !currentRequestId.equals(row.getRequestId()))
                .limit(MAX_HISTORY_MESSAGES)
                .map(row -> Map.<String, Object>of(
                        "role", row.getRole(), "content", limit(row.getContent(), MAX_HISTORY_CONTENT)
                ))
                .toList();
    }

    private ChatMessageRecord message(
            long sessionId,
            long userId,
            String requestId,
            String role,
            String content,
            Long agentRunId,
            String metadataJson
    ) {
        ChatMessageRecord record = new ChatMessageRecord();
        record.setSessionId(sessionId);
        record.setUserId(userId);
        record.setRequestId(requestId);
        record.setRole(role);
        record.setContent(limit(content.trim(), 10000));
        record.setAgentRunId(agentRunId);
        record.setMetadataJson(metadataJson);
        return record;
    }

    private String toJson(Map<String, Object> value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            throw new BusinessException(50090, "Failed to serialize chat response.");
        }
    }

    private Map<String, Object> fromJson(String value) {
        if (value == null || value.isBlank()) return new LinkedHashMap<>();
        try {
            return new LinkedHashMap<>(objectMapper.readValue(value, MAP_TYPE));
        } catch (JsonProcessingException ex) {
            throw new BusinessException(50090, "Failed to read persisted chat response.");
        }
    }

    private String trim(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String limit(String value, int maxLength) {
        return value.length() <= maxLength ? value : value.substring(0, maxLength);
    }

    public record PreparedConversation(
            long sessionId,
            String requestId,
            List<Map<String, Object>> history,
            Map<String, Object> cachedResponse
    ) {
        public boolean cached() {
            return cachedResponse != null;
        }
    }
}
