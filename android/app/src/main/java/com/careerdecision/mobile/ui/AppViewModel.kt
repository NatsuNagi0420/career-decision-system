package com.careerdecision.mobile.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.careerdecision.mobile.data.CareerRepositoryGateway
import com.careerdecision.mobile.data.RepositorySnapshot
import com.careerdecision.mobile.data.local.CachedGoalEntity
import com.careerdecision.mobile.data.local.CachedTaskEntity
import com.careerdecision.mobile.network.ActionCoachResponse
import com.careerdecision.mobile.network.UserInfo
import com.careerdecision.mobile.network.DashboardProfile
import com.careerdecision.mobile.network.normalizeNetworkError
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AppUiState(
    val authenticated: Boolean = false,
    val user: UserInfo? = null,
    val profile: DashboardProfile? = null,
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val online: Boolean = false,
    val goal: CachedGoalEntity? = null,
    val tasks: List<CachedTaskEntity> = emptyList(),
    val pendingCount: Int = 0,
    val busyTaskId: Long? = null,
    val mentorLoading: Boolean = false,
    val goalFeedbackLoading: Boolean = false,
    val reviewLoading: Boolean = false,
    val mentor: ActionCoachResponse? = null,
    val notice: String? = null,
    val error: String? = null
)

class AppViewModel(private val repository: CareerRepositoryGateway) : ViewModel() {
    private val mutableState = MutableStateFlow(
        AppUiState(authenticated = repository.currentSession() != null)
    )
    val state: StateFlow<AppUiState> = mutableState.asStateFlow()

    init {
        if (repository.currentSession() == null) {
            mutableState.update { it.copy(loading = false) }
        } else {
            viewModelScope.launch {
                repository.cached()?.let(::showSnapshot)
                refresh(silent = true)
            }
        }
    }

    fun login(username: String, password: String) = viewModelScope.launch {
        mutableState.update { it.copy(loading = true, error = null, notice = null) }
        runCatching { repository.login(username, password) }
            .onSuccess {
                showSnapshot(it)
                mutableState.update { state -> state.copy(loading = false, notice = "登录成功") }
            }
            .onFailure(::showFailure)
    }

    fun logout() = viewModelScope.launch {
        repository.logout()
        mutableState.value = AppUiState(loading = false, notice = "已退出登录")
    }

    fun refresh(silent: Boolean = false) = viewModelScope.launch {
        mutableState.update { it.copy(refreshing = true, error = if (silent) it.error else null) }
        runCatching { repository.refresh() }
            .onSuccess {
                showSnapshot(it)
                mutableState.update { state -> state.copy(refreshing = false, notice = if (silent) state.notice else "已同步") }
            }
            .onFailure { error ->
                val cached = repository.cached()
                if (cached != null) {
                    showSnapshot(cached)
                    mutableState.update {
                        it.copy(
                            loading = false,
                            refreshing = false,
                            online = false,
                            notice = "当前离线，显示最近一次数据",
                            error = normalizeNetworkError(error).message
                        )
                    }
                } else {
                    showFailure(error)
                }
            }
    }

    fun updateTask(
        task: CachedTaskEntity,
        status: String,
        reason: String? = null,
        deferredTo: String? = null,
        resultDescription: String? = null,
        resultLink: String? = null
    ) = viewModelScope.launch {
        mutableState.update { it.copy(busyTaskId = task.taskId, error = null) }
        runCatching {
            repository.updateTask(
                planId = task.planId,
                taskId = task.taskId,
                expectedVersion = task.version,
                status = status,
                reason = reason,
                deferredTo = deferredTo,
                resultDescription = resultDescription,
                resultLink = resultLink
            )
        }.onSuccess { result ->
            showSnapshot(result.snapshot)
            mutableState.update {
                it.copy(
                    busyTaskId = null,
                    notice = if (result.synced) "任务已同步" else "已离线保存，联网后自动同步"
                )
            }
        }.onFailure { error ->
            mutableState.update {
                it.copy(busyTaskId = null, error = normalizeNetworkError(error).message)
            }
        }
    }

    fun askMentor(focus: String?) = viewModelScope.launch {
        mutableState.update { it.copy(mentorLoading = true, error = null) }
        runCatching { repository.requestActionCoach(focus) }
            .onSuccess { result -> mutableState.update { it.copy(mentorLoading = false, mentor = result) } }
            .onFailure { error -> mutableState.update {
                it.copy(mentorLoading = false, error = normalizeNetworkError(error).message)
            } }
    }

    fun submitGoalConfidence(trend: String, reason: String) = viewModelScope.launch {
        val goal = mutableState.value.goal
        val projectId = goal?.projectId
        val targetId = goal?.targetId
        if (projectId == null || targetId == null) {
            mutableState.update { it.copy(error = "当前没有可以反馈的职业目标") }
            return@launch
        }
        mutableState.update { it.copy(goalFeedbackLoading = true, error = null) }
        runCatching { repository.submitGoalConfidence(projectId, targetId, trend, reason) }
            .onSuccess { result ->
                showSnapshot(result.snapshot)
                mutableState.update {
                    it.copy(
                        goalFeedbackLoading = false,
                        notice = if (result.synced) "目标信心反馈已同步" else "反馈已保存，联网后自动同步"
                    )
                }
            }
            .onFailure { error ->
                mutableState.update {
                    it.copy(goalFeedbackLoading = false, error = normalizeNetworkError(error).message)
                }
            }
    }

    fun submitWeeklyReview(
        completedSummary: String,
        evidenceSummary: String?,
        difficulties: String?,
        nextWeekMinutes: Int?,
        confidenceTrend: String,
        confidenceReason: String?
    ) = viewModelScope.launch {
        val goal = mutableState.value.goal
        val planId = goal?.planId
        if (planId == null) {
            mutableState.update { it.copy(error = "当前没有可以复盘的行动计划") }
            return@launch
        }
        mutableState.update { it.copy(reviewLoading = true, error = null) }
        runCatching {
            repository.submitWeeklyReview(
                planId = planId,
                weekNo = goal.currentWeek,
                completedSummary = completedSummary,
                evidenceSummary = evidenceSummary,
                difficulties = difficulties,
                nextWeekMinutes = nextWeekMinutes,
                confidenceTrend = confidenceTrend,
                confidenceReason = confidenceReason
            )
        }.onSuccess { result ->
            showSnapshot(result.snapshot)
            mutableState.update {
                it.copy(
                    reviewLoading = false,
                    notice = if (result.synced) "本周复盘已提交" else "复盘已保存，联网后自动同步"
                )
            }
        }.onFailure { error ->
            mutableState.update {
                it.copy(reviewLoading = false, error = normalizeNetworkError(error).message)
            }
        }
    }

    fun clearMessages() {
        mutableState.update { it.copy(notice = null, error = null) }
    }

    private fun showSnapshot(snapshot: RepositorySnapshot) {
        mutableState.update {
            it.copy(
                authenticated = true,
                user = snapshot.user,
                loading = false,
                online = snapshot.online,
                profile = snapshot.dashboard?.profile ?: it.profile,
                goal = snapshot.cache.goal,
                tasks = snapshot.cache.tasks,
                pendingCount = snapshot.cache.pendingCount
            )
        }
    }

    private fun showFailure(error: Throwable) {
        val authenticated = repository.currentSession() != null
        mutableState.update {
            it.copy(
                authenticated = authenticated,
                user = repository.currentSession()?.user,
                loading = false,
                refreshing = false,
                error = normalizeNetworkError(error).message
            )
        }
    }
}

class AppViewModelFactory(private val repository: CareerRepositoryGateway) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        require(modelClass.isAssignableFrom(AppViewModel::class.java))
        return AppViewModel(repository) as T
    }
}
