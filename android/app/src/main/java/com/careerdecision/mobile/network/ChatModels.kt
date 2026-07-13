package com.careerdecision.mobile.network

data class AssistantChatContext(
    val routePath: String? = null,
    val tab: String? = null,
    val projectId: Long? = null,
    val candidateId: Long? = null,
    val currentCandidateId: Long? = null,
    val planId: Long? = null,
    val reviewId: Long? = null,
    val targetId: Long? = null,
    val jobId: Long? = null
)

data class AssistantChatRequest(
    val requestId: String,
    val sessionId: Long? = null,
    val page: String,
    val message: String,
    val context: AssistantChatContext = AssistantChatContext()
)

data class AssistantChatEvidence(
    val statement: String,
    val sourceRefs: List<String> = emptyList()
)

data class AssistantChatAction(
    val label: String,
    val action: String
)

data class AssistantChatResponse(
    val sessionId: Long,
    val generationMode: String,
    val modelName: String? = null,
    val confidence: Double,
    val reply: String,
    val responseMode: String? = null,
    val mode: String? = null,
    val usedPersonalContext: Boolean? = null,
    val evidenceBasis: List<AssistantChatEvidence> = emptyList(),
    val uncertainties: List<String> = emptyList(),
    val nextStep: String? = null,
    val actions: List<AssistantChatAction> = emptyList(),
    val intent: String? = null,
    val agentRunId: Long? = null
)

data class ChatMessage(
    val requestId: String,
    val role: String,
    val content: String,
    val deliveryStatus: String,
    val response: AssistantChatResponse? = null,
    val errorMessage: String? = null,
    val createdAt: Long
)

data class ChatConversation(
    val sessionId: Long?,
    val messages: List<ChatMessage>
)

data class ChatSendResult(
    val conversation: ChatConversation,
    val delivered: Boolean
)

object ChatMessageRole {
    const val USER = "user"
    const val ASSISTANT = "assistant"
}

object ChatDeliveryStatus {
    const val PENDING = "pending"
    const val SENT = "sent"
    const val FAILED = "failed"
}
