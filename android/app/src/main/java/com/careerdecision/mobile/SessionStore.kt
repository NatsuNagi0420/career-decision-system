package com.careerdecision.mobile

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.careerdecision.mobile.network.UserInfo
import com.google.gson.Gson
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class SessionSnapshot(
    val token: String,
    val refreshToken: String,
    val user: UserInfo
)

interface SessionGateway {
    fun load(): SessionSnapshot?
    fun save(token: String, refreshToken: String, user: UserInfo)
    fun clear()
}

internal object SessionCodec {
    private val gson = Gson()

    fun encodeUser(user: UserInfo): String = gson.toJson(user)

    fun decodeUser(raw: String?): UserInfo? {
        if (raw.isNullOrBlank()) {
            return null
        }
        return runCatching {
            gson.fromJson(raw, UserInfo::class.java)
        }.getOrNull()
    }

    fun snapshot(token: String?, refreshToken: String?, user: UserInfo?): SessionSnapshot? {
        val cleanToken = token?.trim().orEmpty()
        val cleanRefreshToken = refreshToken?.trim().orEmpty()
        if (cleanToken.isBlank() || cleanRefreshToken.isBlank() || user == null) {
            return null
        }
        return SessionSnapshot(cleanToken, cleanRefreshToken, user)
    }
}

class SessionStore(context: Context) : SessionGateway {
    private val preferences = context.applicationContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
    private val cipher = AndroidKeystoreSessionCipher()

    override fun load(): SessionSnapshot? =
        SessionCodec.snapshot(
            cipher.decrypt(preferences.getString(KEY_TOKEN, null)),
            cipher.decrypt(preferences.getString(KEY_REFRESH_TOKEN, null)),
            SessionCodec.decodeUser(cipher.decrypt(preferences.getString(KEY_USER, null)))
        )

    override fun save(token: String, refreshToken: String, user: UserInfo) {
        preferences.edit()
            .putString(KEY_TOKEN, cipher.encrypt(token))
            .putString(KEY_REFRESH_TOKEN, cipher.encrypt(refreshToken))
            .putString(KEY_USER, cipher.encrypt(SessionCodec.encodeUser(user)))
            .apply()
    }

    override fun clear() {
        preferences.edit()
            .remove(KEY_TOKEN)
            .remove(KEY_REFRESH_TOKEN)
            .remove(KEY_USER)
            .apply()
    }

    private companion object {
        const val PREFERENCES_NAME = "career_session"
        const val KEY_TOKEN = "token"
        const val KEY_REFRESH_TOKEN = "refresh_token"
        const val KEY_USER = "user"
    }
}

internal interface SessionCipher {
    fun encrypt(plainText: String): String
    fun decrypt(cipherText: String?): String?
}

internal class AndroidKeystoreSessionCipher : SessionCipher {
    override fun encrypt(plainText: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val encrypted = cipher.doFinal(plainText.toByteArray(StandardCharsets.UTF_8))
        val payload = cipher.iv + encrypted
        return Base64.encodeToString(payload, Base64.NO_WRAP)
    }

    override fun decrypt(cipherText: String?): String? {
        if (cipherText.isNullOrBlank()) {
            return null
        }
        return runCatching {
            val payload = Base64.decode(cipherText, Base64.NO_WRAP)
            if (payload.size <= IV_BYTE_SIZE) {
                return@runCatching null
            }
            val iv = payload.copyOfRange(0, IV_BYTE_SIZE)
            val encrypted = payload.copyOfRange(IV_BYTE_SIZE, payload.size)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(GCM_TAG_BITS, iv))
            String(cipher.doFinal(encrypted), StandardCharsets.UTF_8)
        }.getOrNull()
    }

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        val existing = keyStore.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry
        if (existing != null) {
            return existing.secretKey
        }
        val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        val keySpec = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(KEY_SIZE_BITS)
            .build()
        keyGenerator.init(keySpec)
        return keyGenerator.generateKey()
    }

    private companion object {
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val KEY_ALIAS = "career_decision_session_key"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val KEY_SIZE_BITS = 256
        const val GCM_TAG_BITS = 128
        const val IV_BYTE_SIZE = 12
    }
}
