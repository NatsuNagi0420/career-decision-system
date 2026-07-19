package com.careerdecision.mobile.network

import com.careerdecision.mobile.BuildConfig
import okhttp3.logging.HttpLoggingInterceptor
import org.junit.Assert.assertFalse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RequestConfigTest {
    @Test
    fun performanceBuildUsesDevelopmentEndpointsWithoutDebugInstrumentation() {
        assertTrue(usesLocalDevelopmentEndpoints(debug = false, buildType = "performance"))
        assertFalse(usesLocalDevelopmentEndpoints(debug = false, buildType = "release"))
    }

    @Test
    fun httpLoggingLevelFollowsBuildDebugFlag() {
        val expected = if (BuildConfig.DEBUG) {
            HttpLoggingInterceptor.Level.BASIC
        } else {
            HttpLoggingInterceptor.Level.NONE
        }

        assertEquals(expected, RequestConfig.HTTP_LOG_LEVEL)
    }

    @Test
    fun backendApiUrlIsDerivedFromSanitizedBackendRoot() {
        assertFalse(RequestConfig.BACKEND_BASE_URL.endsWith("/"))
        assertEquals("${RequestConfig.BACKEND_BASE_URL}/api/v1/", RequestConfig.BACKEND_API_BASE_URL)
    }

    @Test
    fun backendBaseUrlIsConfigured() {
        assertTrue(RequestConfig.BACKEND_BASE_URL.isNotBlank())
        assertTrue(RequestConfig.BACKEND_BASE_URL.startsWith("https://"))
        assertTrue(RequestConfig.WEB_BASE_URL.startsWith("https://"))
    }

    @Test
    fun onlyAssistantChatUsesLongReadTimeout() {
        assertEquals(180L, requestReadTimeoutSeconds("/api/v1/chat/messages"))
        assertEquals(30L, requestReadTimeoutSeconds("/api/v1/chat/sessions"))
        assertEquals(30L, requestReadTimeoutSeconds("/api/v1/profile"))
    }
}
