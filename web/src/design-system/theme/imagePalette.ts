import {
  QuantizerCelebi,
  Score,
  hexFromArgb
} from '@material/material-color-utilities'
import { DEFAULT_SEED_COLOR } from './materialTheme'

const SUPPORTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_FILE_BYTES = 10 * 1024 * 1024

function assertSupportedImage(file: Blob) {
  if (!SUPPORTED_TYPES.has(file.type)) {
    throw new Error('背景仅支持 JPEG、PNG 或 WebP 图片')
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('背景图片不能超过 10MB')
  }
}

function loadImage(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('无法读取这张背景图片'))
    }
    image.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('背景图片处理失败')),
      type,
      quality
    )
  })
}

export async function optimizeBackgroundImage(file: File) {
  assertSupportedImage(file)
  const image = await loadImage(file)
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('背景图片尺寸无效')
  const maxDimension = 1920
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('当前浏览器无法处理背景图片')
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvasToBlob(canvas, 'image/webp', 0.86)
}

export async function extractImageColors(blob: Blob) {
  assertSupportedImage(blob)
  const image = await loadImage(blob)
  if (!image.naturalWidth || !image.naturalHeight) return [DEFAULT_SEED_COLOR]
  const sampleSize = 112
  const scale = Math.min(sampleSize / image.naturalWidth, sampleSize / image.naturalHeight, 1)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('当前浏览器无法提取图片颜色')
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data
  const pixels: number[] = []
  for (let index = 0; index < data.length; index += 4) {
    if ((data[index + 3] ?? 0) < 200) continue
    const red = data[index] ?? 0
    const green = data[index + 1] ?? 0
    const blue = data[index + 2] ?? 0
    pixels.push((0xff000000 | (red << 16) | (green << 8) | blue) >>> 0)
  }
  if (!pixels.length) return [DEFAULT_SEED_COLOR]
  const quantized = QuantizerCelebi.quantize(pixels, 128)
  return Score.score(quantized, { desired: 4, filter: true }).map(hexFromArgb)
}
