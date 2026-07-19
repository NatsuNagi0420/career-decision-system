import type { AssistantChatResponse } from '@/api/assistant'
import type { AssistantVisualState } from '@/assets/brand'

/**
 * Keeps the mentor portrait semantics identical in the floating mentor and
 * the standalone conversation history.
 */
export const visualStateForAssistantResponse = (
  response: AssistantChatResponse
): AssistantVisualState => {
  if (response.confidence < 0.45) return 'warning'
  if (response.confidence < 0.62 || response.uncertainties.length >= 2) return 'concerned'
  if (response.actions?.length || response.nextStep?.trim()) return 'encouraging'
  return 'explaining'
}
