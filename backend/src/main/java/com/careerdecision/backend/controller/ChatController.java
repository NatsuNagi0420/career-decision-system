package com.careerdecision.backend.controller;

import com.careerdecision.backend.common.ApiResponse;
import com.careerdecision.backend.assistant.AssistantContextService;
import com.careerdecision.backend.assistant.ChatConversationService;
import com.careerdecision.backend.assistant.ChatConversationService.PreparedConversation;
import com.careerdecision.backend.dto.ChatMessageRequest;
import com.careerdecision.backend.dto.RenameChatSessionRequest;
import com.careerdecision.backend.exception.BusinessException;
import com.careerdecision.backend.service.AgentServerClient;
import com.careerdecision.backend.profile.UserProfileService;
import com.careerdecision.backend.user.CurrentUser;
import com.careerdecision.backend.user.UserInfo;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.LinkedHashMap;
import java.util.List;

@RestController
@RequestMapping("/api/v1/chat")
public class ChatController {
    private final AgentServerClient agentServerClient;
    private final UserProfileService userProfileService;
    private final AssistantContextService assistantContextService;
    private final ChatConversationService chatConversationService;

    public ChatController(
            AgentServerClient agentServerClient,
            UserProfileService userProfileService,
            AssistantContextService assistantContextService,
            ChatConversationService chatConversationService
    ) {
        this.agentServerClient = agentServerClient;
        this.userProfileService = userProfileService;
        this.assistantContextService = assistantContextService;
        this.chatConversationService = chatConversationService;
    }

    @GetMapping("/sessions")
    public ApiResponse<List<ChatConversationService.SessionSummary>> sessions(
            @CurrentUser UserInfo user
    ) {
        return ApiResponse.success(chatConversationService.listSessions(user.id()));
    }

    @GetMapping("/sessions/{sessionId}")
    public ApiResponse<ChatConversationService.SessionDetail> session(
            @CurrentUser UserInfo user,
            @PathVariable long sessionId
    ) {
        return ApiResponse.success(chatConversationService.getSession(user.id(), sessionId));
    }

    @PatchMapping("/sessions/{sessionId}")
    public ApiResponse<ChatConversationService.SessionSummary> renameSession(
            @CurrentUser UserInfo user,
            @PathVariable long sessionId,
            @Valid @RequestBody RenameChatSessionRequest request
    ) {
        return ApiResponse.success(chatConversationService.renameSession(user.id(), sessionId, request.title()));
    }

    @DeleteMapping("/sessions/{sessionId}")
    public ApiResponse<Map<String, Object>> deleteSession(
            @CurrentUser UserInfo user,
            @PathVariable long sessionId
    ) {
        chatConversationService.deleteSession(user.id(), sessionId);
        return ApiResponse.success(Map.of("sessionId", sessionId, "deleted", true));
    }

    @PostMapping("/messages")
    public ApiResponse<Map<String, Object>> send(
            @CurrentUser UserInfo user,
            @Valid @RequestBody ChatMessageRequest request
    ) {
        String requestId = chatConversationService.effectiveRequestId(request.requestId());
        PreparedConversation conversation = chatConversationService.prepare(
                user.id(), request.sessionId(), request.page(), requestId, request.message()
        );
        if (conversation.cached()) {
            Map<String, Object> cached = new LinkedHashMap<>(conversation.cachedResponse());
            cached.put("sessionId", conversation.sessionId());
            return ApiResponse.success(cached, requestId);
        }

        Map<String, Object> payload = request.toAgentPayload(user.id(), requestId);
        payload.put("allow_external_model", userProfileService.allowsExternalAi(user.id()));
        Map<String, Object> context = new LinkedHashMap<>(
                assistantContextService.build(user, request.page(), request.context())
        );
        context.put("conversationHistory", conversation.history());
        payload.put("context", context);

        Map<String, Object> response = new LinkedHashMap<>(agentServerClient.sendChatMessage(payload));
        response.put("sessionId", conversation.sessionId());
        boolean completed = chatConversationService.complete(
                user.id(), conversation.sessionId(), requestId, request.page(), response
        );
        if (!completed) {
            throw new BusinessException(40490, "Chat session not found: " + conversation.sessionId());
        }
        return ApiResponse.success(response, requestId);
    }
}
