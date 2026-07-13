package com.careerdecision.mobile.data

import com.careerdecision.mobile.SessionGateway
import com.careerdecision.mobile.SessionSnapshot
import com.careerdecision.mobile.data.local.ActionCache
import com.careerdecision.mobile.data.local.CachedActionSnapshot
import com.careerdecision.mobile.data.local.CachedChatRequest
import com.careerdecision.mobile.data.local.CachedGoalEntity
import com.careerdecision.mobile.data.local.CachedTaskEntity
import com.careerdecision.mobile.data.local.PendingOperationEntity
import com.careerdecision.mobile.data.local.withTaskStatusTransition
import com.careerdecision.mobile.network.ActionCoachResponse
import com.careerdecision.mobile.network.ActionPlanDetail
import com.careerdecision.mobile.network.ActionPlanSummary
import com.careerdecision.mobile.network.ActionTask
import com.careerdecision.mobile.network.ActionTaskResultRequest
import com.careerdecision.mobile.network.ActionTaskStatusRequest
import com.careerdecision.mobile.network.ApiException
import com.careerdecision.mobile.network.AssistantChatContext
import com.careerdecision.mobile.network.AssistantChatRequest
import com.careerdecision.mobile.network.AssistantChatResponse
import com.careerdecision.mobile.network.ChatConversation
import com.careerdecision.mobile.network.ChatDeliveryStatus
import com.careerdecision.mobile.network.ChatMessage
import com.careerdecision.mobile.network.ChatMessageRole
import com.careerdecision.mobile.network.CoachingRequest
import com.careerdecision.mobile.network.ConfidenceFeedbackRequest
import com.careerdecision.mobile.network.ConfidenceFeedbackResponse
import com.careerdecision.mobile.network.DashboardResponse
import com.careerdecision.mobile.network.DashboardProject
import com.careerdecision.mobile.network.LoginResponse
import com.careerdecision.mobile.network.RegisterRequest
import com.careerdecision.mobile.network.TodayResponse
import com.careerdecision.mobile.network.UserInfo
import com.careerdecision.mobile.network.UserProfile
import com.careerdecision.mobile.network.UserProfileRequest
import com.careerdecision.mobile.network.WeeklyReviewRequest
import com.careerdecision.mobile.network.WeeklyReviewResponse
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.atomic.AtomicInteger

class CareerRepositoryTest {
    @Test
    fun offlineTaskAndResultAreKeptThenSyncedWithStableRequestIds() = runTest {
        val session = FakeSessionGateway(TEST_SESSION)
        val remote = FakeCareerRemote(offline = true)
        val cache = FakeActionCache().apply { replace(TEST_USER.id, TODAY, PLAN) }
        val scheduler = FakeScheduler()
        val repository = CareerRepository(session, remote, cache, scheduler)

        val queued = repository.updateTask(
            planId = 501,
            taskId = 601,
            expectedVersion = 1,
            status = "completed",
            resultDescription = "完成五个岗位样本对比",
            resultLink = "https://example.test/result"
        )

        assertFalse(queued.synced)
        assertEquals("completed", queued.snapshot.cache.tasks.single().status)
        assertEquals(2, queued.snapshot.cache.pendingCount)
        assertTrue(scheduler.calls > 0)

        val requestIds = cache.pending(TEST_USER.id).map { it.operationId }
        remote.offline = false
        assertTrue(repository.syncPendingOperations())

        assertEquals(0, cache.pendingCount(TEST_USER.id))
        assertEquals(requestIds[0], remote.statusRequests.single().requestId)
        assertEquals(1, remote.statusRequests.single().expectedVersion)
        assertEquals(requestIds[1], remote.resultRequests.single().requestId)
    }

    @Test
    fun logoutKeepsSessionAndCacheWhenOperationsArePending() = runTest {
        val session = FakeSessionGateway(TEST_SESSION)
        val cache = FakeActionCache().apply {
            replace(TEST_USER.id, TODAY, PLAN)
            enqueue(PENDING_STATUS_OPERATION.copy(operationId = "logout-pending"))
        }
        val remote = FakeCareerRemote()
        val repository = CareerRepository(session, remote, cache, FakeScheduler())

        val error = runCatching { repository.logout() }.exceptionOrNull()

        assertTrue(error is PendingOperationsException)
        assertEquals(1, (error as PendingOperationsException).pendingCount)
        assertEquals(TEST_SESSION, session.snapshot)
        assertEquals(1, cache.pendingCount(TEST_USER.id))
        assertEquals(PLAN.id, cache.read(TEST_USER.id).goal?.planId)
        assertEquals(0, remote.logoutCalls)
    }

    @Test
    fun logoutClearsLocalDataWhenRemoteLogoutFailsAndNothingIsPending() = runTest {
        val session = FakeSessionGateway(TEST_SESSION)
        val cache = FakeActionCache().apply { replace(TEST_USER.id, TODAY, PLAN) }
        val remote = FakeCareerRemote().apply { failLogout = true }
        val repository = CareerRepository(session, remote, cache, FakeScheduler())

        repository.logout()

        assertEquals(null, repository.currentSession())
        assertEquals(null, session.snapshot)
        assertEquals(null, cache.read(TEST_USER.id).goal)
        assertTrue(cache.read(TEST_USER.id).tasks.isEmpty())
        assertEquals(1, remote.logoutCalls)
    }

    @Test
    fun pendingSyncContinuesPastTheFirstFiftyOperations() = runTest {
        val cache = FakeActionCache().apply {
            repeat(51) { index ->
                enqueue(PENDING_STATUS_OPERATION.copy(operationId = "status-batch-$index"))
            }
        }
        val remote = FakeCareerRemote()
        val repository = CareerRepository(
            FakeSessionGateway(TEST_SESSION), remote, cache, FakeScheduler()
        )

        assertTrue(repository.syncPendingOperations())

        assertEquals(0, cache.pendingCount(TEST_USER.id))
        assertEquals(51, remote.statusRequests.size)
        assertEquals("status-batch-50", remote.statusRequests.last().requestId)
    }

    @Test
    fun offlineTaskCompletionUpdatesAndRestoresGoalAggregate() = runTest {
        val cache = FakeActionCache().apply { replace(TEST_USER.id, TODAY, PLAN) }
        val repository = CareerRepository(
            FakeSessionGateway(TEST_SESSION), FakeCareerRemote(offline = true), cache, FakeScheduler()
        )

        val completed = repository.updateTask(PLAN.id, TASK.id, TASK.version, "completed")

        assertEquals(1, completed.snapshot.cache.goal?.completedTaskCount)
        assertEquals(25, completed.snapshot.cache.goal?.progressPercent)

        val restored = repository.updateTask(PLAN.id, TASK.id, TASK.version + 1, "in_progress")

        assertEquals(0, restored.snapshot.cache.goal?.completedTaskCount)
        assertEquals(0, restored.snapshot.cache.goal?.progressPercent)
    }

    @Test
    fun goalConfidenceFeedbackUsesOfflineQueue() = runTest {
        val session = FakeSessionGateway(TEST_SESSION)
        val remote = FakeCareerRemote(offline = true)
        val cache = FakeActionCache().apply { replace(TEST_USER.id, TODAY, PLAN) }
        val repository = CareerRepository(session, remote, cache, FakeScheduler())

        val result = repository.submitGoalConfidence(101, 201, "increased", "完成岗位验证后更确定")

        assertFalse(result.synced)
        val queued = cache.pending(TEST_USER.id)
        assertEquals(1, queued.size)
        assertEquals("target_confidence", queued.single().operationType)
        assertEquals("increased", queued.single().taskStatus)

        remote.offline = false
        assertTrue(repository.syncPendingOperations())
        assertEquals(0, cache.pendingCount(TEST_USER.id))
    }

    @Test
    fun weeklyReviewUsesOneStableOfflineRequestAndSubmitsAfterReconnect() = runTest {
        val remote = FakeCareerRemote(offline = true)
        val cache = FakeActionCache().apply { replace(TEST_USER.id, TODAY, PLAN) }
        val repository = CareerRepository(
            FakeSessionGateway(TEST_SESSION), remote, cache, FakeScheduler()
        )

        val queued = repository.submitWeeklyReview(
            planId = 501,
            weekNo = 1,
            completedSummary = "完成岗位样本整理",
            evidenceSummary = "形成岗位要求清单",
            difficulties = "系统设计证据不足",
            nextWeekMinutes = 300,
            confidenceTrend = "stable",
            confidenceReason = "还需要继续验证"
        )

        assertFalse(queued.synced)
        val requestId = cache.pending(TEST_USER.id).single().operationId
        assertEquals("weekly_review", cache.pending(TEST_USER.id).single().operationType)

        remote.offline = false
        assertTrue(repository.syncPendingOperations())
        assertEquals(requestId, remote.reviewRequests.single().requestId)
        assertEquals(0, cache.pendingCount(TEST_USER.id))
    }

    @Test
    fun taskVersionConflictIsSurfacedAndStaleOperationIsNotRetriedForever() = runTest {
        val remote = FakeCareerRemote().apply { conflictOnNextStatus = true }
        val cache = FakeActionCache().apply { replace(TEST_USER.id, TODAY, PLAN) }
        val repository = CareerRepository(
            FakeSessionGateway(TEST_SESSION), remote, cache, FakeScheduler()
        )

        val error = runCatching {
            repository.updateTask(501, 601, 1, "completed")
        }.exceptionOrNull()

        assertTrue(error is ApiException)
        assertEquals(40962, (error as ApiException).apiCode)
        assertEquals(0, cache.pendingCount(TEST_USER.id))
    }

    @Test
    fun expiredAccessTokenIsRefreshedAndRequestIsRetried() = runTest {
        val session = FakeSessionGateway(TEST_SESSION.copy(token = "expired"))
        val remote = FakeCareerRemote(unauthorizedOnce = true)
        val repository = CareerRepository(session, remote, FakeActionCache(), FakeScheduler())

        val snapshot = repository.refresh()

        assertTrue(snapshot.online)
        assertEquals(1, remote.refreshCalls)
        assertEquals("rotated-token", session.snapshot?.token)
        assertEquals("rotated-refresh", session.snapshot?.refreshToken)
    }

    @Test
    fun concurrentUnauthorizedRequestsShareOneRefreshTokenRotation() = runTest {
        val session = FakeSessionGateway(TEST_SESSION)
        val remote = FakeCareerRemote().apply { coordinateConcurrentDashboardUnauthorized = true }
        val repository = CareerRepository(session, remote, FakeActionCache(), FakeScheduler())

        listOf(
            async { repository.refresh() },
            async { repository.refresh() }
        ).awaitAll()

        assertEquals(1, remote.refreshCalls)
        assertEquals("rotated-token", session.snapshot?.token)
        assertEquals("rotated-refresh", session.snapshot?.refreshToken)
    }

    @Test
    fun pendingSyncPropagatesCancellationWithoutRecordingFailure() = runTest {
        val cache = FakeActionCache().apply {
            enqueue(PENDING_STATUS_OPERATION.copy(operationId = "status-cancelled"))
        }
        val remote = FakeCareerRemote().apply { cancelNextStatus = true }
        val repository = CareerRepository(
            FakeSessionGateway(TEST_SESSION), remote, cache, FakeScheduler()
        )

        val error = runCatching { repository.syncPendingOperations() }.exceptionOrNull()

        assertTrue(error is CancellationException)
        assertEquals(0, cache.pending(TEST_USER.id).single().attempts)
    }

    @Test
    fun mutationRefreshDoesNotFallbackToCacheOnCancellation() = runTest {
        val remote = FakeCareerRemote().apply { cancelNextDashboard = true }
        val repository = CareerRepository(
            FakeSessionGateway(TEST_SESSION), remote,
            FakeActionCache().apply { replace(TEST_USER.id, TODAY, PLAN) }, FakeScheduler()
        )

        val error = runCatching {
            repository.updateTask(501, 601, 1, "in_progress")
        }.exceptionOrNull()

        assertTrue(error is CancellationException)
    }

    @Test
    fun pendingSyncPropagatesPermanentAuthenticationFailure() = runTest {
        val session = FakeSessionGateway(TEST_SESSION)
        val cache = FakeActionCache().apply {
            enqueue(PENDING_STATUS_OPERATION.copy(operationId = "status-auth-failure"))
        }
        val remote = FakeCareerRemote().apply {
            unauthorizedNextStatus = true
            refreshFailure = ApiException("refresh expired", apiCode = 401, httpStatus = 401)
        }
        val repository = CareerRepository(session, remote, cache, FakeScheduler())

        val error = runCatching { repository.syncPendingOperations() }.exceptionOrNull()

        assertTrue(error is ApiException && error.httpStatus == 401)
        assertEquals(null, repository.currentSession())
        assertEquals(0, cache.pending(TEST_USER.id).single().attempts)
    }

    @Test
    fun chatPropagatesPermanentAuthenticationFailureAndKeepsRetryableMessage() = runTest {
        val cache = FakeActionCache().apply { replace(TEST_USER.id, TODAY, PLAN) }
        val remote = FakeCareerRemote().apply {
            unauthorizedNextChat = true
            refreshFailure = ApiException("refresh expired", apiCode = 401, httpStatus = 401)
        }
        val repository = CareerRepository(
            FakeSessionGateway(TEST_SESSION), remote, cache, FakeScheduler()
        )

        val error = runCatching { repository.sendChatMessage("Keep this message") }.exceptionOrNull()

        assertTrue(error is ApiException && error.httpStatus == 401)
        assertEquals(null, repository.currentSession())
        assertEquals(ChatDeliveryStatus.FAILED, cache.readChat(TEST_USER.id).messages.single().deliveryStatus)
    }

    @Test
    fun chatPersistsSessionAndUsesItForFollowingMessages() = runTest {
        val cache = FakeActionCache().apply { replace(TEST_USER.id, TODAY, PLAN) }
        val remote = FakeCareerRemote()
        val repository = CareerRepository(
            FakeSessionGateway(TEST_SESSION), remote, cache, FakeScheduler()
        )

        val first = repository.sendChatMessage("What should I do first?")
        val second = repository.sendChatMessage("How do I verify it?")

        assertTrue(first.delivered)
        assertTrue(second.delivered)
        assertEquals(12001L, second.conversation.sessionId)
        assertEquals(4, second.conversation.messages.size)
        assertEquals(null, remote.chatRequests[0].sessionId)
        assertEquals(12001L, remote.chatRequests[1].sessionId)
        assertEquals(501L, remote.chatRequests[0].context.planId)

        remote.failNextChat = true
        val failedFollowUp = repository.sendChatMessage("Keep this session on retry")
        val followUpRequestId = failedFollowUp.conversation.messages.last().requestId
        val retriedFollowUp = repository.retryChatMessage(followUpRequestId)
        assertEquals(12001L, remote.chatRequests[2].sessionId)
        assertEquals(12001L, remote.chatRequests[3].sessionId)
        assertEquals(remote.chatRequests[2].requestId, remote.chatRequests[3].requestId)

        val restored = CareerRepository(
            FakeSessionGateway(TEST_SESSION), remote, cache, FakeScheduler()
        ).loadChatConversation()
        assertEquals(12001L, restored.sessionId)
        assertEquals(retriedFollowUp.conversation.messages, restored.messages)
    }

    @Test
    fun failedChatRetryReusesStableRequestId() = runTest {
        val cache = FakeActionCache().apply { replace(TEST_USER.id, TODAY, PLAN) }
        val remote = FakeCareerRemote().apply { failNextChat = true }
        val repository = CareerRepository(
            FakeSessionGateway(TEST_SESSION), remote, cache, FakeScheduler()
        )

        val failed = repository.sendChatMessage("Retry this message")
        val requestId = failed.conversation.messages.single().requestId
        val retried = repository.retryChatMessage(requestId)

        assertFalse(failed.delivered)
        assertEquals(ChatDeliveryStatus.FAILED, failed.conversation.messages.single().deliveryStatus)
        assertTrue(retried.delivered)
        assertEquals(requestId, remote.chatRequests[0].requestId)
        assertEquals(requestId, remote.chatRequests[1].requestId)
        assertEquals(null, remote.chatRequests[1].sessionId)
        assertEquals(2, retried.conversation.messages.size)
    }

    @Test
    fun unfinishedChatMustBeRetriedOrResetBeforeSendingAnotherMessage() = runTest {
        val remote = FakeCareerRemote().apply { failNextChat = true }
        val repository = CareerRepository(
            FakeSessionGateway(TEST_SESSION), remote,
            FakeActionCache().apply { replace(TEST_USER.id, TODAY, PLAN) }, FakeScheduler()
        )

        repository.sendChatMessage("First message")
        val error = runCatching { repository.sendChatMessage("Second message") }.exceptionOrNull()

        assertTrue(error is IllegalArgumentException)
        assertEquals(1, remote.chatRequests.size)

        repository.startNewChatConversation()
        val replacement = repository.sendChatMessage("New conversation")
        assertTrue(replacement.delivered)
        assertEquals(null, remote.chatRequests.last().sessionId)
    }

    @Test
    fun interruptedPendingChatIsLoadedAsRetryable() = runTest {
        val cache = FakeActionCache().apply {
            replace(TEST_USER.id, TODAY, PLAN)
            beginChatMessage(
                userId = TEST_USER.id,
                requestId = "android-chat-interrupted",
                page = "/android/mentor",
                message = "Resume this request",
                context = AssistantChatContext(planId = PLAN.id)
            )
        }
        val repository = CareerRepository(
            FakeSessionGateway(TEST_SESSION), FakeCareerRemote(), cache, FakeScheduler()
        )

        val recovered = repository.loadChatConversation()
        val retried = repository.retryChatMessage("android-chat-interrupted")

        assertEquals(ChatDeliveryStatus.FAILED, recovered.messages.single().deliveryStatus)
        assertTrue(retried.delivered)
    }

    @Test
    fun registerLogsInAndRefreshLoadsProfileAndPlanDetail() = runTest {
        val session = FakeSessionGateway()
        val remote = FakeCareerRemote()
        val repository = CareerRepository(session, remote, FakeActionCache(), FakeScheduler())

        val snapshot = repository.register(
            username = "new_student",
            password = "secret12",
            confirmPassword = "secret12",
            email = "new@example.test"
        )

        assertEquals("new_student", remote.registerRequests.single().username)
        assertEquals("new_student", session.snapshot?.user?.username)
        assertEquals(PROFILE, snapshot.fullProfile)
        assertEquals(PLAN_DETAIL, snapshot.planDetail)
    }

    @Test
    fun profileSaveAndPlanDetailUseVersionedBackendContracts() = runTest {
        val remote = FakeCareerRemote()
        val repository = CareerRepository(
            FakeSessionGateway(TEST_SESSION), remote,
            FakeActionCache().apply { replace(TEST_USER.id, TODAY, PLAN) }, FakeScheduler()
        )
        val request = UserProfileRequest(
            displayName = "Lin",
            completeOnboarding = true,
            expectedVersion = 2
        )

        val saved = repository.saveProfile(request)
        val detail = repository.loadCurrentPlanDetail()

        assertEquals(2, remote.profileRequests.single().expectedVersion)
        assertEquals(PROFILE, saved)
        assertEquals(PLAN_DETAIL, detail)
    }

    @Test
    fun standaloneTaskResultUsesOfflineQueueWithoutChangingTaskStatus() = runTest {
        val remote = FakeCareerRemote(offline = true)
        val cache = FakeActionCache().apply { replace(TEST_USER.id, TODAY, PLAN) }
        val repository = CareerRepository(
            FakeSessionGateway(TEST_SESSION), remote, cache, FakeScheduler()
        )

        val result = repository.addTaskResult(501, 601, "Uploaded interview notes", null)

        assertFalse(result.synced)
        assertEquals("todo", result.snapshot.cache.tasks.single().status)
        assertEquals(1, result.snapshot.cache.tasks.single().resultCount)
        assertEquals("task_result", cache.pending(TEST_USER.id).single().operationType)
    }

    @Test(expected = IllegalArgumentException::class)
    fun deferringWithoutReasonIsRejectedBeforeQueueing() = runTest {
        val repository = CareerRepository(
            FakeSessionGateway(TEST_SESSION),
            FakeCareerRemote(),
            FakeActionCache().apply { replace(TEST_USER.id, TODAY, PLAN) },
            FakeScheduler()
        )
        repository.updateTask(501, 601, 1, "deferred", deferredTo = "2026-07-12T20:00:00")
    }
}

internal class FakeSessionGateway(initial: SessionSnapshot? = null) : SessionGateway {
    var snapshot: SessionSnapshot? = initial
    override fun load(): SessionSnapshot? = snapshot
    override fun save(token: String, refreshToken: String, user: UserInfo) {
        snapshot = SessionSnapshot(token, refreshToken, user)
    }
    override fun clear() { snapshot = null }
}

internal class FakeScheduler : PendingSyncScheduler {
    var calls = 0
    override fun schedule() { calls += 1 }
}

internal class FakeActionCache : ActionCache {
    private var goal: CachedGoalEntity? = null
    private var tasks = mutableListOf<CachedTaskEntity>()
    private val operations = mutableListOf<PendingOperationEntity>()
    private var chatSessionId: Long? = null
    private val chatMessages = mutableListOf<ChatMessage>()
    private val chatRequests = mutableMapOf<String, CachedChatRequest>()
    private var nextId = 1L

    override suspend fun read(userId: Long): CachedActionSnapshot {
        val currentGoal = goal?.takeIf { it.userId == userId }
        val pendingReview = operations.firstOrNull {
            it.userId == userId &&
                it.planId == currentGoal?.planId &&
                it.operationType == "weekly_review"
        }
        return CachedActionSnapshot(
            goal = currentGoal,
            tasks = tasks.filter { it.userId == userId },
            pendingCount = pendingCount(userId),
            pendingReviewPlanId = pendingReview?.planId,
            pendingReviewWeekNo = pendingReview?.reviewWeekNo
        )
    }

    override suspend fun replace(
        userId: Long,
        today: TodayResponse,
        plan: ActionPlanSummary?,
        project: DashboardProject?
    ) {
        goal = CachedGoalEntity(
            userId, today.planId, today.projectId, today.targetId, today.targetRole,
            plan?.status, plan?.durationWeeks ?: 0, plan?.taskCount ?: today.totalThisWeek,
            plan?.completedTaskCount ?: today.completedThisWeek, plan?.progressPercent ?: 0,
            plan?.startDate, plan?.endDate, plan?.updatedAt,
            project?.backupTarget, project?.decisionReason, project?.mainRisks,
            project?.reviewDate, project?.confirmedAt, project?.evidenceCount ?: 0,
            project?.resultCount ?: 0
        )
        tasks = today.tasks.map { task ->
            CachedTaskEntity(
                task.id, userId, requireNotNull(today.planId), task.weekNo, task.title, task.taskType,
                task.content, task.status, task.dueAt, task.estimatedMinutes, task.acceptanceCriteria,
                task.deferredTo, task.skipReason, task.results.size, task.sortOrder, task.version, task.updatedAt
            )
        }.toMutableList()
    }

    override suspend fun setTaskStatus(userId: Long, taskId: Long, status: String, reason: String?, deferredTo: String?) {
        val previousStatus = tasks.firstOrNull { it.userId == userId && it.taskId == taskId }?.status
        tasks = tasks.map {
            if (it.userId == userId && it.taskId == taskId) {
                it.copy(status = status, skipReason = reason, deferredTo = deferredTo, version = it.version + 1)
            } else it
        }.toMutableList()
        if (previousStatus != null) {
            goal?.takeIf { it.userId == userId }?.let { currentGoal ->
                goal = currentGoal.withTaskStatusTransition(previousStatus, status)
            }
        }
    }

    override suspend fun incrementResultCount(userId: Long, taskId: Long) {
        tasks = tasks.map {
            if (it.userId == userId && it.taskId == taskId) it.copy(resultCount = it.resultCount + 1) else it
        }.toMutableList()
    }

    override suspend fun enqueue(operation: PendingOperationEntity) {
        if (operations.none { it.operationId == operation.operationId }) {
            operations += operation.copy(id = nextId++)
        }
    }

    override suspend fun pending(userId: Long, limit: Int): List<PendingOperationEntity> =
        operations.filter { it.userId == userId }.take(limit)

    override suspend fun deletePending(id: Long) { operations.removeAll { it.id == id } }
    override suspend fun recordFailure(id: Long, message: String) {
        val index = operations.indexOfFirst { it.id == id }
        if (index >= 0) operations[index] = operations[index].copy(attempts = operations[index].attempts + 1, lastError = message)
    }
    override suspend fun pendingCount(userId: Long): Int = operations.count { it.userId == userId }

    override suspend fun readChat(userId: Long): ChatConversation =
        ChatConversation(chatSessionId, chatMessages.toList())

    override suspend fun chatRequest(userId: Long, requestId: String): CachedChatRequest? =
        chatRequests[requestId]

    override suspend fun beginChatMessage(
        userId: Long,
        requestId: String,
        page: String,
        message: String,
        context: AssistantChatContext
    ) {
        chatRequests[requestId] = CachedChatRequest(chatSessionId, requestId, page, message, context)
        val index = chatMessages.indexOfFirst {
            it.requestId == requestId && it.role == ChatMessageRole.USER
        }
        if (index >= 0) {
            chatMessages[index] = chatMessages[index].copy(
                deliveryStatus = ChatDeliveryStatus.PENDING,
                errorMessage = null
            )
        } else {
            chatMessages += ChatMessage(
                requestId = requestId,
                role = ChatMessageRole.USER,
                content = message,
                deliveryStatus = ChatDeliveryStatus.PENDING,
                createdAt = System.currentTimeMillis()
            )
        }
    }

    override suspend fun completeChatMessage(
        userId: Long,
        requestId: String,
        response: AssistantChatResponse
    ) {
        chatSessionId = response.sessionId
        val userIndex = chatMessages.indexOfFirst {
            it.requestId == requestId && it.role == ChatMessageRole.USER
        }
        if (userIndex >= 0) {
            chatMessages[userIndex] = chatMessages[userIndex].copy(
                deliveryStatus = ChatDeliveryStatus.SENT,
                errorMessage = null
            )
        }
        if (chatMessages.none {
                it.requestId == requestId && it.role == ChatMessageRole.ASSISTANT
            }) {
            chatMessages += ChatMessage(
                requestId = requestId,
                role = ChatMessageRole.ASSISTANT,
                content = response.reply,
                deliveryStatus = ChatDeliveryStatus.SENT,
                response = response,
                createdAt = System.currentTimeMillis()
            )
        }
    }

    override suspend fun failChatMessage(userId: Long, requestId: String, errorMessage: String) {
        val index = chatMessages.indexOfFirst {
            it.requestId == requestId && it.role == ChatMessageRole.USER
        }
        if (index >= 0) {
            chatMessages[index] = chatMessages[index].copy(
                deliveryStatus = ChatDeliveryStatus.FAILED,
                errorMessage = errorMessage
            )
        }
    }

    override suspend fun resetChat(userId: Long) {
        chatSessionId = null
        chatMessages.clear()
        chatRequests.clear()
    }

    override suspend fun clear(userId: Long) {
        if (goal?.userId == userId) goal = null
        tasks.removeAll { it.userId == userId }
        operations.removeAll { it.userId == userId }
        resetChat(userId)
    }
}

internal class FakeCareerRemote(
    var offline: Boolean = false,
    private var unauthorizedOnce: Boolean = false
) : CareerRemoteDataSource {
    var refreshCalls = 0
    var logoutCalls = 0
    var failLogout = false
    var conflictOnNextStatus = false
    var failNextChat = false
    var unauthorizedNextChat = false
    var unauthorizedNextStatus = false
    var cancelNextStatus = false
    var cancelNextDashboard = false
    var refreshFailure: Throwable? = null
    var coordinateConcurrentDashboardUnauthorized = false
    val registerRequests = mutableListOf<RegisterRequest>()
    val statusRequests = mutableListOf<ActionTaskStatusRequest>()
    val resultRequests = mutableListOf<ActionTaskResultRequest>()
    val reviewRequests = mutableListOf<WeeklyReviewRequest>()
    val chatRequests = mutableListOf<AssistantChatRequest>()
    val profileRequests = mutableListOf<UserProfileRequest>()
    private var taskStatus = "todo"
    private var taskVersion = TASK.version
    private val dashboardAttempts = AtomicInteger()
    private val concurrentDashboardGate = CompletableDeferred<Unit>()

    override suspend fun register(request: RegisterRequest): UserInfo {
        registerRequests += request
        return TEST_USER.copy(username = request.username, email = request.email, phone = request.phone)
    }

    override suspend fun login(username: String, password: String): LoginResponse =
        LoginResponse("token", "refresh", TEST_USER.copy(username = username))

    override suspend fun refresh(refreshToken: String): LoginResponse {
        refreshCalls += 1
        refreshFailure?.let { throw it }
        return LoginResponse("rotated-token", "rotated-refresh", TEST_USER)
    }

    override suspend fun logout() {
        logoutCalls += 1
        if (failLogout) throw ApiException("offline")
    }

    override suspend fun dashboard(): DashboardResponse {
        val attempt = dashboardAttempts.incrementAndGet()
        if (coordinateConcurrentDashboardUnauthorized && attempt <= 2) {
            if (attempt == 2) concurrentDashboardGate.complete(Unit)
            concurrentDashboardGate.await()
            throw ApiException("expired", apiCode = 401, httpStatus = 401)
        }
        if (cancelNextDashboard) {
            cancelNextDashboard = false
            throw CancellationException("dashboard cancelled")
        }
        failIfNeeded()
        return DASHBOARD.copy(today = today())
    }

    override suspend fun today(): TodayResponse {
        failIfOffline()
        return TODAY.copy(tasks = TODAY.tasks.map { it.copy(status = taskStatus, version = taskVersion) })
    }

    override suspend fun actionPlans(): List<ActionPlanSummary> {
        failIfOffline()
        return listOf(PLAN)
    }

    override suspend fun actionPlan(planId: Long): ActionPlanDetail {
        failIfOffline()
        return PLAN_DETAIL.copy(id = planId)
    }

    override suspend fun updateTaskStatus(
        planId: Long,
        taskId: Long,
        request: ActionTaskStatusRequest
    ): ActionPlanDetail {
        failIfOffline()
        if (cancelNextStatus) {
            cancelNextStatus = false
            throw CancellationException("sync cancelled")
        }
        if (unauthorizedNextStatus) {
            unauthorizedNextStatus = false
            throw ApiException("expired", apiCode = 401, httpStatus = 401)
        }
        if (conflictOnNextStatus) {
            conflictOnNextStatus = false
            throw ApiException("任务已在其他设备更新", apiCode = 40962, httpStatus = 409)
        }
        statusRequests += request
        taskStatus = request.status
        taskVersion += 1
        return PLAN_DETAIL
    }

    override suspend fun addTaskResult(
        planId: Long,
        taskId: Long,
        request: ActionTaskResultRequest
    ): ActionPlanDetail {
        failIfOffline()
        resultRequests += request
        return PLAN_DETAIL
    }

    override suspend fun coachActionPlan(planId: Long, request: CoachingRequest): ActionCoachResponse {
        failIfOffline()
        return COACH
    }

    override suspend fun sendChatMessage(request: AssistantChatRequest): AssistantChatResponse {
        chatRequests += request
        if (unauthorizedNextChat) {
            unauthorizedNextChat = false
            throw ApiException("expired", apiCode = 401, httpStatus = 401)
        }
        if (failNextChat) {
            failNextChat = false
            throw ApiException("chat unavailable")
        }
        failIfOffline()
        return CHAT_RESPONSE.copy(
            sessionId = request.sessionId ?: 12001L,
            reply = "Reply to: ${request.message}"
        )
    }

    override suspend fun profile(): UserProfile {
        failIfOffline()
        return PROFILE
    }

    override suspend fun saveProfile(request: UserProfileRequest): UserProfile {
        failIfOffline()
        profileRequests += request
        return PROFILE
    }

    override suspend fun submitConfidenceFeedback(
        projectId: Long,
        targetId: Long,
        request: ConfidenceFeedbackRequest
    ): ConfidenceFeedbackResponse {
        failIfOffline()
        return ConfidenceFeedbackResponse(
            1, projectId, targetId, request.trend, request.reason, request.requestId, "2026-07-11T10:00:00"
        )
    }

    override suspend fun submitWeeklyReview(request: WeeklyReviewRequest): WeeklyReviewResponse {
        failIfOffline()
        reviewRequests += request
        return WeeklyReviewResponse(
            id = 901,
            planId = request.planId,
            projectId = 101,
            weekNo = request.weekNo,
            completedSummary = request.completedSummary,
            evidenceSummary = request.evidenceSummary,
            difficulties = request.difficulties,
            nextWeekMinutes = request.nextWeekMinutes,
            confidenceTrend = request.confidenceTrend,
            confidenceReason = request.confidenceReason,
            adjustmentProposal = null,
            status = "submitted",
            requestId = request.requestId,
            submittedAt = "2026-07-11T12:00:00",
            createdAt = "2026-07-11T12:00:00",
            updatedAt = "2026-07-11T12:00:00"
        )
    }

    private fun failIfNeeded() {
        failIfOffline()
        if (unauthorizedOnce) {
            unauthorizedOnce = false
            throw ApiException("expired", apiCode = 401, httpStatus = 401)
        }
    }

    private fun failIfOffline() {
        if (offline) throw ApiException("offline")
    }
}

internal val TEST_USER = UserInfo(7, "student", "student@example.test", null)
internal val TEST_SESSION = SessionSnapshot("token", "refresh", TEST_USER)
internal val PENDING_STATUS_OPERATION = PendingOperationEntity(
    operationId = "status-pending",
    userId = TEST_USER.id,
    planId = 501,
    taskId = 601,
    operationType = "task_status",
    expectedVersion = 1,
    taskStatus = "in_progress"
)
internal val CHAT_RESPONSE = AssistantChatResponse(
    sessionId = 12001,
    generationMode = "fallback",
    confidence = 0.72,
    reply = "Start with one small validation task"
)
internal val PROFILE = UserProfile(
    userId = TEST_USER.id,
    displayName = "Lin",
    identityType = "student",
    school = "Example University",
    major = "Computer Science",
    degree = "Bachelor",
    grade = "Junior",
    graduationDate = "2027-06-30",
    city = "Hangzhou",
    targetRole = "Java backend engineer",
    targetCities = listOf("Hangzhou"),
    expectedSalary = "15k-25k",
    currentConfusion = "How to validate the target role",
    existingDirections = listOf("Java backend"),
    weeklyAvailableMinutes = 300,
    onboardingCompleted = true,
    profileVersion = 2,
    skills = listOf("Java"),
    certificates = emptyList(),
    experiences = emptyList(),
    values = listOf("growth"),
    preferredIndustries = listOf("enterprise software"),
    preferredWorkModes = listOf("deep work"),
    constraints = emptyList(),
    externalAiConsent = false,
    completed = true,
    updatedAt = "2026-07-11T10:00:00"
)
internal val TASK = ActionTask(
    id = 601, weekNo = 1, title = "分析五个真实岗位", taskType = "job_validation",
    content = "提取共同要求", status = "todo", dueAt = "2026-07-12T20:00:00",
    estimatedMinutes = 60, acceptanceCriteria = "保存五个岗位并整理共同要求", startedAt = null,
    completedAt = null, deferredTo = null, skipReason = null, sortOrder = 0, version = 1,
    results = emptyList(), updatedAt = "2026-07-11T10:00:00"
)
internal val TODAY = TodayResponse(501, 101, 201, "Java 后端", 1, 0, 1, listOf(TASK), "2026-07-11T10:00:00")
internal val PLAN = ActionPlanSummary(501, 101, 201, "Java 后端", "active", 4, 4, 0, 0, "2026-07-11", "2026-08-07", null, null)
internal val PLAN_DETAIL = ActionPlanDetail(501, 101, 201, "Java 后端", "四周计划", "active", 4, 1, "2026-07-11", "2026-08-07", 4, 0, 0, emptyList(), null, null)
internal val DASHBOARD = DashboardResponse("executing", "continue_task", "继续任务", "/action-plans/501", true, null, null, TODAY, null, null)
internal val COACH = ActionCoachResponse("fallback", null, 0.72, "先完成岗位样本验证", uncertainties = listOf("样本仍少"))
