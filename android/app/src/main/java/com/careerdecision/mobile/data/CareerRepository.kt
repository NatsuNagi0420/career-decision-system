package com.careerdecision.mobile.data

import com.careerdecision.mobile.SessionGateway
import com.careerdecision.mobile.SessionSnapshot
import com.careerdecision.mobile.data.local.ActionCache
import com.careerdecision.mobile.data.local.CachedActionSnapshot
import com.careerdecision.mobile.data.local.PendingOperationEntity
import com.careerdecision.mobile.network.ActionCoachResponse
import com.careerdecision.mobile.network.ActionPlanDetail
import com.careerdecision.mobile.network.ActionTaskResultRequest
import com.careerdecision.mobile.network.ActionTaskStatusRequest
import com.careerdecision.mobile.network.ApiException
import com.careerdecision.mobile.network.AssistantChatContext
import com.careerdecision.mobile.network.AssistantChatRequest
import com.careerdecision.mobile.network.ChatConversation
import com.careerdecision.mobile.network.ChatDeliveryStatus
import com.careerdecision.mobile.network.ChatMessageRole
import com.careerdecision.mobile.network.ChatSendResult
import com.careerdecision.mobile.network.CoachingRequest
import com.careerdecision.mobile.network.ConfidenceFeedbackRequest
import com.careerdecision.mobile.network.DashboardResponse
import com.careerdecision.mobile.network.RegisterRequest
import com.careerdecision.mobile.network.UserInfo
import com.careerdecision.mobile.network.UserProfile
import com.careerdecision.mobile.network.UserProfileRequest
import com.careerdecision.mobile.network.WeeklyReviewRequest
import com.careerdecision.mobile.network.normalizeNetworkError
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.LocalDateTime
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

data class RepositorySnapshot(
    val user: UserInfo,
    val cache: CachedActionSnapshot,
    val dashboard: DashboardResponse? = null,
    val online: Boolean,
    val fullProfile: UserProfile? = null,
    val planDetail: ActionPlanDetail? = null
)

data class MutationResult(
    val snapshot: RepositorySnapshot,
    val synced: Boolean
)

class PendingOperationsException(val pendingCount: Int) : IllegalStateException(
    "仍有 $pendingCount 项操作尚未同步，请联网同步后再退出登录"
)

interface PendingSyncScheduler {
    fun schedule()
}

interface CareerRepositoryGateway {
    fun currentSession(): SessionSnapshot?
    suspend fun cached(): RepositorySnapshot?
    suspend fun login(username: String, password: String): RepositorySnapshot
    suspend fun register(
        username: String,
        password: String,
        confirmPassword: String,
        email: String? = null,
        phone: String? = null
    ): RepositorySnapshot
    suspend fun logout()
    suspend fun refresh(): RepositorySnapshot
    suspend fun loadProfile(): UserProfile
    suspend fun saveProfile(request: UserProfileRequest): UserProfile
    suspend fun loadCurrentPlanDetail(): ActionPlanDetail?
    suspend fun updateTask(
        planId: Long,
        taskId: Long,
        expectedVersion: Int,
        status: String,
        reason: String? = null,
        deferredTo: String? = null,
        resultDescription: String? = null,
        resultLink: String? = null
    ): MutationResult
    suspend fun addTaskResult(
        planId: Long,
        taskId: Long,
        description: String,
        linkUrl: String? = null
    ): MutationResult
    suspend fun syncPendingOperations(): Boolean
    suspend fun requestActionCoach(focus: String?): ActionCoachResponse
    suspend fun loadChatConversation(): ChatConversation
    suspend fun sendChatMessage(
        message: String,
        page: String = DEFAULT_CHAT_PAGE,
        context: AssistantChatContext = AssistantChatContext()
    ): ChatSendResult
    suspend fun retryChatMessage(requestId: String): ChatSendResult
    suspend fun startNewChatConversation(): ChatConversation
    suspend fun submitGoalConfidence(
        projectId: Long,
        targetId: Long,
        trend: String,
        reason: String
    ): MutationResult
    suspend fun submitWeeklyReview(
        planId: Long,
        weekNo: Int,
        completedSummary: String,
        evidenceSummary: String?,
        difficulties: String?,
        nextWeekMinutes: Int?,
        confidenceTrend: String,
        confidenceReason: String?
    ): MutationResult

    companion object {
        const val DEFAULT_CHAT_PAGE = "/android/mentor"
    }
}

class CareerRepository(
    private val sessionStore: SessionGateway,
    private val remote: CareerRemoteDataSource,
    private val cache: ActionCache,
    private val scheduler: PendingSyncScheduler
) : CareerRepositoryGateway {
    @Volatile private var session: SessionSnapshot? = sessionStore.load()
    private val sessionMutationLock = Any()
    private val refreshMutex = Mutex()
    private val chatMutex = Mutex()
    private val activeChatRequestIds = ConcurrentHashMap.newKeySet<String>()

    override fun currentSession(): SessionSnapshot? = session

    override suspend fun cached(): RepositorySnapshot? {
        val current = session ?: return null
        return RepositorySnapshot(current.user, cache.read(current.user.id), online = false)
    }

    override suspend fun login(username: String, password: String): RepositorySnapshot {
        val cleanUsername = username.trim()
        require(cleanUsername.isNotBlank()) { "请输入用户名" }
        require(password.isNotBlank()) { "请输入密码" }
        val response = remote.login(cleanUsername, password)
        saveSession(response.token, response.refreshToken, response.user)
        return refresh()
    }

    override suspend fun register(
        username: String,
        password: String,
        confirmPassword: String,
        email: String?,
        phone: String?
    ): RepositorySnapshot {
        val cleanUsername = username.trim()
        require(cleanUsername.isNotBlank()) { "请输入用户名" }
        require(password.isNotBlank()) { "请输入密码" }
        require(password == confirmPassword) { "两次输入的密码不一致" }
        remote.register(
            RegisterRequest(
                username = cleanUsername,
                password = password,
                confirmPassword = confirmPassword,
                email = email?.trim()?.takeIf { it.isNotBlank() },
                phone = phone?.trim()?.takeIf { it.isNotBlank() }
            )
        )
        val response = remote.login(cleanUsername, password)
        saveSession(response.token, response.refreshToken, response.user)
        return refresh()
    }

    override suspend fun logout() {
        val current = session
        if (current != null) {
            val pendingCount = cache.pendingCount(current.user.id)
            if (pendingCount > 0) throw PendingOperationsException(pendingCount)
            try {
                authenticated { remote.logout() }
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                // The local session can still be closed when the server is unreachable.
            }
            cache.clear(current.user.id)
        }
        clearSession()
    }

    override suspend fun refresh(): RepositorySnapshot {
        val current = requireSession()
        syncPendingOperations()
        val dashboard = authenticated { remote.dashboard() }
        val today = authenticated { remote.today() }
        val plans = authenticated { remote.actionPlans() }
        val plan = plans.firstOrNull { it.id == today.planId }
            ?: plans.firstOrNull { it.status == "active" }
            ?: plans.firstOrNull()
        val profile = authenticated { remote.profile() }
        val planDetail = plan?.let { authenticated { remote.actionPlan(it.id) } }
        cache.replace(current.user.id, today, plan, dashboard.currentProject)
        return RepositorySnapshot(
            user = current.user,
            cache = cache.read(current.user.id),
            dashboard = dashboard,
            online = true,
            fullProfile = profile,
            planDetail = planDetail
        )
    }

    override suspend fun loadProfile(): UserProfile = authenticated { remote.profile() }

    override suspend fun saveProfile(request: UserProfileRequest): UserProfile =
        authenticated { remote.saveProfile(request) }

    override suspend fun loadCurrentPlanDetail(): ActionPlanDetail? {
        val current = requireSession()
        val cachedPlanId = cache.read(current.user.id).goal?.planId
        val planId = cachedPlanId ?: authenticated {
            val plans = remote.actionPlans()
            plans.firstOrNull { it.status == "active" }?.id ?: plans.firstOrNull()?.id
        }
        return planId?.let { authenticated { remote.actionPlan(it) } }
    }

    override suspend fun updateTask(
        planId: Long,
        taskId: Long,
        expectedVersion: Int,
        status: String,
        reason: String?,
        deferredTo: String?,
        resultDescription: String?,
        resultLink: String?
    ): MutationResult {
        validateTaskMutation(status, reason, deferredTo)
        val current = requireSession()
        cache.setTaskStatus(current.user.id, taskId, status, reason?.trim(), deferredTo)
        cache.enqueue(
            PendingOperationEntity(
                operationId = operationId("status"),
                userId = current.user.id,
                planId = planId,
                taskId = taskId,
                operationType = OPERATION_STATUS,
                expectedVersion = expectedVersion,
                taskStatus = status,
                reason = reason?.trim()?.takeIf { it.isNotBlank() },
                deferredTo = deferredTo
            )
        )
        val cleanDescription = resultDescription?.trim()?.takeIf { it.isNotBlank() }
        if (cleanDescription != null) {
            cache.incrementResultCount(current.user.id, taskId)
            cache.enqueue(
                PendingOperationEntity(
                    operationId = operationId("result"),
                    userId = current.user.id,
                    planId = planId,
                    taskId = taskId,
                    operationType = OPERATION_RESULT,
                    description = cleanDescription,
                    linkUrl = resultLink?.trim()?.takeIf { it.isNotBlank() }
                )
            )
        }
        scheduler.schedule()
        val synced = syncPendingOperations()
        val snapshot = if (synced) {
            refreshOrCached()
        } else {
            requireNotNull(cached())
        }
        return MutationResult(snapshot, synced)
    }

    override suspend fun addTaskResult(
        planId: Long,
        taskId: Long,
        description: String,
        linkUrl: String?
    ): MutationResult {
        val cleanDescription = description.trim()
        require(cleanDescription.isNotBlank()) { "请填写成果说明" }
        require(cleanDescription.length <= 5000) { "成果说明最多 5000 个字" }
        val cleanLink = linkUrl?.trim()?.takeIf { it.isNotBlank() }
        require(cleanLink == null || cleanLink.length <= 1000) { "成果链接最多 1000 个字" }

        val current = requireSession()
        cache.incrementResultCount(current.user.id, taskId)
        cache.enqueue(
            PendingOperationEntity(
                operationId = operationId("result"),
                userId = current.user.id,
                planId = planId,
                taskId = taskId,
                operationType = OPERATION_RESULT,
                description = cleanDescription,
                linkUrl = cleanLink
            )
        )
        scheduler.schedule()
        val synced = syncPendingOperations()
        val snapshot = if (synced) {
            refreshOrCached()
        } else {
            requireNotNull(cached())
        }
        return MutationResult(snapshot, synced)
    }

    override suspend fun syncPendingOperations(): Boolean {
        val current = session ?: return true
        while (true) {
            val operations = cache.pending(current.user.id)
            if (operations.isEmpty()) return true
            for (operation in operations) {
                try {
                    when (operation.operationType) {
                        OPERATION_STATUS -> authenticated {
                            remote.updateTaskStatus(
                                operation.planId,
                                operation.taskId,
                                ActionTaskStatusRequest(
                                    status = requireNotNull(operation.taskStatus),
                                    reason = operation.reason,
                                    deferredTo = operation.deferredTo,
                                    requestId = operation.operationId,
                                    expectedVersion = requireNotNull(operation.expectedVersion)
                                )
                            )
                        }
                        OPERATION_RESULT -> authenticated {
                            remote.addTaskResult(
                                operation.planId,
                                operation.taskId,
                                ActionTaskResultRequest(
                                    description = requireNotNull(operation.description),
                                    linkUrl = operation.linkUrl,
                                    requestId = operation.operationId
                                )
                            )
                        }
                        OPERATION_CONFIDENCE -> authenticated {
                            remote.submitConfidenceFeedback(
                                operation.planId,
                                operation.taskId,
                                ConfidenceFeedbackRequest(
                                    requestId = operation.operationId,
                                    trend = requireNotNull(operation.taskStatus),
                                    reason = requireNotNull(operation.reason)
                                )
                            )
                        }
                        OPERATION_REVIEW -> authenticated {
                            remote.submitWeeklyReview(
                                WeeklyReviewRequest(
                                    requestId = operation.operationId,
                                    planId = operation.planId,
                                    weekNo = requireNotNull(operation.reviewWeekNo),
                                    completedSummary = operation.completedSummary,
                                    evidenceSummary = operation.evidenceSummary,
                                    difficulties = operation.difficulties,
                                    nextWeekMinutes = operation.nextWeekMinutes,
                                    confidenceTrend = operation.confidenceTrend,
                                    confidenceReason = operation.confidenceReason
                                )
                            )
                        }
                        else -> error("未知的离线操作类型：${operation.operationType}")
                    }
                    cache.deletePending(operation.id)
                } catch (error: Throwable) {
                    if (error is CancellationException) throw error
                    val normalized = normalizeNetworkError(error)
                    if (normalized.isUnauthorized()) throw normalized
                    if (normalized.apiCode == TASK_CONFLICT_CODE) {
                        cache.deletePending(operation.id)
                        throw ApiException(
                            "任务已在其他设备更新，请刷新后确认再重试",
                            apiCode = normalized.apiCode,
                            httpStatus = normalized.httpStatus,
                            traceId = normalized.traceId,
                            cause = normalized
                        )
                    }
                    if (normalized.httpStatus == 409) {
                        cache.deletePending(operation.id)
                        throw normalized
                    }
                    cache.recordFailure(operation.id, normalized.message ?: "同步失败")
                    scheduler.schedule()
                    return false
                }
            }
        }
    }

    override suspend fun requestActionCoach(focus: String?): ActionCoachResponse {
        val current = requireSession()
        val planId = cache.read(current.user.id).goal?.planId
            ?: throw IllegalStateException("请先在 Web 端确认目标并生成行动计划")
        return authenticated {
            remote.coachActionPlan(
                planId,
                CoachingRequest(operationId("coach"), focus?.trim()?.takeIf { it.isNotBlank() })
            )
        }
    }

    override suspend fun loadChatConversation(): ChatConversation {
        val current = requireSession()
        return recoverInterruptedChat(cache.readChat(current.user.id))
    }

    override suspend fun sendChatMessage(
        message: String,
        page: String,
        context: AssistantChatContext
    ): ChatSendResult = chatMutex.withLock {
        val current = requireSession()
        val cleanMessage = message.trim()
        val cleanPage = page.trim()
        require(cleanMessage.isNotBlank()) { "请输入想讨论的问题" }
        require(cleanMessage.length <= 4000) { "消息最多 4000 个字" }
        require(cleanPage.isNotBlank() && cleanPage.length <= 80) { "导师上下文页面无效" }

        val conversation = cache.readChat(current.user.id)
        val answeredRequestIds = conversation.messages.asSequence()
            .filter { it.role == ChatMessageRole.ASSISTANT }
            .map { it.requestId }
            .toSet()
        require(conversation.messages.none {
            it.role == ChatMessageRole.USER && it.requestId !in answeredRequestIds
        }) { "请先重试未完成的消息，或开始新会话" }

        val goal = cache.read(current.user.id).goal
        val effectiveContext = context.copy(
            routePath = context.routePath ?: cleanPage,
            projectId = context.projectId ?: goal?.projectId,
            planId = context.planId ?: goal?.planId,
            targetId = context.targetId ?: goal?.targetId
        )
        val requestId = operationId("chat")
        cache.beginChatMessage(current.user.id, requestId, cleanPage, cleanMessage, effectiveContext)
        activeChatRequestIds += requestId
        try {
            deliverChatMessage(current.user.id, requestId)
        } finally {
            activeChatRequestIds -= requestId
        }
    }

    override suspend fun retryChatMessage(requestId: String): ChatSendResult = chatMutex.withLock {
        val current = requireSession()
        val cleanRequestId = requestId.trim()
        require(cleanRequestId.isNotBlank()) { "缺少可重试的消息标识" }

        val conversation = cache.readChat(current.user.id)
        if (conversation.messages.any {
                it.requestId == cleanRequestId && it.role == ChatMessageRole.ASSISTANT
            }) {
            return@withLock ChatSendResult(conversation, delivered = true)
        }
        val request = cache.chatRequest(current.user.id, cleanRequestId)
            ?: throw IllegalArgumentException("这条消息已经无法重试，请重新发送")
        cache.beginChatMessage(
            userId = current.user.id,
            requestId = request.requestId,
            page = request.page,
            message = request.message,
            context = request.context
        )
        activeChatRequestIds += request.requestId
        try {
            deliverChatMessage(current.user.id, request.requestId)
        } finally {
            activeChatRequestIds -= request.requestId
        }
    }

    override suspend fun startNewChatConversation(): ChatConversation = chatMutex.withLock {
        val current = requireSession()
        cache.resetChat(current.user.id)
        cache.readChat(current.user.id)
    }

    override suspend fun submitGoalConfidence(
        projectId: Long,
        targetId: Long,
        trend: String,
        reason: String
    ): MutationResult {
        require(trend in CONFIDENCE_TRENDS) { "不支持的信心变化" }
        val cleanReason = reason.trim()
        require(cleanReason.isNotBlank()) { "请填写信心变化原因" }
        val current = requireSession()
        cache.enqueue(
            PendingOperationEntity(
                operationId = operationId("confidence"),
                userId = current.user.id,
                planId = projectId,
                taskId = targetId,
                operationType = OPERATION_CONFIDENCE,
                taskStatus = trend,
                reason = cleanReason
            )
        )
        scheduler.schedule()
        val synced = syncPendingOperations()
        val snapshot = if (synced) {
            refreshOrCached()
        } else {
            requireNotNull(cached())
        }
        return MutationResult(snapshot, synced)
    }

    override suspend fun submitWeeklyReview(
        planId: Long,
        weekNo: Int,
        completedSummary: String,
        evidenceSummary: String?,
        difficulties: String?,
        nextWeekMinutes: Int?,
        confidenceTrend: String,
        confidenceReason: String?
    ): MutationResult {
        require(weekNo in 1..12) { "复盘周次不正确" }
        val cleanCompleted = completedSummary.trim()
        val cleanEvidence = evidenceSummary?.trim()?.takeIf { it.isNotBlank() }
        val cleanDifficulties = difficulties?.trim()?.takeIf { it.isNotBlank() }
        require(cleanCompleted.isNotBlank() || cleanEvidence != null || cleanDifficulties != null) {
            "请至少填写一项本周复盘"
        }
        require(nextWeekMinutes == null || nextWeekMinutes in 0..10080) { "下周投入时间不正确" }
        require(confidenceTrend in CONFIDENCE_TRENDS) { "不支持的信心变化" }
        val current = requireSession()
        cache.enqueue(
            PendingOperationEntity(
                operationId = operationId("review"),
                userId = current.user.id,
                planId = planId,
                taskId = 0,
                operationType = OPERATION_REVIEW,
                reviewWeekNo = weekNo,
                completedSummary = cleanCompleted.takeIf { it.isNotBlank() },
                evidenceSummary = cleanEvidence,
                difficulties = cleanDifficulties,
                nextWeekMinutes = nextWeekMinutes,
                confidenceTrend = confidenceTrend,
                confidenceReason = confidenceReason?.trim()?.takeIf { it.isNotBlank() }
            )
        )
        scheduler.schedule()
        val synced = syncPendingOperations()
        val snapshot = if (synced) {
            refreshOrCached()
        } else {
            requireNotNull(cached())
        }
        return MutationResult(snapshot, synced)
    }

    private suspend fun <T> authenticated(block: suspend () -> T): T {
        val requestSession = requireSession()
        try {
            return block()
        } catch (error: Throwable) {
            if (error is CancellationException) throw error
            val normalized = normalizeNetworkError(error)
            if (!normalized.isUnauthorized()) throw normalized
            return refreshMutex.withLock {
                val current = requireSession()
                if (current.sameCredentialsAs(requestSession)) {
                    val refreshed = try {
                        remote.refresh(current.refreshToken)
                    } catch (refreshError: Throwable) {
                        if (refreshError is CancellationException) throw refreshError
                        val refreshFailure = normalizeNetworkError(refreshError)
                        if (refreshFailure.isUnauthorized()) clearSessionIfCurrent(current)
                        throw refreshFailure
                    }
                    replaceSessionIfCurrent(
                        expected = current,
                        token = refreshed.token,
                        refreshToken = refreshed.refreshToken,
                        user = refreshed.user
                    )
                    requireSession()
                }
                try {
                    block()
                } catch (retryError: Throwable) {
                    if (retryError is CancellationException) throw retryError
                    throw normalizeNetworkError(retryError)
                }
            }
        }
    }

    private suspend fun refreshOrCached(): RepositorySnapshot = try {
        refresh()
    } catch (error: CancellationException) {
        throw error
    } catch (error: Throwable) {
        cached() ?: throw error
    }

    private suspend fun deliverChatMessage(userId: Long, requestId: String): ChatSendResult {
        val request = requireNotNull(cache.chatRequest(userId, requestId))
        return try {
            val response = authenticated {
                remote.sendChatMessage(
                    AssistantChatRequest(
                        requestId = request.requestId,
                        sessionId = request.sessionId,
                        page = request.page,
                        message = request.message,
                        context = request.context
                    )
                )
            }
            cache.completeChatMessage(userId, request.requestId, response)
            ChatSendResult(cache.readChat(userId), delivered = true)
        } catch (error: Throwable) {
            if (error is CancellationException) throw error
            val normalized = normalizeNetworkError(error)
            cache.failChatMessage(
                userId,
                request.requestId,
                normalized.message ?: "导师暂时无法回复"
            )
            if (!normalized.isRetryableChatFailure()) throw normalized
            ChatSendResult(cache.readChat(userId), delivered = false)
        }
    }

    private fun recoverInterruptedChat(conversation: ChatConversation): ChatConversation =
        conversation.copy(
            messages = conversation.messages.map { message ->
                if (message.role == ChatMessageRole.USER &&
                    message.deliveryStatus == ChatDeliveryStatus.PENDING &&
                    message.requestId !in activeChatRequestIds
                ) {
                    message.copy(
                        deliveryStatus = ChatDeliveryStatus.FAILED,
                        errorMessage = message.errorMessage ?: "上次发送已中断，请重试"
                    )
                } else {
                    message
                }
            }
        )

    private fun requireSession(): SessionSnapshot = session
        ?: throw ApiException("请先登录", apiCode = 401, httpStatus = 401)

    private fun saveSession(token: String, refreshToken: String, user: UserInfo) {
        synchronized(sessionMutationLock) {
            sessionStore.save(token, refreshToken, user)
            session = SessionSnapshot(token, refreshToken, user)
        }
    }

    private fun replaceSessionIfCurrent(
        expected: SessionSnapshot,
        token: String,
        refreshToken: String,
        user: UserInfo
    ): Boolean = synchronized(sessionMutationLock) {
        if (session?.sameCredentialsAs(expected) != true) return@synchronized false
        sessionStore.save(token, refreshToken, user)
        session = SessionSnapshot(token, refreshToken, user)
        true
    }

    private fun clearSessionIfCurrent(expected: SessionSnapshot): Boolean = synchronized(sessionMutationLock) {
        if (session?.sameCredentialsAs(expected) != true) return@synchronized false
        sessionStore.clear()
        session = null
        true
    }

    private fun clearSession() {
        synchronized(sessionMutationLock) {
            sessionStore.clear()
            session = null
        }
    }

    private fun validateTaskMutation(status: String, reason: String?, deferredTo: String?) {
        require(status in TASK_STATUSES) { "不支持的任务状态" }
        if (status == "deferred") {
            require(!deferredTo.isNullOrBlank()) { "延期任务需要选择新时间" }
        }
        if (status == "deferred" || status == "skipped") {
            require(!reason.isNullOrBlank()) { "延期或跳过任务需要填写原因" }
        }
        if (!deferredTo.isNullOrBlank()) {
            runCatching { LocalDateTime.parse(deferredTo) }
                .getOrElse { throw IllegalArgumentException("延期时间格式不正确") }
        }
    }

    private fun ApiException.isUnauthorized(): Boolean = httpStatus == 401 || apiCode == 401
    private fun ApiException.isRetryableChatFailure(): Boolean =
        !isUnauthorized() && (httpStatus == null || httpStatus == 408 || httpStatus == 429 || httpStatus >= 500)
    private fun SessionSnapshot.sameCredentialsAs(other: SessionSnapshot): Boolean =
        token == other.token && refreshToken == other.refreshToken && user.id == other.user.id
    private fun operationId(kind: String): String = "android-$kind-${UUID.randomUUID()}"

    private companion object {
        const val OPERATION_STATUS = "task_status"
        const val OPERATION_RESULT = "task_result"
        const val OPERATION_CONFIDENCE = "target_confidence"
        const val OPERATION_REVIEW = "weekly_review"
        const val TASK_CONFLICT_CODE = 40962
        val TASK_STATUSES = setOf("todo", "in_progress", "completed", "deferred", "skipped")
        val CONFIDENCE_TRENDS = setOf("increased", "stable", "decreased")
    }
}
