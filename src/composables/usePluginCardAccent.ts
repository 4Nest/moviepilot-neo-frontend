import { extractDominantColor } from '@/@core/utils/image'

export interface PluginAccentColor {
  hex: string
  rgb: string
}

function clampChannel(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/** 将插件 Logo 提取的 HEX 颜色解析并收敛到可读亮度区间，返回 HEX 与 RGB 通道字符串。 */
export function normalizePluginAccentColor(color: string): PluginAccentColor | undefined {
  if (!/^#[\da-f]{6}$/i.test(color)) return undefined

  const r = Number.parseInt(color.slice(1, 3), 16) / 255
  const g = Number.parseInt(color.slice(3, 5), 16) / 255
  const b = Number.parseInt(color.slice(5, 7), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  let h = 0
  let s = 0
  let l = (max + min) / 2

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1))
    if (max === r) h = ((g - b) / delta) % 6
    else if (max === g) h = (b - r) / delta + 2
    else h = (r - g) / delta + 4
    h = (h * 60 + 360) % 360
  }

  l = clampChannel(l, 0.36, 0.68)
  if (s > 0.04) {
    s = Math.min(s, 0.78)
  }

  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let rPrime: number
  let gPrime: number
  let bPrime: number

  if (h < 60) [rPrime, gPrime, bPrime] = [c, x, 0]
  else if (h < 120) [rPrime, gPrime, bPrime] = [x, c, 0]
  else if (h < 180) [rPrime, gPrime, bPrime] = [0, c, x]
  else if (h < 240) [rPrime, gPrime, bPrime] = [0, x, c]
  else if (h < 300) [rPrime, gPrime, bPrime] = [x, 0, c]
  else [rPrime, gPrime, bPrime] = [c, 0, x]

  const channels = [rPrime + m, gPrime + m, bPrime + m].map(ch => Math.round(clampChannel(ch, 0, 1) * 255)) as [
    number,
    number,
    number,
  ]

  return {
    hex: `#${channels.map(ch => ch.toString(16).padStart(2, '0')).join('')}`,
    rgb: channels.join(', '),
  }
}

/** 管理插件卡 Logo 的可选品牌强调色；无有效提色时由 CSS 默认主题主色接管。 */
export function usePluginCardAccent() {
  const accentRgb = ref<string>()
  const imageRef = ref<{ $el: HTMLElement } | null>(null)
  const accentStyle = computed(() => (accentRgb.value ? { '--plugin-card-accent-rgb': accentRgb.value } : undefined))
  let requestGeneration = 0

  async function updateAccentColor() {
    const generation = ++requestGeneration
    const imageElement = imageRef.value?.$el.querySelector('img') as HTMLImageElement | undefined
    const dominantColor = await extractDominantColor(imageElement)
    if (generation !== requestGeneration) return

    accentRgb.value = dominantColor ? normalizePluginAccentColor(dominantColor)?.rgb : undefined
  }

  function resetAccentColor() {
    requestGeneration += 1
    accentRgb.value = undefined
  }

  return {
    accentRgb,
    accentStyle,
    imageRef,
    resetAccentColor,
    updateAccentColor,
  }
}
