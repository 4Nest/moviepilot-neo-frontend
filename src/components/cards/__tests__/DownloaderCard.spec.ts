import type { DownloaderConf, MediaServerConf } from '@/api/types'
import DownloaderCard from '@/components/cards/DownloaderCard.vue'
import MediaServerCard from '@/components/cards/MediaServerCard.vue'
import { screen } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue(null),
  },
}))

vi.mock('@/composables/useBackground', () => ({
  useBackground: () => ({
    useConditionalDataRefresh: () => ({ stop: vi.fn() }),
  }),
}))

vi.mock('@/composables/useCardAccentColor', () => ({
  useCardAccentColor: () => ({ accentRgb: '1, 2, 3', imageRef: ref(null), updateAccentColor: vi.fn() }),
}))

describe('DownloaderCard & MediaServerCard', () => {
  it('uses one clean card DOM root without colorful tint and always shows status subtitle when disabled', async () => {
    const downloader = {
      enabled: false,
      name: '主下载器',
      type: 'qbittorrent',
    } as DownloaderConf
    const { container } = await renderWithProviders(DownloaderCard, {
      attrs: { 'data-draggable': 'item' },
      global: { stubs: { VDialogCloseBtn: true } },
      props: { allowRefresh: false, downloader, downloaders: [downloader] },
    })

    expect(container.childNodes).toHaveLength(1)
    expect(container.firstElementChild).toHaveClass('v-card')
    expect(container.firstElementChild).not.toHaveClass('app-card-colorful')
    expect(container.firstElementChild).toHaveAttribute('data-draggable', 'item')
    expect(container.querySelector('.cursor-move')).not.toBeNull()
    expect(screen.getByText(/Qbittorrent/i)).toBeInTheDocument()
  })

  it('renders a drag handle (.cursor-move) and fallback subtitle on MediaServerCard', async () => {
    const mediaserver = {
      enabled: false,
      name: '家庭影院',
      type: 'emby',
    } as MediaServerConf
    const { container } = await renderWithProviders(MediaServerCard, {
      attrs: { 'data-draggable': 'server-item' },
      props: { mediaserver, mediaservers: [mediaserver] },
    })

    expect(container.firstElementChild).not.toHaveClass('app-card-colorful')
    expect(container.firstElementChild).toHaveAttribute('data-draggable', 'server-item')
    expect(container.querySelector('.cursor-move')).not.toBeNull()
    expect(screen.getByText(/Emby/i)).toBeInTheDocument()
  })
})
