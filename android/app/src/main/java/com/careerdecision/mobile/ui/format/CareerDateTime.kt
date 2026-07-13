package com.careerdecision.mobile.ui.format

import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

object CareerDateTime {
    private val dateFormatter = DateTimeFormatter.ofPattern("yyyy年M月d日")
    private val dateTimeFormatter = DateTimeFormatter.ofPattern("M月d日 HH:mm")

    fun date(value: String?): String? {
        val clean = value?.trim().orEmpty()
        if (clean.isEmpty()) return null
        return runCatching { LocalDate.parse(clean).format(dateFormatter) }.getOrNull()
            ?: localDateTime(clean)?.toLocalDate()?.format(dateFormatter)
            ?: clean
    }

    fun dateTime(value: String?, zoneId: ZoneId = ZoneId.systemDefault()): String? {
        val clean = value?.trim().orEmpty()
        if (clean.isEmpty()) return null
        val zoned = runCatching { Instant.parse(clean).atZone(zoneId) }.getOrNull()
            ?: runCatching { OffsetDateTime.parse(clean).atZoneSameInstant(zoneId) }.getOrNull()
            ?: localDateTime(clean)?.atZone(zoneId)
        return zoned?.format(dateTimeFormatter) ?: clean
    }

    private fun localDateTime(value: String): LocalDateTime? =
        runCatching { LocalDateTime.parse(value) }.getOrNull()
}

