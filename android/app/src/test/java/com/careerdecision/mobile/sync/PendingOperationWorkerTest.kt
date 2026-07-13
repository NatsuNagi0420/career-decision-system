package com.careerdecision.mobile.sync

import com.careerdecision.mobile.network.ApiException
import kotlinx.coroutines.CancellationException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PendingOperationWorkerTest {
    @Test
    fun transientFailureIsRetried() {
        assertEquals(
            PendingSyncFailureDisposition.RETRY,
            classifyPendingSyncFailure(ApiException("offline"))
        )
    }

    @Test
    fun permanentAuthenticationFailureIsNotRetried() {
        assertEquals(
            PendingSyncFailureDisposition.FAILURE,
            classifyPendingSyncFailure(
                ApiException("refresh expired", apiCode = 401, httpStatus = 401)
            )
        )
    }

    @Test
    fun cancellationIsPropagated() {
        val error = runCatching {
            classifyPendingSyncFailure(CancellationException("worker stopped"))
        }.exceptionOrNull()

        assertTrue(error is CancellationException)
    }
}
