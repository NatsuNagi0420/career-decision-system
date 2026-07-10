package com.careerdecision.mobile

import com.careerdecision.mobile.network.UserInfo
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SessionStoreTest {
    @Test
    fun codecRestoresSavedUserAndToken() {
        val user = UserInfo(id = 7L, username = "miku", email = "miku@example.com", phone = null)
        val raw = SessionCodec.encodeUser(user)

        assertEquals(user, SessionCodec.decodeUser(raw))
        assertEquals(
            SessionSnapshot("token-123", "refresh-123", user),
            SessionCodec.snapshot(" token-123 ", " refresh-123 ", user)
        )
    }

    @Test
    fun codecIgnoresCorruptedOrIncompleteSession() {
        val user = UserInfo(id = 7L, username = "miku", email = null, phone = null)

        assertNull(SessionCodec.decodeUser("{broken"))
        assertNull(SessionCodec.snapshot("", "refresh-123", user))
        assertNull(SessionCodec.snapshot("token-123", "", user))
        assertNull(SessionCodec.snapshot("token-123", "refresh-123", null))
    }
}
