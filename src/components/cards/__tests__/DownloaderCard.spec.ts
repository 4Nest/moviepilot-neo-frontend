import type { DownloaderConf } from '@/api/types'
import DownloaderCard from '@/components/cards/DownloaderCard.vue'
import { renderWithProviders } from '@tests/support/render'
import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/composables/useBackground', () => ({
  useBackground: () => ({
    useConditionalDataRefresh: () => ({ stop: vi.fn() }),
  }),
}))

vi.mock('@/composables/useCardAccentColor', () => ({
  useCardAccentColor: () => ({ accentRgb: '1, 2, 3', imageRef: ref(null), updateAccentColor: vi.fn() }),
}))

describe('DownloaderCard', () => {
  it('uses one card DOM root and receives draggable attributes directly', async () => {
    const downloader = {
      enabled: false,
      name: 'qBittorrent',
      type: 'qbittorrent',
    } as DownloaderConf
    const { container } = await renderWithProviders(DownloaderCard, {
      attrs: { 'data-draggable': 'item' },
      global: { stubs: { VDialogCloseBtn: true } },
      props: { allowRefresh: false, downloader, downloaders: [downloader] },
    })

    expect(container.childNodes).toHaveLength(1)
    expect(container.firstElementChild).toHaveClass('v-card')
    expect(container.firstElementChild).toHaveAttribute('data-draggable', 'item')
  })
})
