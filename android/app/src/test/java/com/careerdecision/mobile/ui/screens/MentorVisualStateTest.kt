package com.careerdecision.mobile.ui.screens

import com.careerdecision.mobile.ui.MentorMessageUi
import com.careerdecision.mobile.ui.design.AssistantVisualState
import org.junit.Assert.assertEquals
import org.junit.Test

class MentorVisualStateTest {
    @Test
    fun replyStateUsesSamePriorityAsWebMentor() {
        assertEquals(
            AssistantVisualState.Warning,
            reply(confidence = 0.44, uncertainties = listOf("待确认"), hasActions = true)
                .assistantVisualState()
        )
        assertEquals(
            AssistantVisualState.Concerned,
            reply(confidence = 0.61, hasActions = true).assistantVisualState()
        )
        assertEquals(
            AssistantVisualState.Concerned,
            reply(confidence = 0.8, uncertainties = listOf("待确认一", "待确认二"), hasActions = true)
                .assistantVisualState()
        )
        assertEquals(
            AssistantVisualState.Encouraging,
            reply(confidence = 0.8, nextStep = "先完成一个岗位样本访谈").assistantVisualState()
        )
        assertEquals(
            AssistantVisualState.Encouraging,
            reply(confidence = 0.8, hasActions = true).assistantVisualState()
        )
        assertEquals(
            AssistantVisualState.Explaining,
            reply(confidence = 0.8).assistantVisualState()
        )
    }

    @Test
    fun plainOrUserMessageKeepsDefaultAvatar() {
        assertEquals(AssistantVisualState.Default, reply(confidence = null).assistantVisualState())
        assertEquals(
            AssistantVisualState.Default,
            reply(confidence = 0.2).copy(role = "user").assistantVisualState()
        )
    }

    private fun reply(
        confidence: Double?,
        uncertainties: List<String> = emptyList(),
        nextStep: String? = null,
        hasActions: Boolean = false
    ) = MentorMessageUi(
        localId = "reply",
        requestId = "request",
        role = "assistant",
        content = "回复",
        confidence = confidence,
        uncertainties = uncertainties,
        nextStep = nextStep,
        hasActions = hasActions
    )
}
