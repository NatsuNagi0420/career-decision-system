import { onMounted, type Ref } from 'vue'

const labelText = (label: HTMLLabelElement) => {
  const clone = label.cloneNode(true) as HTMLLabelElement
  clone.querySelectorAll('button, input, md-outlined-text-field, select, textarea').forEach((control) => control.remove())
  return clone.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

export const useInheritedAccessibleName = (control: Ref<HTMLElement | null>, componentLabel: () => string) => {
  onMounted(() => {
    const element = control.value
    if (!element || componentLabel().trim() || element.hasAttribute('aria-label') || element.hasAttribute('aria-labelledby')) return

    const wrappingLabel = element.closest('label')
    const linkedLabel = element.id
      ? Array.from(document.querySelectorAll<HTMLLabelElement>('label')).find((label) => label.htmlFor === element.id)
      : undefined
    const ownerLabel = wrappingLabel ?? linkedLabel
    if (!ownerLabel) return
    const accessibleName = labelText(ownerLabel)
    if (accessibleName) element.setAttribute('aria-label', accessibleName)
  })
}
