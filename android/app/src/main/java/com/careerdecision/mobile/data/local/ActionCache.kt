package com.careerdecision.mobile.data.local

import androidx.room.withTransaction
import com.careerdecision.mobile.network.ActionPlanSummary
import com.careerdecision.mobile.network.DashboardProject
import com.careerdecision.mobile.network.TodayResponse

data class CachedActionSnapshot(
    val goal: CachedGoalEntity?,
    val tasks: List<CachedTaskEntity>,
    val pendingCount: Int
)

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
    suspend fun clear(userId: Long)
}

class RoomActionCache(private val database: ActionDatabase) : ActionCache {
    private val dao = database.actionDao()

    override suspend fun read(userId: Long): CachedActionSnapshot = CachedActionSnapshot(
        goal = dao.goal(userId),
        tasks = dao.tasks(userId),
        pendingCount = dao.pendingCount(userId)
    )

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
    ) = dao.updateTaskStatus(userId, taskId, status, reason, deferredTo)

    override suspend fun incrementResultCount(userId: Long, taskId: Long) =
        dao.incrementResultCount(userId, taskId)

    override suspend fun enqueue(operation: PendingOperationEntity) {
        dao.enqueue(operation)
    }

    override suspend fun pending(userId: Long, limit: Int): List<PendingOperationEntity> = dao.pending(userId, limit)
    override suspend fun deletePending(id: Long) = dao.deletePending(id)
    override suspend fun recordFailure(id: Long, message: String) = dao.recordFailure(id, message.take(500))
    override suspend fun pendingCount(userId: Long): Int = dao.pendingCount(userId)

    override suspend fun clear(userId: Long) {
        database.withTransaction {
            dao.deleteTasks(userId)
            dao.deleteGoal(userId)
            dao.deletePendingForUser(userId)
        }
    }

    private fun progress(completed: Int, total: Int): Int = if (total <= 0) 0 else completed * 100 / total
}
