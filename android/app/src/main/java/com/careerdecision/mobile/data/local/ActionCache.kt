package com.careerdecision.mobile.data.local

import androidx.room.withTransaction
import com.careerdecision.mobile.network.ActionPlanSummary
import com.careerdecision.mobile.network.AssistantChatContext
import com.careerdecision.mobile.network.AssistantChatResponse
import com.careerdecision.mobile.network.ChatConversation
import com.careerdecision.mobile.network.ChatDeliveryStatus
import com.careerdecision.mobile.network.ChatMessage
import com.careerdecision.mobile.network.ChatMessageRole
import com.careerdecision.mobile.network.DashboardProject
import com.careerdecision.mobile.network.TodayResponse
import com.google.gson.Gson

data class CachedActionSnapshot(
    val goal: CachedGoalEntity?,
    val tasks: List<CachedTaskEntity>,
    val pendingCount: Int,
    val pendingReviewPlanId: Long?,
    val pendingReviewWeekNo: Int?
)

data class CachedChatRequest(
    val sessionId: Long?,
    val requestId: String,
    val page: String,
    val message: String,
    val context: AssistantChatContext
)

internal fun CachedGoalEntity.withTaskStatusTransition(
    previousStatus: String,
    newStatus: String
): CachedGoalEntity {
    val completionDelta = (if (newStatus == "completed") 1 else 0) -
        (if (previousStatus == "completed") 1 else 0)
    if (completionDelta == 0) return this
    val completed = (completedTaskCount + completionDelta).coerceIn(0, taskCount.coerceAtLeast(0))
    val progressPercent = if (taskCount <= 0) 0 else completed * 100 / taskCount
    return copy(completedTaskCount = completed, progressPercent = progressPercent)
}

interface ActionCache {
    suspend fun read(userId: Long): CachedActionSnapshot
    suspend fun replace(userId: Long, today: TodayResponse, plan: ActionPlanSummary?, project: DashboardProject? = null)
    suspend fun setTaskStatus(userId: Long, taskId: Long, status: String, reason: String?, deferredTo: String?)
    suspend fun incrementResultCount(userId: Long, taskId: Long)
    suspend fun enqueue(operation: PendingOperationEntity)
    suspend fun pending(userId: Long, limit: Int = 50): List<PendingOperationEntity>
    suspend fun deletePending(id: Long)
    suspend fun recordFailure(id: Long, message: String)
    suspend fun pendingCount(userId: Long): Int
    suspend fun readChat(userId: Long): ChatConversation
    suspend fun chatRequest(userId: Long, requestId: String): CachedChatRequest?
    suspend fun beginChatMessage(
        userId: Long,
        requestId: String,
        page: String,
        message: String,
        context: AssistantChatContext
    )
    suspend fun completeChatMessage(userId: Long, requestId: String, response: AssistantChatResponse)
    suspend fun failChatMessage(userId: Long, requestId: String, errorMessage: String)
    suspend fun resetChat(userId: Long)
    suspend fun clear(userId: Long)
}

class RoomActionCache(private val database: ActionDatabase) : ActionCache {
    private val dao = database.actionDao()
    private val gson = Gson()

    override suspend fun read(userId: Long): CachedActionSnapshot = database.withTransaction {
        val goal = dao.goal(userId)
        val pendingReview = goal?.planId?.let { dao.pendingWeeklyReview(userId, it) }
        CachedActionSnapshot(
            goal = goal,
            tasks = dao.tasks(userId),
            pendingCount = dao.pendingCount(userId),
            pendingReviewPlanId = pendingReview?.planId,
            pendingReviewWeekNo = pendingReview?.reviewWeekNo
        )
    }

    override suspend fun replace(userId: Long, today: TodayResponse, plan: ActionPlanSummary?, project: DashboardProject?) {
        database.withTransaction {
            dao.saveGoal(
                CachedGoalEntity(
                    userId = userId,
                    planId = today.planId ?: plan?.id,
                    projectId = today.projectId ?: plan?.projectId,
                    targetId = today.targetId ?: plan?.targetId,
                    targetRole = today.targetRole ?: plan?.targetRole,
                    status = plan?.status,
                    durationWeeks = plan?.durationWeeks ?: 0,
                    taskCount = plan?.taskCount ?: today.totalThisWeek,
                    completedTaskCount = plan?.completedTaskCount ?: today.completedThisWeek,
                    progressPercent = plan?.progressPercent ?: progress(today.completedThisWeek, today.totalThisWeek),
                    startDate = plan?.startDate,
                    endDate = plan?.endDate,
                    updatedAt = plan?.updatedAt ?: project?.updatedAt ?: today.serverTime,
                    backupTarget = project?.backupTarget,
                    decisionReason = project?.decisionReason,
                    mainRisks = project?.mainRisks,
                    reviewDate = project?.reviewDate,
                    confirmedAt = project?.confirmedAt,
                    evidenceCount = project?.evidenceCount ?: 0,
                    resultCount = project?.resultCount ?: 0,
                    currentWeek = today.weekNo.coerceAtLeast(1)
                )
            )
            dao.deleteTasks(userId)
            if (today.planId != null) {
                dao.saveTasks(today.tasks.map { task ->
                    CachedTaskEntity(
                        taskId = task.id,
                        userId = userId,
                        planId = today.planId,
                        weekNo = task.weekNo,
                        title = task.title,
                        taskType = task.taskType,
                        content = task.content,
                        status = task.status,
                        dueAt = task.dueAt,
                        estimatedMinutes = task.estimatedMinutes,
                        acceptanceCriteria = task.acceptanceCriteria,
                        deferredTo = task.deferredTo,
                        skipReason = task.skipReason,
                        resultCount = task.results.size,
                        sortOrder = task.sortOrder,
                        version = task.version,
                        updatedAt = task.updatedAt
                    )
                })
            }
        }
    }

    override suspend fun setTaskStatus(
        userId: Long,
        taskId: Long,
        status: String,
        reason: String?,
        deferredTo: String?
    ) {
        database.withTransaction {
            val previousStatus = dao.tasks(userId).firstOrNull { it.taskId == taskId }?.status
            dao.updateTaskStatus(userId, taskId, status, reason, deferredTo)
            if (previousStatus != null) {
                dao.goal(userId)?.let { goal ->
                    dao.saveGoal(goal.withTaskStatusTransition(previousStatus, status))
                }
            }
        }
    }

    override suspend fun incrementResultCount(userId: Long, taskId: Long) =
        dao.incrementResultCount(userId, taskId)

    override suspend fun enqueue(operation: PendingOperationEntity) {
        dao.enqueue(operation)
    }

    override suspend fun pending(userId: Long, limit: Int): List<PendingOperationEntity> = dao.pending(userId, limit)
    override suspend fun deletePending(id: Long) = dao.deletePending(id)
    override suspend fun recordFailure(id: Long, message: String) = dao.recordFailure(id, message.take(500))
    override suspend fun pendingCount(userId: Long): Int = dao.pendingCount(userId)

    override suspend fun readChat(userId: Long): ChatConversation {
        val session = dao.chatSession(userId)
        return ChatConversation(
            sessionId = session?.sessionId,
            messages = dao.chatMessages(userId).map { message ->
                ChatMessage(
                    requestId = message.requestId,
                    role = message.role,
                    content = message.content,
                    deliveryStatus = message.deliveryStatus,
                    response = message.responseJson?.let { json ->
                        runCatching { gson.fromJson(json, AssistantChatResponse::class.java) }.getOrNull()
                    },
                    errorMessage = message.errorMessage,
                    createdAt = message.createdAt
                )
            }
        )
    }

    override suspend fun chatRequest(userId: Long, requestId: String): CachedChatRequest? {
        val request = dao.chatRequest(userId, requestId) ?: return null
        val page = request.page ?: return null
        val context = request.contextJson?.let { json ->
            runCatching { gson.fromJson(json, AssistantChatContext::class.java) }.getOrNull()
        } ?: AssistantChatContext()
        return CachedChatRequest(
            sessionId = request.sessionId,
            requestId = request.requestId,
            page = page,
            message = request.content,
            context = context
        )
    }

    override suspend fun beginChatMessage(
        userId: Long,
        requestId: String,
        page: String,
        message: String,
        context: AssistantChatContext
    ) {
        database.withTransaction {
            val current = dao.chatSession(userId)
            dao.saveChatSession(
                CachedChatSessionEntity(
                    userId = userId,
                    sessionId = current?.sessionId,
                    page = page
                )
            )
            dao.insertChatMessage(
                CachedChatMessageEntity(
                    userId = userId,
                    requestId = requestId,
                    sessionId = current?.sessionId,
                    role = ChatMessageRole.USER,
                    content = message,
                    deliveryStatus = ChatDeliveryStatus.PENDING,
                    page = page,
                    contextJson = gson.toJson(context),
                    responseJson = null,
                    errorMessage = null
                )
            )
            dao.updateChatRequestStatus(userId, requestId, ChatDeliveryStatus.PENDING, null)
        }
    }

    override suspend fun completeChatMessage(
        userId: Long,
        requestId: String,
        response: AssistantChatResponse
    ) {
        database.withTransaction {
            val current = dao.chatSession(userId)
            val request = dao.chatRequest(userId, requestId)
            dao.saveChatSession(
                CachedChatSessionEntity(
                    userId = userId,
                    sessionId = response.sessionId,
                    page = request?.page ?: current?.page ?: DEFAULT_CHAT_PAGE
                )
            )
            dao.updateChatRequestStatus(userId, requestId, ChatDeliveryStatus.SENT, null)
            dao.insertChatMessage(
                CachedChatMessageEntity(
                    userId = userId,
                    requestId = requestId,
                    sessionId = response.sessionId,
                    role = ChatMessageRole.ASSISTANT,
                    content = response.reply,
                    deliveryStatus = ChatDeliveryStatus.SENT,
                    page = null,
                    contextJson = null,
                    responseJson = gson.toJson(response),
                    errorMessage = null
                )
            )
        }
    }

    override suspend fun failChatMessage(userId: Long, requestId: String, errorMessage: String) {
        dao.updateChatRequestStatus(
            userId,
            requestId,
            ChatDeliveryStatus.FAILED,
            errorMessage.take(500)
        )
    }

    override suspend fun resetChat(userId: Long) {
        database.withTransaction {
            dao.deleteChatMessages(userId)
            dao.deleteChatSession(userId)
        }
    }

    override suspend fun clear(userId: Long) {
        database.withTransaction {
            dao.deleteTasks(userId)
            dao.deleteGoal(userId)
            dao.deletePendingForUser(userId)
            dao.deleteChatMessages(userId)
            dao.deleteChatSession(userId)
        }
    }

    private fun progress(completed: Int, total: Int): Int = if (total <= 0) 0 else completed * 100 / total

    private companion object {
        const val DEFAULT_CHAT_PAGE = "/android/mentor"
    }
}
