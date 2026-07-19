package com.careerdecision.mobile.ui

import com.careerdecision.mobile.data.CareerRepository
import com.careerdecision.mobile.data.CHAT_RESPONSE
import com.careerdecision.mobile.data.FakeActionCache
import com.careerdecision.mobile.data.FakeCareerRemote
import com.careerdecision.mobile.data.FakeScheduler
import com.careerdecision.mobile.data.FakeSessionGateway
import com.careerdecision.mobile.data.PLAN
import com.careerdecision.mobile.data.PENDING_STATUS_OPERATION
import com.careerdecision.mobile.data.TEST_SESSION
import com.careerdecision.mobile.data.TEST_USER
import com.careerdecision.mobile.data.TODAY
import com.careerdecision.mobile.data.CareerRemoteDataSource
import com.careerdecision.mobile.network.ApiException
import com.careerdecision.mobile.network.AssistantChatRequest
import com.careerdecision.mobile.network.AssistantChatResponse
import com.careerdecision.mobile.network.AssistantChatAction
import com.careerdecision.mobile.network.ChatSessionDeletion
import com.careerdecision.mobile.network.DashboardReview
import com.careerdecision.mobile.network.LoginResponse
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TestWatcher
import org.junit.runner.Description

@OptIn(ExperimentalCoroutinesApi::class)
class AppViewModelTest {
    @get:Rule
    val dispatcherRule = MainDispatcherRule()

    @Test
    fun restoredSessionLoadsTodayAndUpdatesTask() = runTest {
        val cache = FakeActionCache().apply { replace(TEST_USER.id, TODAY, PLAN) }
        val remote = FakeCareerRemote()
        val repository = CareerRepository(FakeSessionGateway(TEST_SESSION), remote, cache, FakeScheduler())
        val viewModel = AppViewModel(repository)

        advanceUntilIdle()

        assertTrue(viewModel.state.value.authenticated)
        assertTrue(viewModel.state.value.online)
        assertEquals("Java 后端", viewModel.state.value.goal?.targetRole)
        assertEquals("todo", viewModel.state.value.tasks.single().status)

        viewModel.updateTask(viewModel.state.value.tasks.single(), "in_progress")
        advanceUntilIdle()

        assertEquals("in_progress", viewModel.state.value.tasks.single().status)
        assertEquals(0, viewModel.state.value.pendingCount)
        assertFalse(viewModel.state.value.loading)
    }

    @Test
    fun mentorResultUsesStructuredAgentContract() = runTest {
        val cache = FakeActionCache().apply { replace(TEST_USER.id, TODAY, PLAN) }
        val repository = CareerRepository(
            FakeSessionGateway(TEST_SESSION), FakeCareerRemote(), cache, FakeScheduler()
        )
        val viewModel = AppViewModel(repository)
        advanceUntilIdle()

        viewModel.askMentor("本周先做什么")
        advanceUntilIdle()

        assertEquals("fallback", viewModel.state.value.mentor?.generationMode)
        assertEquals("先完成岗位样本验证", viewModel.state.value.mentor?.conclusion)
    }

    @Test
    fun permanentChatAuthenticationFailureReturnsToLogin() = runTest {
        val cache = FakeActionCache().apply { replace(TEST_USER.id, TODAY, PLAN) }
        val baseRemote = FakeCareerRemote()
        val remote = object : CareerRemoteDataSource by baseRemote {
            override suspend fun sendChatMessage(request: AssistantChatRequest): AssistantChatResponse {
                throw ApiException("登录已过期", apiCode = 401, httpStatus = 401)
            }

            override suspend fun refresh(refreshToken: String): LoginResponse {
                throw ApiException("刷新令牌已失效", apiCode = 401, httpStatus = 401)
            }
        }
        val repository = CareerRepository(
            FakeSessionGateway(TEST_SESSION), remote, cache, FakeScheduler()
        )
        val viewModel = AppViewModel(repository)
        advanceUntilIdle()
        assertTrue(viewModel.state.value.authenticated)

        viewModel.sendMentorMessage("今天先做什么")
        advanceUntilIdle()

        assertFalse(viewModel.state.value.authenticated)
        assertNull(repository.currentSession())
        assertTrue(viewModel.state.value.error?.contains("失效") == true)
    }

    @Test
    fun dashboardLatestReviewMarksCurrentWeekAndBlocksDuplicateReview() = runTest {
        val cache = FakeActionCache().apply { replace(TEST_USER.id, TODAY, PLAN) }
        val baseRemote = FakeCareerRemote()
        val remote = object : CareerRemoteDataSource by baseRemote {
            override suspend fun dashboard() = baseRemote.dashboard().copy(
                latestReview = DashboardReview(
                    id = 901L,
                    planId = PLAN.id,
                    weekNo = TODAY.weekNo,
                    status = "submitted",
                    updatedAt = "2026-07-12T08:00:00"
                )
            )
        }
        val repository = CareerRepository(
            FakeSessionGateway(TEST_SESSION), remote, cache, FakeScheduler()
        )
        val viewModel = AppViewModel(repository)
        advanceUntilIdle()

        assertEquals("submitted", viewModel.state.value.latestReview?.status)
        viewModel.submitWeeklyReview("再次提交", null, null, 300, "stable", null)
        advanceUntilIdle()

        assertEquals(0, baseRemote.reviewRequests.size)
        assertTrue(viewModel.state.value.notice?.contains("已提交") == true)
    }

    @Test
    fun goalFeedbackEmitsSuccessSignalOnlyAfterRepositoryAcceptsIt() = runTest {
        val cache = FakeActionCache().apply { replace(TEST_USER.id, TODAY, PLAN) }
        val repository = CareerRepository(
            FakeSessionGateway(TEST_SESSION), FakeCareerRemote(), cache, FakeScheduler()
        )
        val viewModel = AppViewModel(repository)
        advanceUntilIdle()

        viewModel.submitGoalConfidence("increased", "完成了真实岗位验证")
        advanceUntilIdle()

        assertEquals(1L, viewModel.state.value.goalFeedbackSubmissionVersion)
        assertFalse(viewModel.state.value.goalFeedbackLoading)
    }

    @Test
    fun offlineReviewIsMarkedPendingAndCannotBeQueuedTwice() = runTest {
        val cache = FakeActionCache().apply { replace(TEST_USER.id, TODAY, PLAN) }
        val remote = FakeCareerRemote()
        val repository = CareerRepository(
            FakeSessionGateway(TEST_SESSION), remote, cache, FakeScheduler()
        )
        val viewModel = AppViewModel(repository)
        advanceUntilIdle()

        remote.offline = true
        viewModel.submitWeeklyReview("本周完成了验证", null, null, 300, "stable", null)
        advanceUntilIdle()

        assertEquals(TODAY.weekNo, viewModel.state.value.reviewPendingWeek)
        assertEquals(1L, viewModel.state.value.reviewSubmissionVersion)
        assertEquals(1, cache.pending(TEST_USER.id).count { it.operationType == "weekly_review" })

        viewModel.submitWeeklyReview("重复提交", null, null, 300, "stable", null)
        advanceUntilIdle()

        assertEquals(1, cache.pending(TEST_USER.id).count { it.operationType == "weekly_review" })
    }

    @Test
    fun pendingReviewIsRestoredAfterProcessRecreation() = runTest {
        val cache = FakeActionCache().apply { replace(TEST_USER.id, TODAY, PLAN) }
        val remote = FakeCareerRemote(offline = true)
        val firstRepository = CareerRepository(
            FakeSessionGateway(TEST_SESSION), remote, cache, FakeScheduler()
        )
        firstRepository.submitWeeklyReview(
            planId = PLAN.id,
            weekNo = TODAY.weekNo,
            completedSummary = "离线复盘",
            evidenceSummary = null,
            difficulties = null,
            nextWeekMinutes = 300,
            confidenceTrend = "stable",
            confidenceReason = null
        )

        val restoredRepository = CareerRepository(
            FakeSessionGateway(TEST_SESSION), remote, cache, FakeScheduler()
        )
        val restoredViewModel = AppViewModel(restoredRepository)
        advanceUntilIdle()

        assertEquals(PLAN.id, restoredViewModel.state.value.reviewPendingPlanId)
        assertEquals(TODAY.weekNo, restoredViewModel.state.value.reviewPendingWeek)

        restoredViewModel.submitWeeklyReview("不应重复", null, null, 300, "stable", null)
        advanceUntilIdle()

        assertEquals(1, cache.pending(TEST_USER.id).count { it.operationType == "weekly_review" })
    }

    @Test
    fun failedChatDeliveryKeepsFailedMessageWithoutAcceptedSendSignal() = runTest {
        val cache = FakeActionCache().apply { replace(TEST_USER.id, TODAY, PLAN) }
        val remote = FakeCareerRemote().apply { failNextChat = true }
        val repository = CareerRepository(
            FakeSessionGateway(TEST_SESSION), remote, cache, FakeScheduler()
        )
        val viewModel = AppViewModel(repository)
        advanceUntilIdle()

        viewModel.sendMentorMessage("保留这条草稿")
        advanceUntilIdle()

        assertEquals(0L, viewModel.state.value.chatSendAcceptedVersion)
        assertTrue(viewModel.state.value.mentorMessages.any { it.failed })
    }

    @Test
    fun successfulChatRetryEmitsAcceptedSendSignal() = runTest {
        val cache = FakeActionCache().apply { replace(TEST_USER.id, TODAY, PLAN) }
        val remote = FakeCareerRemote().apply { failNextChat = true }
        val repository = CareerRepository(
            FakeSessionGateway(TEST_SESSION), remote, cache, FakeScheduler()
        )
        val viewModel = AppViewModel(repository)
        advanceUntilIdle()

        viewModel.sendMentorMessage("先保留这条消息")
        advanceUntilIdle()
        val failed = viewModel.state.value.mentorMessages.first { it.failed }

        viewModel.retryMentorMessage(requireNotNull(failed.requestId))
        advanceUntilIdle()

        assertEquals(1L, viewModel.state.value.chatSendAcceptedVersion)
        assertTrue(viewModel.state.value.mentorMessages.none { it.failed })
    }

    @Test
    fun mentorShowsThinkingUntilReplyAndCarriesReplyActionsIntoUiState() = runTest {
        val cache = FakeActionCache().apply { replace(TEST_USER.id, TODAY, PLAN) }
        val responseGate = CompletableDeferred<Unit>()
        val baseRemote = FakeCareerRemote()
        val remote = object : CareerRemoteDataSource by baseRemote {
            override suspend fun sendChatMessage(request: AssistantChatRequest): AssistantChatResponse {
                responseGate.await()
                return CHAT_RESPONSE.copy(
                    sessionId = request.sessionId ?: CHAT_RESPONSE.sessionId,
                    reply = "先完成一个最小验证动作",
                    confidence = 0.9,
                    actions = listOf(
                        AssistantChatAction("查看行动计划", "go:action-plans")
                    )
                )
            }
        }
        val repository = CareerRepository(
            FakeSessionGateway(TEST_SESSION), remote, cache, FakeScheduler()
        )
        val viewModel = AppViewModel(repository)
        advanceUntilIdle()

        viewModel.sendMentorMessage("下一步做什么")
        runCurrent()

        assertTrue("The thinking portrait must remain active while awaiting the reply", viewModel.state.value.mentorResponding)

        responseGate.complete(Unit)
        advanceUntilIdle()

        val reply = viewModel.state.value.mentorMessages.last { it.role == "assistant" }
        assertTrue("Reply actions must reach the visual-state mapper", reply.hasActions)
        assertFalse(viewModel.state.value.mentorResponding)
    }

    @Test
    fun sendingToADeletedSessionStartsFreshWithoutLosingTheDraftSignal() = runTest {
        val cache = FakeActionCache().apply { replace(TEST_USER.id, TODAY, PLAN) }
        val baseRemote = FakeCareerRemote()
        var sessionDeleted = false
        val remote = object : CareerRemoteDataSource by baseRemote {
            override suspend fun sendChatMessage(request: AssistantChatRequest): AssistantChatResponse {
                if (sessionDeleted && request.sessionId != null) {
                    throw ApiException("Resource not found.", apiCode = 40490, httpStatus = 404)
                }
                return baseRemote.sendChatMessage(request)
            }
        }
        val repository = CareerRepository(
            FakeSessionGateway(TEST_SESSION), remote, cache, FakeScheduler()
        )
        val viewModel = AppViewModel(repository)
        advanceUntilIdle()
        viewModel.sendMentorMessage("先建立一段会话")
        advanceUntilIdle()
        sessionDeleted = true

        viewModel.sendMentorMessage("这条内容需要保留在输入框")
        advanceUntilIdle()

        assertNull(viewModel.state.value.mentorSessionId)
        assertTrue(viewModel.state.value.mentorMessages.isEmpty())
        assertEquals(1L, viewModel.state.value.chatSendAcceptedVersion)
        assertEquals(0L, viewModel.state.value.mentorConversationResetVersion)
        assertTrue(viewModel.state.value.notice?.contains("已经删除") == true)
        assertNull(viewModel.state.value.error)
    }

    @Test
    fun deletingCurrentMentorSessionClearsMessagesOnlyAfterServerSuccess() = runTest {
        val cache = FakeActionCache().apply { replace(TEST_USER.id, TODAY, PLAN) }
        val remote = FakeCareerRemote()
        val repository = CareerRepository(
            FakeSessionGateway(TEST_SESSION), remote, cache, FakeScheduler()
        )
        val viewModel = AppViewModel(repository)
        advanceUntilIdle()
        viewModel.sendMentorMessage("这段会话稍后删除")
        advanceUntilIdle()

        viewModel.deleteMentorSession(12001L)
        advanceUntilIdle()

        assertNull(viewModel.state.value.mentorSessionId)
        assertTrue(viewModel.state.value.mentorMessages.isEmpty())
        assertEquals(1L, viewModel.state.value.mentorConversationResetVersion)
        assertNull(viewModel.state.value.mentorSessionDeleting)
        assertEquals(listOf(12001L), remote.deletedChatSessionIds)
    }

    @Test
    fun alreadyDeletedMentorSessionIsRemovedFromStaleLocalState() = runTest {
        val cache = FakeActionCache().apply { replace(TEST_USER.id, TODAY, PLAN) }
        val baseRemote = FakeCareerRemote()
        val remote = object : CareerRemoteDataSource by baseRemote {
            override suspend fun deleteChatSession(sessionId: Long): ChatSessionDeletion {
                throw ApiException("Resource not found.", apiCode = 40490, httpStatus = 404)
            }
        }
        val repository = CareerRepository(
            FakeSessionGateway(TEST_SESSION), remote, cache, FakeScheduler()
        )
        val viewModel = AppViewModel(repository)
        advanceUntilIdle()
        viewModel.sendMentorMessage("另一台设备已经删除")
        advanceUntilIdle()

        viewModel.deleteMentorSession(12001L)
        advanceUntilIdle()

        assertNull(viewModel.state.value.mentorSessionId)
        assertTrue(viewModel.state.value.mentorMessages.isEmpty())
        assertTrue(viewModel.state.value.notice?.contains("已经删除") == true)
        assertNull(viewModel.state.value.error)
    }

    @Test
    fun offlineMentorDeletionKeepsConversationAvailableForRetry() = runTest {
        val cache = FakeActionCache().apply { replace(TEST_USER.id, TODAY, PLAN) }
        val remote = FakeCareerRemote()
        val repository = CareerRepository(
            FakeSessionGateway(TEST_SESSION), remote, cache, FakeScheduler()
        )
        val viewModel = AppViewModel(repository)
        advanceUntilIdle()
        viewModel.sendMentorMessage("离线时不要假删除")
        advanceUntilIdle()
        remote.offline = true

        viewModel.deleteMentorSession(12001L)
        advanceUntilIdle()

        assertEquals(12001L, viewModel.state.value.mentorSessionId)
        assertTrue(viewModel.state.value.mentorMessages.isNotEmpty())
        assertNull(viewModel.state.value.mentorSessionDeleting)
        assertTrue(viewModel.state.value.error?.isNotBlank() == true)
        assertTrue(remote.deletedChatSessionIds.isEmpty())
    }

    @Test
    fun logoutWithPendingOperationsKeepsSessionAndExplainsSyncRequirement() = runTest {
        val cache = FakeActionCache().apply {
            enqueue(PENDING_STATUS_OPERATION.copy(operationId = "logout-pending"))
        }
        val remote = FakeCareerRemote(offline = true)
        val repository = CareerRepository(
            FakeSessionGateway(TEST_SESSION), remote, cache, FakeScheduler()
        )
        val viewModel = AppViewModel(repository)
        advanceUntilIdle()

        viewModel.logout()
        advanceUntilIdle()

        assertTrue(viewModel.state.value.authenticated)
        assertEquals(TEST_SESSION, repository.currentSession())
        assertTrue(viewModel.state.value.error?.contains("尚未同步") == true)
    }

    @Test
    fun onboardingDraftClearSignalWaitsForSuccessfulSave() = runTest {
        val remote = FakeCareerRemote()
        val repository = CareerRepository(
            FakeSessionGateway(TEST_SESSION), remote, FakeActionCache(), FakeScheduler()
        )
        val viewModel = AppViewModel(repository)
        advanceUntilIdle()
        remote.profileRequests.clear()

        val form = OnboardingForm(
            displayName = "  ",
            school = "",
            major = "Computer Science",
            grade = "Junior",
            city = "  ",
            currentConfusion = "Choose a direction",
            existingDirections = listOf("Backend"),
            weeklyAvailableMinutes = 300
        )
        var savedSignals = 0

        remote.offline = true
        viewModel.completeOnboarding(form) { savedSignals += 1 }
        advanceUntilIdle()

        assertEquals(0, savedSignals)

        remote.offline = false
        viewModel.completeOnboarding(form) { savedSignals += 1 }
        advanceUntilIdle()

        assertEquals(1, savedSignals)
        assertEquals("", remote.profileRequests.single().displayName)
        assertEquals("", remote.profileRequests.single().school)
        assertEquals("", remote.profileRequests.single().city)
    }

    @Test
    fun profileEditorClosesOnlyAfterSuccessAndBlankFieldsClearExistingValues() = runTest {
        val remote = FakeCareerRemote()
        val repository = CareerRepository(
            FakeSessionGateway(TEST_SESSION), remote, FakeActionCache(), FakeScheduler()
        )
        val viewModel = AppViewModel(repository)
        advanceUntilIdle()
        remote.profileRequests.clear()
        var savedSignals = 0

        remote.offline = true
        viewModel.saveAccountProfile("", "", "", "", "") { savedSignals += 1 }
        advanceUntilIdle()

        assertEquals(0, savedSignals)

        remote.offline = false
        viewModel.saveAccountProfile("  ", "", "  ", "", "  ") { savedSignals += 1 }
        advanceUntilIdle()

        assertEquals(1, savedSignals)
        val request = remote.profileRequests.single()
        assertEquals("", request.displayName)
        assertEquals("", request.school)
        assertEquals("", request.major)
        assertEquals("", request.grade)
        assertEquals("", request.city)
    }
}

@OptIn(ExperimentalCoroutinesApi::class)
class MainDispatcherRule(
    private val dispatcher: TestDispatcher = StandardTestDispatcher()
) : TestWatcher() {
    override fun starting(description: Description) { Dispatchers.setMain(dispatcher) }
    override fun finished(description: Description) { Dispatchers.resetMain() }
}
