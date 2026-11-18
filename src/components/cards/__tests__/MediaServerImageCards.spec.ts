import type { MediaServerPlayItem } from '@/api/types'
import BackdropCard from '@/components/cards/BackdropCard.vue'
import PlayingBackdropCard from '@/components/cards/PlayingBackdropCard.vue'
import PosterCard from '@/components/cards/PosterCard.vue'
import { fireEvent } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { openMediaServerItem } from '@/utils/appDeepLink'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/appDeepLink', () => ({
  openMediaServerItem: vi.fn(),
}))

const media: MediaServerPlayItem = {
  id: 'media-1',
  image: 'https://media.example.com/poster.jpg',
  title: 'Test media',
}

const VImgStub = defineComponent({
  inheritAttrs: false,
  props: {
    crossorigin: String,
    src: String,
  },
  emits: ['error', 'load'],
  setup:
    (props, { emit, slots }) =>
    () =>
      h('div', [
        h('img', {
          crossorigin: props.crossorigin,
          src: props.src,
          onError: () => emit('error'),
          onLoad: () => emit('load'),
        }),
        slots.default?.(),
      ]),
})

beforeEach(() => {
  vi.mocked(openMediaServerItem).mockReset()
})

describe.each([
  ['PosterCard', PosterCard],
  ['PlayingBackdropCard', PlayingBackdropCard],
])('%s image request mode', (_name, component) => {
  it('loads the media server image anonymously', async () => {
    const { container } = await renderWithProviders(component, {
      global: { stubs: { VImg: VImgStub } },
      props: { media },
    })

    expect(container.querySelector('img')).toHaveAttribute('crossorigin', 'anonymous')
  })
})

describe('PosterCard touch click and error fallback', () => {
  it('opens media server item on single tap without hovering and when image fails to load', async () => {
    const { container } = await renderWithProviders(PosterCard, {
      global: { stubs: { VImg: VImgStub } },
      props: { media },
    })

    // 触屏未触发 hover 时单点卡片直接跳转播放
    await fireEvent.click(container.querySelector('.v-card')!)
    expect(openMediaServerItem).toHaveBeenCalledTimes(1)

    // 图片加载失败显示遮罩，且非 hover 状态下点击遮罩同样能触发播放
    await fireEvent.error(container.querySelector('img')!)
    await fireEvent.click(container.querySelector('.poster-card-overlay')!)
    expect(openMediaServerItem).toHaveBeenCalledTimes(2)
  })
})

describe('BackdropCard readable scrim', () => {
  it('renders dark gradient scrim behind white text overlay', async () => {
    const { container } = await renderWithProviders(BackdropCard, {
      global: { stubs: { VImg: VImgStub } },
      props: { media },
    })

    expect(container.querySelector('.backdrop-card-scrim')).not.toBeNull()
  })
})
