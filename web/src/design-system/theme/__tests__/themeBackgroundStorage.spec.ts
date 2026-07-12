// @vitest-environment node
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import {
  deleteBackgroundBlob,
  loadBackgroundBlob,
  saveBackgroundBlob
} from '../themeBackgroundStorage'

describe('web background storage', () => {
  it('stores and removes a browser-local background blob', async () => {
    const id = `background-${crypto.randomUUID()}`
    const source = new Blob(['web-background'], { type: 'image/webp' })

    await saveBackgroundBlob(id, source)
    const loaded = await loadBackgroundBlob(id)
    expect(loaded?.type).toBe('image/webp')
    expect(await loaded?.text()).toBe('web-background')

    await deleteBackgroundBlob(id)
    expect(await loadBackgroundBlob(id)).toBeUndefined()
  })
})
