import { extractDominantColor, getDominantColor, preloadCorsImage, selectVibrantSwatch } from '@/@core/utils/image'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getColor: vi.fn(),
  getPalette: vi.fn(),
}))

vi.mock('colorthief', () => ({
  default: class ColorThief {
    getColor(image: HTMLImageElement, quality?: number) {
      return mocks.getColor(image, quality)
    }

    getPalette(image: HTMLImageElement, colorCount?: number, quality?: number) {
      return mocks.getPalette(image, colorCount, quality)
    }
  },
}))

function createImage(cacheKey: string) {
  const image = document.createElement('img')
  Object.defineProperty(image, 'currentSrc', { configurable: true, value: `https://image.example/${cacheKey}.png` })

  return image
}

describe('dominant color extraction', () => {
  beforeEach(() => {
    mocks.getColor.mockReset()
    mocks.getPalette.mockReset().mockReturnValue([])
  })

  it('shares a pending extraction and reuses only the successful result', async () => {
    const image = createImage('shared-success')
    mocks.getColor.mockReturnValue([18, 52, 86])

    await expect(Promise.all([extractDominantColor(image), extractDominantColor(image)])).resolves.toEqual([
      '#123456',
      '#123456',
    ])
    await expect(extractDominantColor(image)).resolves.toBe('#123456')
    expect(mocks.getColor).toHaveBeenCalledOnce()
  })

  it('does not cache failures or let one caller fallback pollute another', async () => {
    const image = createImage('retry-after-failure')
    mocks.getColor.mockImplementation(() => {
      throw new Error('tainted canvas')
    })
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    await expect(getDominantColor(image, { fallback: '#111111' })).resolves.toBe('#111111')
    await expect(getDominantColor(image, { fallback: '#222222' })).resolves.toBe('#222222')
    expect(mocks.getColor).toHaveBeenCalledTimes(2)
  })

  it('keeps the existing default fallback contract for callers such as QuickAccess', async () => {
    await expect(getDominantColor(null)).resolves.toBe('#28A9E1')
    expect(mocks.getColor).not.toHaveBeenCalled()
  })

  it('retains the bounded FIFO success cache', async () => {
    mocks.getColor.mockReturnValue([1, 2, 3])

    for (let index = 0; index <= 100; index += 1) await extractDominantColor(createImage(`fifo-${index}`))

    expect(mocks.getColor).toHaveBeenCalledTimes(101)
    await extractDominantColor(createImage('fifo-50'))
    expect(mocks.getColor).toHaveBeenCalledTimes(101)
    await extractDominantColor(createImage('fifo-0'))
    expect(mocks.getColor).toHaveBeenCalledTimes(102)
  })
})

describe('selectVibrantSwatch', () => {
  it('selects a saturated brand color instead of near-white, near-black, or neutral background swatches', () => {
    expect(
      selectVibrantSwatch([
        [250, 250, 248],
        [8, 10, 12],
        [120, 120, 120],
        [180, 30, 20],
        [20, 60, 220],
      ]),
    ).toEqual([20, 60, 220])
  })

  it('ignores malformed swatches and returns undefined when no usable brand color exists', () => {
    expect(
      selectVibrantSwatch([
        [255, 255],
        [Number.NaN, 20, 30],
        [240, 240, 240],
        [20, 20, 20],
      ]),
    ).toBeUndefined()
  })
})

describe('extractDominantColor vibrant palette', () => {
  beforeEach(() => {
    mocks.getColor.mockReset()
    mocks.getPalette.mockReset()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('uses the selected palette swatch and reuses the extracted color from cache', async () => {
    const image = createImage('vibrant-icon')
    mocks.getPalette.mockReturnValue([
      [255, 255, 255],
      [10, 20, 240],
    ])

    await expect(extractDominantColor(image)).resolves.toBe('#0a14f0')
    await expect(extractDominantColor(image)).resolves.toBe('#0a14f0')

    expect(mocks.getPalette).toHaveBeenCalledOnce()
    expect(mocks.getPalette).toHaveBeenCalledWith(image, 6, 16)
    expect(mocks.getColor).not.toHaveBeenCalled()
  })

  it('falls back to the dominant color when the palette has no vibrant swatch', async () => {
    const image = createImage('neutral-icon')
    mocks.getPalette.mockReturnValue([[250, 250, 250]])
    mocks.getColor.mockReturnValue([12, 34, 56])

    await expect(extractDominantColor(image, { quality: 8 })).resolves.toBe('#0c2238')

    expect(mocks.getPalette).toHaveBeenCalledWith(image, 6, 8)
    expect(mocks.getColor).toHaveBeenCalledWith(image, 8)
  })

  it('does not cache a failed palette extraction', async () => {
    const image = createImage('retry-icon')
    mocks.getPalette.mockImplementationOnce(() => {
      throw new Error('image not ready')
    })
    mocks.getPalette.mockReturnValueOnce([[200, 30, 40]])
    mocks.getColor.mockReturnValue([1, 2, 3])

    await expect(extractDominantColor(image)).resolves.toBeUndefined()
    await expect(extractDominantColor(image)).resolves.toBe('#c81e28')
    expect(mocks.getPalette).toHaveBeenCalledTimes(2)
  })
})

describe('preloadCorsImage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses a CORS-clean cached response without reloading it', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      blob: vi.fn().mockResolvedValue(new Blob(['image'])),
      ok: true,
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(preloadCorsImage('https://image.example/wallpaper.jpg')).resolves.toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('https://image.example/wallpaper.jpg'),
      expect.objectContaining({ cache: 'force-cache', credentials: 'omit', mode: 'cors' }),
    )
  })

  it('reloads a response when an earlier non-CORS cache entry blocks the first request', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({
        blob: vi.fn().mockResolvedValue(new Blob(['image'])),
        ok: true,
      })
    vi.stubGlobal('fetch', fetchMock)

    await expect(preloadCorsImage('/wallpaper.jpg')).resolves.toBe(true)
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      new URL('/wallpaper.jpg', window.location.href),
      expect.objectContaining({ cache: 'reload', credentials: 'same-origin', mode: 'cors' }),
    )
  })

  it('returns false when the source cannot be read with CORS', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(preloadCorsImage('https://image.example/wallpaper.jpg')).resolves.toBe(false)
  })
})
