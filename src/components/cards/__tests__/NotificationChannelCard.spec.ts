import type { NotificationConf } from '@/api/types'
import NotificationChannelCard from '@/components/cards/NotificationChannelCard.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { server } from '@tests/support/msw/server'
import { HttpResponse, http } from 'msw'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const API_URL = 'http://localhost/api/v1/system/notification/test'
const mocks = vi.hoisted(() => ({
  openSharedDialog: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

vi.mock('@/composables/useCardAccentColor', () => ({
  useCardAccentColor: () => ({
    accentRgb: ref('141, 81, 249'),
    imageRef: ref(),
    updateAccentColor: vi.fn(),
  }),
}))
const ImageStub = defineComponent({
  inheritAttrs: false,
  setup: () => () => h('img'),
})

function notification(): NotificationConf {
  return {
    name: '主通知',
    type: 'telegram',
    enabled: true,
    config: {
      TELEGRAM_TOKEN: 'token-value',
      TELEGRAM_CHAT_ID: 'chat-value',
    },
    switchs: ['订阅'],
  }
}

async function renderCard() {
  const current = notification()
  return renderWithProviders(NotificationChannelCard, {
    global: { stubs: { VDialogCloseBtn: true, VImg: ImageStub } },
    props: { notification: current, notifications: [current] },
  })
}

describe('NotificationChannelCard test action', () => {
  beforeEach(() => {
    mocks.openSharedDialog.mockReturnValue({ close: vi.fn(), id: 1, updateProps: vi.fn() })
  })

  it('sends the current channel configuration without opening the editor', async () => {
    const requested = vi.fn()
    server.use(
      http.post(API_URL, async ({ request }) => {
        requested(await request.json())
        return HttpResponse.json({ success: true, message: '测试通知发送成功' })
      }),
    )
    await renderCard()

    await fireEvent.click(screen.getByRole('button', { name: '发送测试消息' }))

    await waitFor(() => expect(requested).toHaveBeenCalledOnce())
    expect(requested).toHaveBeenCalledWith(notification())
    expect(mocks.toastSuccess).toHaveBeenCalledWith('测试通知发送成功')
    expect(mocks.openSharedDialog).not.toHaveBeenCalled()
  })
})
