package com.careerdecision.backend.controller;

import com.careerdecision.backend.common.ApiResponse;
import com.careerdecision.backend.assistant.AssistantContextService;
import com.careerdecision.backend.assistant.ChatConversationService;
import com.careerdecision.backend.assistant.ChatConversationService.PreparedConversation;
import com.careerdecision.backend.dto.ChatMessageRequest;
import com.careerdecision.backend.service.AgentServerClient;
import com.careerdecision.backend.profile.UserProfileService;
import com.careerdecision.backend.user.CurrentUser;
import com.careerdecision.backend.user.UserInfo;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.LinkedHashMap;

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
        chatConversationService.complete(
                user.id(), conversation.sessionId(), requestId, request.page(), response
        );
        return ApiResponse.success(response, requestId);
    }
}
