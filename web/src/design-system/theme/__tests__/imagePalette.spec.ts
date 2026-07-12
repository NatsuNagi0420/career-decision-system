import { describe, expect, it } from 'vitest'
import { extractImageColors, optimizeBackgroundImage } from '../imagePalette'

describe('background image validation', () => {
  it('rejects unsupported image formats before decoding', async () => {
    const file = { type: 'image/gif', size: 128 } as File
    await expect(optimizeBackgroundImage(file)).rejects.toThrow('仅支持 JPEG、PNG 或 WebP')
    await expect(extractImageColors(file)).rejects.toThrow('仅支持 JPEG、PNG 或 WebP')
  })

  it('rejects images larger than 10MB before decoding', async () => {
    const file = { type: 'image/png', size: 10 * 1024 * 1024 + 1 } as File
    await expect(optimizeBackgroundImage(file)).rejects.toThrow('不能超过 10MB')
  })
})
