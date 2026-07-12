package com.careerdecision.mobile.ui

import com.careerdecision.mobile.data.CareerRepository
import com.careerdecision.mobile.data.FakeActionCache
import com.careerdecision.mobile.data.FakeCareerRemote
import com.careerdecision.mobile.data.FakeScheduler
import com.careerdecision.mobile.data.FakeSessionGateway
import com.careerdecision.mobile.data.PLAN
import com.careerdecision.mobile.data.TEST_SESSION
import com.careerdecision.mobile.data.TEST_USER
import com.careerdecision.mobile.data.TODAY
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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
}

@OptIn(ExperimentalCoroutinesApi::class)
class MainDispatcherRule(
    private val dispatcher: TestDispatcher = StandardTestDispatcher()
) : TestWatcher() {
    override fun starting(description: Description) { Dispatchers.setMain(dispatcher) }
    override fun finished(description: Description) { Dispatchers.resetMain() }
}
