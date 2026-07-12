package com.careerdecision.mobile.data

import com.careerdecision.mobile.SessionGateway
import com.careerdecision.mobile.SessionSnapshot
import com.careerdecision.mobile.data.local.ActionCache
import com.careerdecision.mobile.data.local.CachedActionSnapshot
import com.careerdecision.mobile.data.local.PendingOperationEntity
import com.careerdecision.mobile.network.ActionCoachResponse
import com.careerdecision.mobile.network.ActionTaskResultRequest
import com.careerdecision.mobile.network.ActionTaskStatusRequest
import com.careerdecision.mobile.network.ApiException
import com.careerdecision.mobile.network.CoachingRequest
import com.careerdecision.mobile.network.ConfidenceFeedbackRequest
import com.careerdecision.mobile.network.DashboardResponse
import com.careerdecision.mobile.network.UserInfo
import com.careerdecision.mobile.network.WeeklyReviewRequest
import com.careerdecision.mobile.network.normalizeNetworkError
import java.time.LocalDateTime
import java.util.UUID

data class RepositorySnapshot(
    val user: UserInfo,
    val cache: CachedActionSnapshot,
    val dashboard: DashboardResponse? = null,
    val online: Boolean
)

data class MutationResult(
    val snapshot: RepositorySnapshot,
    val synced: Boolean
)

interface PendingSyncScheduler {
    fun schedule()
}

interface CareerRepositoryGateway {
    fun currentSession(): SessionSnapshot?
    suspend fun cached(): RepositorySnapshot?
    suspend fun login(username: String, password: String): RepositorySnapshot
    suspend fun logout()
    suspend fun refresh(): RepositorySnapshot
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
    suspend fun syncPendingOperations(): Boolean
    suspend fun requestActionCoach(focus: String?): ActionCoachResponse
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
}

class CareerRepository(
    private val sessionStore: SessionGateway,
    private val remote: CareerRemoteDataSource,
    private val cache: ActionCache,
    private val scheduler: PendingSyncScheduler
) : CareerRepositoryGateway {
    private var session: SessionSnapshot? = sessionStore.load()

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

    override suspend fun logout() {
        val current = session
        if (current != null) {
            runCatching { authenticated { remote.logout() } }
            cache.clear(current.user.id)
        }
        sessionStore.clear()
        session = null
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
        cache.replace(current.user.id, today, plan, dashboard.currentProject)
        return RepositorySnapshot(current.user, cache.read(current.user.id), dashboard, online = true)
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
            runCatching { refresh() }.getOrElse { cached() ?: throw it }
        } else {
            requireNotNull(cached())
        }
        return MutationResult(snapshot, synced)
    }

    override suspend fun syncPendingOperations(): Boolean {
        val current = session ?: return true
        for (operation in cache.pending(current.user.id)) {
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
                val normalized = normalizeNetworkError(error)
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
        return true
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
            runCatching { refresh() }.getOrElse { cached() ?: throw it }
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
            runCatching { refresh() }.getOrElse { cached() ?: throw it }
        } else {
            requireNotNull(cached())
        }
        return MutationResult(snapshot, synced)
    }

    private suspend fun <T> authenticated(block: suspend () -> T): T {
        requireSession()
        try {
            return block()
        } catch (error: Throwable) {
            val normalized = normalizeNetworkError(error)
            if (!normalized.isUnauthorized()) throw normalized
            val current = requireSession()
            val refreshed = try {
                remote.refresh(current.refreshToken)
            } catch (refreshError: Throwable) {
                sessionStore.clear()
                session = null
                throw normalizeNetworkError(refreshError)
            }
            saveSession(refreshed.token, refreshed.refreshToken, refreshed.user)
            return try {
                block()
            } catch (retryError: Throwable) {
                throw normalizeNetworkError(retryError)
            }
        }
    }

    private fun requireSession(): SessionSnapshot = session
        ?: throw ApiException("请先登录", apiCode = 401, httpStatus = 401)

    private fun saveSession(token: String, refreshToken: String, user: UserInfo) {
        sessionStore.save(token, refreshToken, user)
        session = SessionSnapshot(token, refreshToken, user)
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
