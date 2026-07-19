import brandLockupSuina from './logo/brand-lockup-suina.webp'
import brandWordmark from './logo/brand-wordmark.webp'
import suinaAvatar from './character/suina-avatar.webp'
import suinaStanding from './character/suina-standing.webp'
import assistantConcerned from './assistant/suina-concerned.webp'
import assistantDefault from './assistant/suina-default.webp'
import assistantEncouraging from './assistant/suina-encouraging.webp'
import assistantExplaining from './assistant/suina-explaining.webp'
import assistantListening from './assistant/suina-listening.webp'
import assistantSuccess from './assistant/suina-success.webp'
import assistantThinking from './assistant/suina-thinking.webp'
import assistantWarning from './assistant/suina-warning.webp'

export type AssistantVisualState =
  | 'default'
  | 'listening'
  | 'thinking'
  | 'explaining'
  | 'concerned'
  | 'warning'
  | 'encouraging'
  | 'success'

export const assistantAvatarAssets: Record<AssistantVisualState, string> = {
  default: assistantDefault,
  listening: assistantListening,
  thinking: assistantThinking,
  explaining: assistantExplaining,
  concerned: assistantConcerned,
  warning: assistantWarning,
  encouraging: assistantEncouraging,
  success: assistantSuccess
}

export const brandAssets = {
  wordmark: brandWordmark,
  lockupSuina: brandLockupSuina,
  suinaAvatar,
  suinaStanding
} as const

let assistantImagesPreloaded = false

export const preloadAssistantAvatarAssets = () => {
  if (assistantImagesPreloaded || typeof Image === 'undefined') return
  assistantImagesPreloaded = true
  Object.values(assistantAvatarAssets).forEach((source) => {
    const image = new Image()
    image.decoding = 'async'
    image.src = source
  })
}
