package com.careerdecision.mobile.network

import okhttp3.Request
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CareerApiTraceTest {
    @Test
    fun addsTraceAndAuthorizationHeaders() {
        val request = Request.Builder().url("https://example.test/api/v1/dashboard").build()

        val enriched = CareerApiFactory.withClientHeaders(
            request,
            token = "access-token",
            generatedRequestId = "android-trace-001"
        )

        assertEquals("android-trace-001", enriched.header(CareerApiFactory.REQUEST_ID_HEADER))
        assertEquals("Bearer access-token", enriched.header("Authorization"))
    }

    @Test
    fun retryPreservesExistingTraceHeader() {
        val request = Request.Builder()
            .url("https://example.test/api/v1/dashboard")
            .header(CareerApiFactory.REQUEST_ID_HEADER, "android-original-001")
            .build()

        val enriched = CareerApiFactory.withClientHeaders(
            request,
            token = null,
            generatedRequestId = "android-replacement-001"
        )

        assertEquals("android-original-001", enriched.header(CareerApiFactory.REQUEST_ID_HEADER))
        assertNull(enriched.header("Authorization"))
    }
}
