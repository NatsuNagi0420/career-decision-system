package com.careerdecision.mobile.ui.screens

import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.google.gson.JsonParser

internal data class SnapshotTargetView(
    val name: String,
    val reason: String?,
    val risks: String?,
    val reviewDate: String?
)

internal data class SnapshotCandidateView(
    val name: String,
    val support: String?,
    val opposition: String?,
    val uncertainties: String?
)

internal data class SnapshotEvidenceView(
    val title: String,
    val detail: String?,
    val sourceType: String?,
    val credibility: String?,
    val stance: String?
)

internal data class SnapshotActionPlanView(
    val overview: String?,
    val durationWeeks: Int?,
    val progressPercent: Int?,
    val completedTaskCount: Int?,
    val taskCount: Int?
)

internal data class DecisionSnapshotView(
    val question: String?,
    val projectVersion: Int?,
    val capturedAt: String?,
    val primaryTarget: SnapshotTargetView?,
    val backupTarget: SnapshotTargetView?,
    val candidates: List<SnapshotCandidateView>,
    val evidence: List<SnapshotEvidenceView>,
    val actionPlan: SnapshotActionPlanView?
)

internal data class LegacyReportView(
    val summary: String?,
    val evidenceHighlights: List<String>,
    val risksAndAlternatives: List<String>,
    val fallbackText: String?
)

internal object HistoryContentParser {
    fun decisionSnapshot(raw: String): DecisionSnapshotView? {
        val root = raw.asJsonObjectOrNull() ?: return null
        val project = root.objectValue("project") ?: return null
        val targets = project.arrayValue("targets")
            .mapNotNull(JsonElement::asObjectOrNull)
            .map { target ->
                target.stringValue("targetType") to SnapshotTargetView(
                    name = target.stringValue("targetName").orEmpty(),
                    reason = target.stringValue("decisionReason"),
                    risks = target.stringValue("mainRisks"),
                    reviewDate = target.stringValue("reviewDate")
                )
            }
        val candidates = project.arrayValue("candidates")
            .mapNotNull(JsonElement::asObjectOrNull)
            .mapNotNull { candidate ->
                candidate.stringValue("name")?.takeIf(String::isNotBlank)?.let { name ->
                    SnapshotCandidateView(
                        name = name,
                        support = candidate.stringValue("recommendationReason"),
                        opposition = candidate.stringValue("opposingFactors"),
                        uncertainties = candidate.stringValue("uncertainties")
                    )
                }
            }
        val evidence = project.arrayValue("evidence")
            .mapNotNull(JsonElement::asObjectOrNull)
            .mapNotNull { item ->
                item.stringValue("title")?.takeIf(String::isNotBlank)?.let { title ->
                    SnapshotEvidenceView(
                        title = title,
                        detail = item.stringValue("detail"),
                        sourceType = item.stringValue("sourceType"),
                        credibility = item.stringValue("credibility"),
                        stance = item.stringValue("stance")
                    )
                }
            }
        val actionPlan = root.objectValue("actionPlan")?.let { plan ->
            SnapshotActionPlanView(
                overview = plan.stringValue("overview"),
                durationWeeks = plan.intValue("durationWeeks"),
                progressPercent = plan.intValue("progressPercent"),
                completedTaskCount = plan.intValue("completedTaskCount"),
                taskCount = plan.intValue("taskCount")
            )
        }
        return DecisionSnapshotView(
            question = project.stringValue("question"),
            projectVersion = root.intValue("projectVersion"),
            capturedAt = root.stringValue("capturedAt"),
            primaryTarget = targets.firstOrNull { it.first == "primary" }?.second,
            backupTarget = targets.firstOrNull { it.first == "backup" }?.second,
            candidates = candidates,
            evidence = evidence,
            actionPlan = actionPlan
        )
    }

    fun legacyReport(raw: String): LegacyReportView {
        val root = raw.asJsonObjectOrNull()
        if (root == null) {
            return LegacyReportView(
                summary = null,
                evidenceHighlights = emptyList(),
                risksAndAlternatives = emptyList(),
                fallbackText = raw.trim().takeIf(String::isNotBlank)
            )
        }
        val content = root.objectValue("content") ?: root
        return LegacyReportView(
            summary = content.stringValue("summary"),
            evidenceHighlights = content.stringList("evidenceHighlights"),
            risksAndAlternatives = content.stringList("risksAndAlternatives"),
            fallbackText = content.stringValue("content")
        )
    }
}

private fun String.asJsonObjectOrNull(): JsonObject? = runCatching {
    JsonParser.parseString(this).asObjectOrNull()
}.getOrNull()

private fun JsonElement.asObjectOrNull(): JsonObject? =
    takeIf { it.isJsonObject }?.asJsonObject

private fun JsonObject.stringValue(name: String): String? = get(name)
    ?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isString }
    ?.asString
    ?.trim()
    ?.takeIf(String::isNotBlank)

private fun JsonObject.intValue(name: String): Int? = get(name)
    ?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isNumber }
    ?.let { runCatching { it.asInt }.getOrNull() }

private fun JsonObject.objectValue(name: String): JsonObject? = get(name)?.asObjectOrNull()

private fun JsonObject.arrayValue(name: String): List<JsonElement> = get(name)
    ?.takeIf(JsonElement::isJsonArray)
    ?.asJsonArray
    ?.toList()
    .orEmpty()

private fun JsonObject.stringList(name: String): List<String> = arrayValue(name)
    .mapNotNull { element ->
        element.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isString }
            ?.asString
            ?.trim()
            ?.takeIf(String::isNotBlank)
    }
