package com.careerdecision.mobile.network

import com.google.gson.reflect.TypeToken
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.http.DELETE
import retrofit2.http.Path

class ChatSessionDeletionContractTest {
    @Test
    fun deleteEndpointUsesTheSessionRestPath() {
        val method = CareerApi::class.java.declaredMethods.single { it.name == "deleteChatSession" }
        val delete = requireNotNull(method.getAnnotation(DELETE::class.java))
        val path = method.parameterAnnotations
            .flatMap { it.asIterable() }
            .filterIsInstance<Path>()
            .single()

        assertEquals("chat/sessions/{sessionId}", delete.value)
        assertEquals("sessionId", path.value)
    }

    @Test
    fun deletionResponseParsesTheConfirmedSession() {
        val type = TypeToken.getParameterized(
            ApiEnvelope::class.java,
            ChatSessionDeletion::class.java
        ).type
        val envelope = CareerApiFactory.gson.fromJson<ApiEnvelope<ChatSessionDeletion>>(
            """
            {
              "code": 0,
              "message": "success",
              "data": { "sessionId": 12001, "deleted": true },
              "timestamp": 1784000000000,
              "traceId": "android-delete-001"
            }
            """.trimIndent(),
            type
        )

        assertEquals(12001L, envelope.data?.sessionId)
        assertTrue(envelope.data?.deleted == true)
    }
}
