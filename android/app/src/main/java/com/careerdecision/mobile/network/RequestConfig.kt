package com.careerdecision.mobile.network

import com.careerdecision.mobile.BuildConfig
import okhttp3.logging.HttpLoggingInterceptor

object RequestConfig {
    private const val DEBUG_BACKEND_BASE_URL = "https://192.168.1.159:8443"
    private const val RELEASE_BACKEND_BASE_URL = "https://api.career-decision.example"

    val BACKEND_BASE_URL: String =
        BuildConfig.BACKEND_BASE_URL_OVERRIDE
            .ifBlank { if (BuildConfig.DEBUG) DEBUG_BACKEND_BASE_URL else RELEASE_BACKEND_BASE_URL }
            .trimEnd('/')
    val BACKEND_API_BASE_URL: String = "$BACKEND_BASE_URL/api/v1/"
    const val CONNECT_TIMEOUT_SECONDS = 15L
    const val READ_TIMEOUT_SECONDS = 30L
    const val WRITE_TIMEOUT_SECONDS = 30L
    val HTTP_LOG_LEVEL: HttpLoggingInterceptor.Level =
        if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BASIC else HttpLoggingInterceptor.Level.NONE
}
