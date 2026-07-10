package com.careerdecision.mobile.network

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.fail
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import java.net.SocketTimeoutException
import java.net.UnknownHostException

class NetworkErrorsTest {
    @Test
    fun unwrapConvertsBackendEnvelopeToApiException() {
        val envelope = ApiEnvelope<String>(
            code = 40001,
            message = "用户名已存在",
            data = null,
            timestamp = 1781071200000,
            traceId = "trace-envelope"
        )

        val error = try {
            envelope.unwrap()
            null
        } catch (apiError: ApiException) {
            apiError
        }

        requireNotNull(error)
        assertEquals("用户名已存在", error.message)
        assertEquals(40001, error.apiCode)
        assertEquals("trace-envelope", error.traceId)
    }

    @Test
    fun httpErrorPrefersBackendMessageAndTraceId() {
        val errorBody = """
            {"code":42901,"message":"登录尝试过于频繁","traceId":"trace-rate-limit"}
        """.trimIndent().toResponseBody("application/json".toMediaType())
        val httpError = HttpException(Response.error<Any>(429, errorBody))

        val error = normalizeNetworkError(httpError)

        assertEquals("登录尝试过于频繁", error.message)
        assertEquals(42901, error.apiCode)
        assertEquals(429, error.httpStatus)
        assertEquals("trace-rate-limit", error.traceId)
    }

    @Test
    fun httpErrorUsesStatusFallbackWhenBodyIsNotEnvelope() {
        val errorBody = "<html>down</html>".toResponseBody("text/html".toMediaType())
        val httpError = HttpException(Response.error<Any>(503, errorBody))

        val error = normalizeNetworkError(httpError)

        assertEquals("服务暂时不可用，请稍后重试", error.message)
        assertEquals(503, error.httpStatus)
    }

    @Test
    fun networkAndTimeoutErrorsHaveUserReadableMessages() {
        assertEquals("请求超时，请稍后重试", normalizeNetworkError(SocketTimeoutException()).message)
        assertEquals("网络连接失败，请检查后端服务或网络", normalizeNetworkError(UnknownHostException()).message)
    }

    @Test
    fun existingApiExceptionIsNotWrappedAgain() {
        val original = ApiException("后端返回的业务错误")

        val normalized = normalizeNetworkError(original)

        assertSame(original, normalized)
    }

    @Test
    fun runApiCatchingDoesNotSwallowCoroutineCancellation() = runBlocking {
        try {
            runApiCatching<String> {
                throw CancellationException("view model cleared")
            }
            fail("CancellationException should be rethrown")
        } catch (error: CancellationException) {
            assertEquals("view model cleared", error.message)
        }
    }
}
