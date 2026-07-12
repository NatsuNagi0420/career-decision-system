package com.careerdecision.mobile.data

import com.careerdecision.mobile.SessionGateway
import com.careerdecision.mobile.SessionSnapshot
import com.careerdecision.mobile.data.local.ActionCache
import com.careerdecision.mobile.data.local.CachedActionSnapshot
import com.careerdecision.mobile.data.local.CachedGoalEntity
import com.careerdecision.mobile.data.local.CachedTaskEntity
import com.careerdecision.mobile.data.local.PendingOperationEntity
import com.careerdecision.mobile.network.ActionCoachResponse
import com.careerdecision.mobile.network.ActionPlanDetail
import com.careerdecision.mobile.network.ActionPlanSummary
import com.careerdecision.mobile.network.ActionTask
import com.careerdecision.mobile.network.ActionTaskResultRequest
import com.careerdecision.mobile.network.ActionTaskStatusRequest
import com.careerdecision.mobile.network.ApiException
import com.careerdecision.mobile.network.CoachingRequest
import com.careerdecision.mobile.network.ConfidenceFeedbackRequest
import com.careerdecision.mobile.network.ConfidenceFeedbackResponse
import com.careerdecision.mobile.network.DashboardResponse
import com.careerdecision.mobile.network.DashboardProject
import com.careerdecision.mobile.network.LoginResponse
import com.careerdecision.mobile.network.TodayResponse
import com.careerdecision.mobile.network.UserInfo
import com.careerdecision.mobile.network.WeeklyReviewRequest
import com.careerdecision.mobile.network.WeeklyReviewResponse
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

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
    private var nextId = 1L

    override suspend fun read(userId: Long): CachedActionSnapshot = CachedActionSnapshot(
        goal?.takeIf { it.userId == userId },
        tasks.filter { it.userId == userId },
        pendingCount(userId)
    )

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
        tasks = tasks.map {
            if (it.userId == userId && it.taskId == taskId) {
                it.copy(status = status, skipReason = reason, deferredTo = deferredTo, version = it.version + 1)
            } else it
        }.toMutableList()
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
    override suspend fun clear(userId: Long) {
        if (goal?.userId == userId) goal = null
        tasks.removeAll { it.userId == userId }
        operations.removeAll { it.userId == userId }
    }
}

internal class FakeCareerRemote(
    var offline: Boolean = false,
    private var unauthorizedOnce: Boolean = false
) : CareerRemoteDataSource {
    var refreshCalls = 0
    var conflictOnNextStatus = false
    val statusRequests = mutableListOf<ActionTaskStatusRequest>()
    val resultRequests = mutableListOf<ActionTaskResultRequest>()
    val reviewRequests = mutableListOf<WeeklyReviewRequest>()
    private var taskStatus = "todo"
    private var taskVersion = TASK.version

    override suspend fun login(username: String, password: String): LoginResponse =
        LoginResponse("token", "refresh", TEST_USER.copy(username = username))

    override suspend fun refresh(refreshToken: String): LoginResponse {
        refreshCalls += 1
        return LoginResponse("rotated-token", "rotated-refresh", TEST_USER)
    }

    override suspend fun logout() = Unit

    override suspend fun dashboard(): DashboardResponse {
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

    override suspend fun updateTaskStatus(
        planId: Long,
        taskId: Long,
        request: ActionTaskStatusRequest
    ): ActionPlanDetail {
        failIfOffline()
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
