import QRCode from 'qrcode'
import { displayUrl } from './publicUrl.ts'

const WIDTH = 1200
const PADDING = 80
const QR_SIZE = 1000
const TITLE_FONT = 'bold 64px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
const TITLE_LINE_HEIGHT = 80
const MAX_TITLE_LINES = 3
const URL_FONT = '600 44px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace'

/** Splits text into at most `maxLines` lines that fit `maxWidth`, adding "…" if truncated. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.trim().split(/\s+/)
  const lines: string[] = []
  let line = ''

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate
      continue
    }
    if (line) lines.push(line)
    line = word
    // A single word wider than the line: break it by characters.
    while (ctx.measureText(line).width > maxWidth) {
      let cut = line.length - 1
      while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > maxWidth) cut--
      lines.push(line.slice(0, cut))
      line = line.slice(cut)
    }
  }
  if (line) lines.push(line)

  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    let last = kept[maxLines - 1]
    while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1)
    kept[maxLines - 1] = `${last.trimEnd()}…`
    return kept
  }
  return lines
}

/** Builds a printable PNG (data URL): survey title, QR code, then the readable URL. */
export async function buildQrPng(url: string, title: string): Promise<string> {
  const qr = document.createElement('canvas')
  await QRCode.toCanvas(qr, url, { width: QR_SIZE, margin: 2 })

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not supported in this browser.')

  ctx.font = TITLE_FONT
  const titleLines = wrapText(ctx, title, WIDTH - PADDING * 2, MAX_TITLE_LINES)
  const titleHeight = titleLines.length * TITLE_LINE_HEIGHT
  const urlHeight = 60

  canvas.width = WIDTH
  canvas.height = PADDING + titleHeight + 30 + QR_SIZE + 20 + urlHeight + PADDING

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#0f172a'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'

  ctx.font = TITLE_FONT
  titleLines.forEach((line, i) => ctx.fillText(line, WIDTH / 2, PADDING + i * TITLE_LINE_HEIGHT))

  const qrTop = PADDING + titleHeight + 30
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(qr, (WIDTH - QR_SIZE) / 2, qrTop, QR_SIZE, QR_SIZE)

  ctx.font = URL_FONT
  const urlText = wrapText(ctx, displayUrl(url), WIDTH - PADDING * 2, 1)[0]
  ctx.fillText(urlText, WIDTH / 2, qrTop + QR_SIZE + 20)

  return canvas.toDataURL('image/png')
}
