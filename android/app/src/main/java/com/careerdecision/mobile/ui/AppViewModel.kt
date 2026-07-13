package com.careerdecision.mobile.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.careerdecision.mobile.data.CareerRepositoryGateway
import com.careerdecision.mobile.data.RepositorySnapshot
import com.careerdecision.mobile.data.local.CachedGoalEntity
import com.careerdecision.mobile.data.local.CachedTaskEntity
import com.careerdecision.mobile.network.ActionCoachResponse
import com.careerdecision.mobile.network.ActionPlanDetail
import com.careerdecision.mobile.network.AssistantChatContext
import com.careerdecision.mobile.network.ChatConversation
import com.careerdecision.mobile.network.ChatDeliveryStatus
import com.careerdecision.mobile.network.ChatMessageRole
import com.careerdecision.mobile.network.DashboardReview
import com.careerdecision.mobile.network.UserInfo
import com.careerdecision.mobile.network.UserProfile
import com.careerdecision.mobile.network.UserProfileRequest
import com.careerdecision.mobile.network.DashboardProfile
import com.careerdecision.mobile.network.normalizeNetworkError
import com.careerdecision.mobile.network.runApiCatching
import com.careerdecision.mobile.notification.reminder.ReminderGateway
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

private val submittedReviewStatuses = setOf("submitted", "adjustments_applied")

data class AppUiState(
    val authenticated: Boolean = false,
    val user: UserInfo? = null,
    val profile: DashboardProfile? = null,
    val fullProfile: UserProfile? = null,
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val online: Boolean = false,
    val onboardingRequired: Boolean = false,
    val onboardingSaving: Boolean = false,
    val profileSaving: Boolean = false,
    val goal: CachedGoalEntity? = null,
    val tasks: List<CachedTaskEntity> = emptyList(),
    val planDetail: ActionPlanDetail? = null,
    val milestones: List<PlanMilestoneUi> = emptyList(),
    val pendingCount: Int = 0,
    val busyTaskId: Long? = null,
    val mentorLoading: Boolean = false,
    val chatLoading: Boolean = false,
    val mentorSessionId: Long? = null,
    val mentorMessages: List<MentorMessageUi> = emptyList(),
    val latestReview: DashboardReview? = null,
    val goalFeedbackLoading: Boolean = false,
    val goalFeedbackSubmissionVersion: Long = 0,
    val reviewLoading: Boolean = false,
    val taskMutationVersion: Long = 0,
    val reviewPendingWeek: Int? = null,
    val reviewPendingPlanId: Long? = null,
    val reviewSubmissionVersion: Long = 0,
    val chatSendAcceptedVersion: Long = 0,
    val mentor: ActionCoachResponse? = null,
    val notice: String? = null,
    val error: String? = null
)

class AppViewModel(
    private val repository: CareerRepositoryGateway,
    private val reminderGateway: ReminderGateway? = null
) : ViewModel() {
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
                loadChatConversation(silent = true)
            }
        }
    }

    fun login(username: String, password: String) = viewModelScope.launch {
        mutableState.update { it.copy(loading = true, error = null, notice = null) }
        runApiCatching { repository.login(username, password) }
            .onSuccess {
                showSnapshot(it)
                mutableState.update { state -> state.copy(loading = false, notice = "登录成功") }
                loadChatConversation(silent = true)
            }
            .onFailure(::showFailure)
    }

    fun register(
        username: String,
        password: String,
        confirmPassword: String,
        email: String?
    ) = viewModelScope.launch {
        mutableState.update { it.copy(loading = true, error = null, notice = null) }
        runApiCatching { repository.register(username, password, confirmPassword, email) }
            .onSuccess { snapshot ->
                showSnapshot(snapshot)
                mutableState.update { it.copy(loading = false, notice = "注册成功，请完成基础引导") }
            }
            .onFailure(::showFailure)
    }

    fun logout() = viewModelScope.launch {
        val userId = repository.currentSession()?.user?.id
        runApiCatching { repository.logout() }
            .onSuccess {
                userId?.let { reminderGateway?.cancelAll(it) }
                mutableState.value = AppUiState(loading = false, notice = "已退出登录")
            }
            .onFailure(::handleFailure)
    }

    fun refresh(silent: Boolean = false) = viewModelScope.launch {
        mutableState.update { it.copy(refreshing = true, error = if (silent) it.error else null) }
        runApiCatching { repository.refresh() }
            .onSuccess {
                showSnapshot(it)
                mutableState.update { state -> state.copy(refreshing = false, notice = if (silent) state.notice else "已同步") }
            }
            .onFailure { error ->
                if (repository.currentSession() == null) {
                    showFailure(error)
                } else {
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
        runApiCatching {
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
                    taskMutationVersion = it.taskMutationVersion + 1,
                    notice = if (result.synced) "任务已同步" else "已离线保存，联网后自动同步"
                )
            }
        }.onFailure { error ->
            handleFailure(error) { it.copy(busyTaskId = null) }
        }
    }

    fun addTaskResult(task: CachedTaskEntity, description: String, link: String?) = viewModelScope.launch {
        mutableState.update { it.copy(busyTaskId = task.taskId, error = null) }
        runApiCatching {
            repository.addTaskResult(
                planId = task.planId,
                taskId = task.taskId,
                description = description,
                linkUrl = link
            )
        }.onSuccess { result ->
            showSnapshot(result.snapshot)
            mutableState.update {
                it.copy(
                    busyTaskId = null,
                    taskMutationVersion = it.taskMutationVersion + 1,
                    notice = if (result.synced) "成果已记录" else "成果已离线保存，联网后自动同步"
                )
            }
        }.onFailure { error ->
            handleFailure(error) { it.copy(busyTaskId = null) }
        }
    }

    fun askMentor(focus: String?) = viewModelScope.launch {
        mutableState.update { it.copy(mentorLoading = true, error = null) }
        runApiCatching { repository.requestActionCoach(focus) }
            .onSuccess { result -> mutableState.update { it.copy(mentorLoading = false, mentor = result) } }
            .onFailure { error -> handleFailure(error) { it.copy(mentorLoading = false) } }
    }

    fun loadChatConversation(silent: Boolean = false) = viewModelScope.launch {
        if (!silent) mutableState.update { it.copy(chatLoading = true, error = null) }
        runApiCatching { repository.loadChatConversation() }
            .onSuccess { conversation -> showConversation(conversation, loading = false) }
            .onFailure { error ->
                if (silent && repository.currentSession() != null) {
                    mutableState.update { it.copy(chatLoading = false) }
                } else {
                    handleFailure(error) { it.copy(chatLoading = false) }
                }
            }
    }

    fun sendMentorMessage(message: String) = viewModelScope.launch {
        val cleanMessage = message.trim()
        if (cleanMessage.isBlank()) return@launch
        mutableState.update { it.copy(chatLoading = true, error = null) }
        runApiCatching {
            repository.sendChatMessage(
                message = cleanMessage,
                context = AssistantChatContext(
                    routePath = "/android/mentor",
                    projectId = mutableState.value.goal?.projectId,
                    planId = mutableState.value.goal?.planId,
                    targetId = mutableState.value.goal?.targetId
                )
            )
        }.onSuccess { result ->
            showConversation(result.conversation, loading = false)
            mutableState.update {
                if (result.delivered) {
                    it.copy(chatSendAcceptedVersion = it.chatSendAcceptedVersion + 1)
                } else {
                    it.copy(notice = "消息发送失败，请先重试或开始新会话")
                }
            }
        }.onFailure { error ->
            handleFailure(error) { it.copy(chatLoading = false) }
            // Delivery failures are persisted by the repository before they are rethrown.
            // Reload the conversation so the failed message remains visible and retryable.
            if (repository.currentSession() != null) {
                runApiCatching { repository.loadChatConversation() }
                    .onSuccess { conversation -> showConversation(conversation, loading = false) }
            }
        }
    }

    fun retryMentorMessage(requestId: String) = viewModelScope.launch {
        mutableState.update { it.copy(chatLoading = true, error = null) }
        runApiCatching { repository.retryChatMessage(requestId) }
            .onSuccess { result ->
                showConversation(result.conversation, loading = false)
                if (result.delivered) {
                    mutableState.update { it.copy(chatSendAcceptedVersion = it.chatSendAcceptedVersion + 1) }
                }
            }
            .onFailure { error ->
                handleFailure(error) { it.copy(chatLoading = false) }
                if (repository.currentSession() != null) {
                    runApiCatching { repository.loadChatConversation() }
                        .onSuccess { conversation -> showConversation(conversation, loading = false) }
                }
            }
    }

    fun startNewMentorConversation() = viewModelScope.launch {
        runApiCatching { repository.startNewChatConversation() }
            .onSuccess { showConversation(it, loading = false) }
            .onFailure { error -> handleFailure(error) }
    }

    fun completeOnboarding(form: OnboardingForm, onSaved: () -> Unit = {}) = viewModelScope.launch {
        val expectedVersion = mutableState.value.fullProfile?.profileVersion ?: 1
        mutableState.update { it.copy(onboardingSaving = true, error = null) }
        runApiCatching {
            repository.saveProfile(
                UserProfileRequest(
                    displayName = form.displayName.trim(),
                    identityType = "student",
                    school = form.school.trim(),
                    major = form.major,
                    grade = form.grade,
                    city = form.city.trim(),
                    currentConfusion = form.currentConfusion,
                    existingDirections = form.existingDirections,
                    weeklyAvailableMinutes = form.weeklyAvailableMinutes,
                    completeOnboarding = true,
                    expectedVersion = expectedVersion
                )
            )
            repository.refresh()
        }.onSuccess { snapshot ->
            showSnapshot(snapshot)
            mutableState.update {
                it.copy(onboardingSaving = false, onboardingRequired = false, notice = "基础档案已保存")
            }
            onSaved()
        }.onFailure { error ->
            handleFailure(error) { it.copy(onboardingSaving = false) }
        }
    }

    fun saveAccountProfile(
        displayName: String,
        school: String,
        major: String,
        grade: String,
        city: String,
        onSaved: () -> Unit = {}
    ) = viewModelScope.launch {
        val profile = mutableState.value.fullProfile ?: return@launch
        mutableState.update { it.copy(profileSaving = true, error = null) }
        runApiCatching {
            repository.saveProfile(
                UserProfileRequest(
                    displayName = displayName.trim(),
                    school = school.trim(),
                    major = major.trim(),
                    grade = grade.trim(),
                    city = city.trim(),
                    expectedVersion = profile.profileVersion
                )
            )
        }.onSuccess { updated ->
            mutableState.update { it.copy(fullProfile = updated, profileSaving = false, notice = "个人信息已更新") }
            onSaved()
        }.onFailure { error ->
            handleFailure(error) { it.copy(profileSaving = false) }
        }
    }

    fun updateExternalAiConsent(enabled: Boolean) = viewModelScope.launch {
        val profile = mutableState.value.fullProfile ?: return@launch
        mutableState.update { it.copy(profileSaving = true, error = null) }
        runApiCatching {
            repository.saveProfile(
                UserProfileRequest(
                    externalAiConsent = enabled,
                    expectedVersion = profile.profileVersion
                )
            )
        }.onSuccess { updated ->
            mutableState.update {
                it.copy(
                    fullProfile = updated,
                    profileSaving = false,
                    notice = if (enabled) "外部 AI 授权已开启" else "外部 AI 授权已关闭"
                )
            }
        }.onFailure { error ->
            handleFailure(error) { it.copy(profileSaving = false) }
        }
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
        runApiCatching { repository.submitGoalConfidence(projectId, targetId, trend, reason) }
            .onSuccess { result ->
                showSnapshot(result.snapshot)
                mutableState.update {
                    it.copy(
                        goalFeedbackLoading = false,
                        goalFeedbackSubmissionVersion = it.goalFeedbackSubmissionVersion + 1,
                        notice = if (result.synced) "目标信心反馈已同步" else "反馈已保存，联网后自动同步"
                    )
                }
            }
            .onFailure { error ->
                handleFailure(error) { it.copy(goalFeedbackLoading = false) }
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
        val currentWeek = goal.currentWeek
        val currentState = mutableState.value
        val alreadySubmitted = currentState.latestReview?.let {
            it.planId == planId &&
                it.weekNo == currentWeek &&
                it.status in submittedReviewStatuses
        } == true
        val alreadyPending = currentState.reviewPendingPlanId == planId &&
            currentState.reviewPendingWeek == currentWeek
        if (alreadySubmitted || alreadyPending) {
            mutableState.update {
                it.copy(
                    notice = if (alreadySubmitted) "本周复盘已提交" else "本周复盘已保存，等待同步"
                )
            }
            return@launch
        }
        mutableState.update { it.copy(reviewLoading = true, error = null) }
        runApiCatching {
            repository.submitWeeklyReview(
                planId = planId,
                weekNo = currentWeek,
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
                val remoteReview = result.snapshot.dashboard?.latestReview
                val submittedReview = remoteReview?.takeIf {
                    it.planId == planId &&
                        it.weekNo == currentWeek &&
                        it.status in submittedReviewStatuses
                } ?: if (result.synced) {
                    // The mutation succeeded even if the dashboard response is stale.
                    DashboardReview(
                        id = 0L,
                        planId = planId,
                        weekNo = currentWeek,
                        status = "submitted",
                        updatedAt = null
                    )
                } else {
                    null
                }
                it.copy(
                    latestReview = submittedReview ?: it.latestReview,
                    reviewLoading = false,
                    reviewPendingWeek = if (result.synced) null else currentWeek,
                    reviewPendingPlanId = if (result.synced) null else planId,
                    reviewSubmissionVersion = it.reviewSubmissionVersion + 1,
                    notice = if (result.synced) "本周复盘已提交" else "复盘已保存，联网后自动同步"
                )
            }
        }.onFailure { error ->
            handleFailure(error) { it.copy(reviewLoading = false) }
        }
    }

    fun clearMessages() {
        mutableState.update { it.copy(notice = null, error = null) }
    }

    private fun showSnapshot(snapshot: RepositorySnapshot) {
        val currentWeek = snapshot.cache.goal?.currentWeek ?: 1
        val milestones = snapshot.planDetail?.weeks.orEmpty().map { week ->
            val completed = week.tasks.count { it.status == "completed" }
            PlanMilestoneUi(
                weekNo = week.weekNo,
                title = week.title,
                goal = week.goal,
                completedTasks = completed,
                totalTasks = week.tasks.size,
                current = week.weekNo == currentWeek
            )
        }
        mutableState.update {
            val remoteReview = snapshot.dashboard?.latestReview
            val reviewWasSubmitted = remoteReview?.let {
                it.planId == snapshot.cache.goal?.planId &&
                    it.weekNo == currentWeek &&
                    it.status in submittedReviewStatuses
            } == true
            it.copy(
                authenticated = true,
                user = snapshot.user,
                loading = false,
                online = snapshot.online,
                profile = snapshot.dashboard?.profile ?: it.profile,
                fullProfile = snapshot.fullProfile ?: it.fullProfile,
                onboardingRequired = snapshot.online && snapshot.fullProfile?.onboardingCompleted == false,
                goal = snapshot.cache.goal,
                tasks = snapshot.cache.tasks,
                planDetail = snapshot.planDetail ?: it.planDetail,
                milestones = if (snapshot.planDetail != null) milestones else it.milestones,
                pendingCount = snapshot.cache.pendingCount,
                latestReview = remoteReview ?: it.latestReview,
                reviewPendingWeek = if (reviewWasSubmitted) null else snapshot.cache.pendingReviewWeekNo,
                reviewPendingPlanId = if (reviewWasSubmitted) null else snapshot.cache.pendingReviewPlanId
            )
        }
        reminderGateway?.reconcileTaskReminders(snapshot.user.id, snapshot.cache.tasks)
        if (snapshot.cache.goal?.planId != null && snapshot.cache.goal.status == "active") {
            reminderGateway?.scheduleWeeklyReview(snapshot.user.id)
        } else {
            reminderGateway?.cancelWeeklyReview(snapshot.user.id)
        }
    }

    private fun showConversation(conversation: ChatConversation, loading: Boolean) {
        val messages = conversation.messages.map { message ->
            val response = message.response
            MentorMessageUi(
                localId = "${message.requestId}:${message.role}",
                requestId = message.requestId,
                role = message.role,
                content = message.content,
                generationMode = response?.generationMode,
                confidence = response?.confidence,
                evidence = response?.evidenceBasis.orEmpty().map { it.statement },
                uncertainties = response?.uncertainties.orEmpty(),
                nextStep = response?.nextStep,
                pending = message.role == ChatMessageRole.USER && message.deliveryStatus == ChatDeliveryStatus.PENDING,
                failed = message.role == ChatMessageRole.USER && message.deliveryStatus == ChatDeliveryStatus.FAILED,
                createdAt = message.createdAt.toString()
            )
        }
        mutableState.update {
            it.copy(
                chatLoading = loading,
                mentorSessionId = conversation.sessionId,
                mentorMessages = messages
            )
        }
    }

    private fun showFailure(error: Throwable) {
        val currentSession = repository.currentSession()
        val message = normalizeNetworkError(error).message
        if (currentSession == null) {
            mutableState.value.user?.id?.let { reminderGateway?.cancelAll(it) }
            mutableState.value = AppUiState(loading = false, error = message)
        } else {
            mutableState.update {
                it.copy(
                    authenticated = true,
                    user = currentSession.user,
                    loading = false,
                    refreshing = false,
                    error = message
                )
            }
        }
    }

    private fun handleFailure(error: Throwable, update: (AppUiState) -> AppUiState = { it }) {
        if (repository.currentSession() == null) {
            showFailure(error)
        } else {
            mutableState.update {
                update(it).copy(error = normalizeNetworkError(error).message)
            }
        }
    }
}

class AppViewModelFactory(
    private val repository: CareerRepositoryGateway,
    private val reminderGateway: ReminderGateway? = null
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        require(modelClass.isAssignableFrom(AppViewModel::class.java))
        return AppViewModel(repository, reminderGateway) as T
    }
}
