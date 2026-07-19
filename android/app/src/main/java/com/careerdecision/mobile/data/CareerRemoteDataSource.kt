package com.careerdecision.mobile.data

import com.careerdecision.mobile.network.ActionCoachResponse
import com.careerdecision.mobile.network.ActionPlanDetail
import com.careerdecision.mobile.network.ActionPlanSummary
import com.careerdecision.mobile.network.ActionTaskResultRequest
import com.careerdecision.mobile.network.ActionTaskStatusRequest
import com.careerdecision.mobile.network.ArchivedPathPlan
import com.careerdecision.mobile.network.ArchivedResumeAnalysis
import com.careerdecision.mobile.network.AssistantChatRequest
import com.careerdecision.mobile.network.AssistantChatResponse
import com.careerdecision.mobile.network.ChatSessionDetail
import com.careerdecision.mobile.network.ChatSessionDeletion
import com.careerdecision.mobile.network.ChatSessionSummary
import com.careerdecision.mobile.network.CareerApi
import com.careerdecision.mobile.network.CoachingRequest
import com.careerdecision.mobile.network.ConfidenceFeedbackRequest
import com.careerdecision.mobile.network.ConfidenceFeedbackResponse
import com.careerdecision.mobile.network.DashboardResponse
import com.careerdecision.mobile.network.DecisionProjectDetail
import com.careerdecision.mobile.network.LoginRequest
import com.careerdecision.mobile.network.LoginResponse
import com.careerdecision.mobile.network.PathPlanSnapshot
import com.careerdecision.mobile.network.PersonalEvidence
import com.careerdecision.mobile.network.RefreshTokenRequest
import com.careerdecision.mobile.network.RegisterRequest
import com.careerdecision.mobile.network.ReportPage
import com.careerdecision.mobile.network.ReportSnapshot
import com.careerdecision.mobile.network.ResumeAnalysisSnapshot
import com.careerdecision.mobile.network.TodayResponse
import com.careerdecision.mobile.network.UserInfo
import com.careerdecision.mobile.network.UserProfile
import com.careerdecision.mobile.network.UserProfileRequest
import com.careerdecision.mobile.network.WeeklyReviewRequest
import com.careerdecision.mobile.network.WeeklyReviewResponse
import com.careerdecision.mobile.network.requireSuccess
import com.careerdecision.mobile.network.unwrap

interface CareerRemoteDataSource {
    suspend fun register(request: RegisterRequest): UserInfo
    suspend fun login(username: String, password: String): LoginResponse
    suspend fun refresh(refreshToken: String): LoginResponse
    suspend fun logout()
    suspend fun dashboard(): DashboardResponse
    suspend fun decisionProject(projectId: Long): DecisionProjectDetail? = null
    suspend fun personalEvidence(): List<PersonalEvidence>? = null
    suspend fun today(): TodayResponse
    suspend fun actionPlans(): List<ActionPlanSummary>
    suspend fun actionPlan(planId: Long): ActionPlanDetail
    suspend fun updateTaskStatus(
        planId: Long,
        taskId: Long,
        request: ActionTaskStatusRequest
    ): ActionPlanDetail
    suspend fun addTaskResult(
        planId: Long,
        taskId: Long,
        request: ActionTaskResultRequest
    ): ActionPlanDetail
    suspend fun coachActionPlan(planId: Long, request: CoachingRequest): ActionCoachResponse
    suspend fun sendChatMessage(request: AssistantChatRequest): AssistantChatResponse
    suspend fun chatSessions(): List<ChatSessionSummary> = emptyList()
    suspend fun chatSession(sessionId: Long): ChatSessionDetail =
        throw UnsupportedOperationException("Chat session history is unavailable")
    suspend fun deleteChatSession(sessionId: Long): ChatSessionDeletion =
        throw UnsupportedOperationException("Chat session deletion is unavailable")
    suspend fun reports(page: Int = 0, size: Int = 50): ReportPage
    suspend fun report(id: String): ReportSnapshot
    suspend fun deleteReport(id: String)
    suspend fun resumeAnalyses(page: Int = 0, size: Int = 50): List<ResumeAnalysisSnapshot>
    suspend fun resumeAnalysis(id: Long): ArchivedResumeAnalysis
    suspend fun deleteResumeAnalysis(id: Long)
    suspend fun pathPlans(page: Int = 0, size: Int = 50): List<PathPlanSnapshot>
    suspend fun pathPlan(id: Long): ArchivedPathPlan
    suspend fun deletePathPlan(id: Long)
    suspend fun profile(): UserProfile
    suspend fun saveProfile(request: UserProfileRequest): UserProfile
    suspend fun submitConfidenceFeedback(
        projectId: Long,
        targetId: Long,
        request: ConfidenceFeedbackRequest
    ): ConfidenceFeedbackResponse
    suspend fun submitWeeklyReview(request: WeeklyReviewRequest): WeeklyReviewResponse
}

class RetrofitCareerRemoteDataSource(private val api: CareerApi) : CareerRemoteDataSource {
    override suspend fun register(request: RegisterRequest): UserInfo = api.register(request).unwrap()

    override suspend fun login(username: String, password: String): LoginResponse =
        api.login(LoginRequest(username, password)).unwrap()

    override suspend fun refresh(refreshToken: String): LoginResponse =
        api.refresh(RefreshTokenRequest(refreshToken)).unwrap()

    override suspend fun logout() {
        api.logout().requireSuccess()
    }

    override suspend fun dashboard(): DashboardResponse = api.dashboard().unwrap()
    override suspend fun decisionProject(projectId: Long): DecisionProjectDetail =
        api.decisionProject(projectId).unwrap()

    override suspend fun personalEvidence(): List<PersonalEvidence> =
        api.personalEvidence().unwrap()

    override suspend fun today(): TodayResponse = api.today().unwrap()
    override suspend fun actionPlans(): List<ActionPlanSummary> = api.actionPlans().unwrap()
    override suspend fun actionPlan(planId: Long): ActionPlanDetail = api.actionPlan(planId).unwrap()

    override suspend fun updateTaskStatus(
        planId: Long,
        taskId: Long,
        request: ActionTaskStatusRequest
    ): ActionPlanDetail = api.updateActionTaskStatus(planId, taskId, request).unwrap()

    override suspend fun addTaskResult(
        planId: Long,
        taskId: Long,
        request: ActionTaskResultRequest
    ): ActionPlanDetail = api.addActionTaskResult(planId, taskId, request).unwrap()

    override suspend fun coachActionPlan(planId: Long, request: CoachingRequest): ActionCoachResponse =
        api.coachActionPlan(planId, request).unwrap()

    override suspend fun sendChatMessage(request: AssistantChatRequest): AssistantChatResponse =
        api.sendChatMessage(request).unwrap()

    override suspend fun chatSessions(): List<ChatSessionSummary> = api.chatSessions().unwrap()

    override suspend fun chatSession(sessionId: Long): ChatSessionDetail = api.chatSession(sessionId).unwrap()

    override suspend fun deleteChatSession(sessionId: Long): ChatSessionDeletion =
        api.deleteChatSession(sessionId).unwrap()

    override suspend fun reports(page: Int, size: Int): ReportPage =
        api.reports(page = page, size = size).unwrap()

    override suspend fun report(id: String): ReportSnapshot = api.report(id).unwrap()

    override suspend fun deleteReport(id: String) {
        api.deleteReport(id).requireSuccess()
    }

    override suspend fun resumeAnalyses(page: Int, size: Int): List<ResumeAnalysisSnapshot> =
        api.resumeAnalyses(page, size).unwrap()

    override suspend fun resumeAnalysis(id: Long): ArchivedResumeAnalysis =
        api.resumeAnalysis(id).unwrap()

    override suspend fun deleteResumeAnalysis(id: Long) {
        api.deleteResumeAnalysis(id).requireSuccess()
    }

    override suspend fun pathPlans(page: Int, size: Int): List<PathPlanSnapshot> =
        api.pathPlans(page, size).unwrap()

    override suspend fun pathPlan(id: Long): ArchivedPathPlan = api.pathPlan(id).unwrap()

    override suspend fun deletePathPlan(id: Long) {
        api.deletePathPlan(id).requireSuccess()
    }

    override suspend fun profile(): UserProfile = api.profile().unwrap()

    override suspend fun saveProfile(request: UserProfileRequest): UserProfile = api.saveProfile(request).unwrap()

    override suspend fun submitConfidenceFeedback(
        projectId: Long,
        targetId: Long,
        request: ConfidenceFeedbackRequest
    ): ConfidenceFeedbackResponse = api.submitConfidenceFeedback(projectId, targetId, request).unwrap()

    override suspend fun submitWeeklyReview(request: WeeklyReviewRequest): WeeklyReviewResponse {
        val draft = api.saveWeeklyReview(request).unwrap()
        return if (draft.status == "draft") api.submitWeeklyReview(draft.id).unwrap() else draft
    }
}
