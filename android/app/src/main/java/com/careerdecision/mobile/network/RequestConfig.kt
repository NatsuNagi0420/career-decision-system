package com.careerdecision.mobile.network

import com.careerdecision.mobile.BuildConfig
import okhttp3.logging.HttpLoggingInterceptor

object RequestConfig {
    private const val DEBUG_BACKEND_BASE_URL = "https://192.168.1.159:8443"
    private const val RELEASE_BACKEND_BASE_URL = "https://api.career-decision.example"
    private const val DEBUG_WEB_BASE_URL = "https://192.168.1.159:5173"
    private const val RELEASE_WEB_BASE_URL = "https://career-decision.example"
    private val usesLocalDevelopmentEndpoints = usesLocalDevelopmentEndpoints(
        debug = BuildConfig.DEBUG,
        buildType = BuildConfig.BUILD_TYPE
    )

    val BACKEND_BASE_URL: String =
        BuildConfig.BACKEND_BASE_URL_OVERRIDE
            .ifBlank {
                if (usesLocalDevelopmentEndpoints) DEBUG_BACKEND_BASE_URL else RELEASE_BACKEND_BASE_URL
            }
            .trimEnd('/')
    val BACKEND_API_BASE_URL: String = "$BACKEND_BASE_URL/api/v1/"
    val WEB_BASE_URL: String = if (usesLocalDevelopmentEndpoints) DEBUG_WEB_BASE_URL else RELEASE_WEB_BASE_URL
    const val CONNECT_TIMEOUT_SECONDS = 15L
    const val READ_TIMEOUT_SECONDS = 30L
    const val ASSISTANT_CHAT_READ_TIMEOUT_SECONDS = 180L
    const val WRITE_TIMEOUT_SECONDS = 30L
    val HTTP_LOG_LEVEL: HttpLoggingInterceptor.Level =
        if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BASIC else HttpLoggingInterceptor.Level.NONE
}

internal fun requestReadTimeoutSeconds(encodedPath: String): Long =
    if (encodedPath.endsWith("/chat/messages")) {
        RequestConfig.ASSISTANT_CHAT_READ_TIMEOUT_SECONDS
    } else RequestConfig.READ_TIMEOUT_SECONDS

internal fun usesLocalDevelopmentEndpoints(debug: Boolean, buildType: String): Boolean =
    debug || buildType == "performance"
