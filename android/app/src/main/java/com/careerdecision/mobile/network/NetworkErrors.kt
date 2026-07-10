package com.careerdecision.mobile.network

import com.google.gson.JsonSyntaxException
import kotlinx.coroutines.CancellationException
import retrofit2.HttpException
import java.io.IOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

class ApiException(
    message: String,
    val apiCode: Int? = null,
    val httpStatus: Int? = null,
    val traceId: String? = null,
    cause: Throwable? = null
) : RuntimeException(message, cause)

private data class ErrorEnvelope(
    val code: Int? = null,
    val message: String? = null,
    val traceId: String? = null
)

fun normalizeNetworkError(error: Throwable): ApiException {
    if (error is ApiException) {
        return error
    }

    return when (error) {
        is HttpException -> normalizeHttpError(error)
        is SocketTimeoutException -> ApiException("请求超时，请稍后重试", cause = error)
        is UnknownHostException,
        is ConnectException,
        is IOException -> ApiException("网络连接失败，请检查后端服务或网络", cause = error)
        else -> ApiException(error.message?.takeIf { it.isNotBlank() } ?: "请求失败，请稍后重试", cause = error)
    }
}

suspend fun <T> runApiCatching(block: suspend () -> T): Result<T> =
    try {
        Result.success(block())
    } catch (error: CancellationException) {
        throw error
    } catch (error: Throwable) {
        Result.failure(normalizeNetworkError(error))
    }

private fun normalizeHttpError(error: HttpException): ApiException {
    val envelope = parseErrorEnvelope(error)
    val backendMessage = envelope?.message?.takeIf { it.isNotBlank() }
    return ApiException(
        message = backendMessage ?: fallbackHttpMessage(error.code()),
        apiCode = envelope?.code,
        httpStatus = error.code(),
        traceId = envelope?.traceId,
        cause = error
    )
}

private fun parseErrorEnvelope(error: HttpException): ErrorEnvelope? {
    val body = error.response()?.errorBody()?.string()?.takeIf { it.isNotBlank() } ?: return null
    return try {
        CareerApiFactory.gson.fromJson(body, ErrorEnvelope::class.java)
    } catch (_: JsonSyntaxException) {
        null
    }
}

private fun fallbackHttpMessage(status: Int): String =
    when (status) {
        401 -> "登录已过期，请重新登录"
        403 -> "没有权限执行该操作"
        404 -> "请求的资源不存在"
        429 -> "请求过于频繁，请稍后再试"
        in 500..599 -> "服务暂时不可用，请稍后重试"
        else -> "请求失败，请稍后重试"
    }
