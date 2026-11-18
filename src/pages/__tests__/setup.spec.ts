import SetupPage from '@/pages/setup.vue'
import MediaServerSettingsStep from '@/views/setup/MediaServerSettingsStep.vue'
import PreferencesSettingsStep from '@/views/setup/PreferencesSettingsStep.vue'
import { useSetupWizard } from '@/composables/useSetupWizard'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { computed, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  mdAndUp: false,
  routerPush: vi.fn(),
}))

vi.mock('@/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    default: {
      get: mocks.apiGet,
      post: mocks.apiPost,
      put: vi.fn(),
    },
  }
})

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn() }),
}))

vi.mock('vue-router', async importOriginal => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRouter: () => ({ push: mocks.routerPush }),
}))

vi.mock('vuetify', async importOriginal => {
  const actual = await importOriginal<typeof import('vuetify')>()
  return {
    ...actual,
    useDisplay: () => ({
      mdAndUp: computed(() => mocks.mdAndUp),
      smAndDown: ref(true),
    }),
  }
})

describe('setup wizard components', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.routerPush.mockReset()
    mocks.mdAndUp = false
    mocks.apiGet.mockResolvedValue({ success: true, data: {} })
  })

  it('keeps close button visible on mobile (< 960px) and disables step buttons while isSavingStep is true', async () => {
    const wizard = useSetupWizard()
    wizard.currentStep.value = 2

    const { container } = await renderWithProviders(SetupPage)
    await waitFor(() => expect(wizard.isLoading.value).toBe(false))

    const closeBtn = container.querySelector('.setup-wizard-header__actions button')
    expect(closeBtn).not.toBeNull()

    wizard.isSavingStep.value = true
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '下一步' })).toBeDisabled()
      expect(screen.getByRole('button', { name: '上一步' })).toBeDisabled()
    })
    wizard.isSavingStep.value = false
  })

  it('clears ruleSequences when deselecting an active preset in PreferencesSettingsStep', async () => {
    const wizard = useSetupWizard()
    await renderWithProviders(PreferencesSettingsStep)

    const presetBtn = screen.getByRole('button', { name: /4K发烧友/ })
    await fireEvent.click(presetBtn)
    expect(wizard.wizardData.value.preferences.ruleSequences).toHaveLength(1)

    // 再次点击取消选择应清空 ruleSequences
    await fireEvent.click(presetBtn)
    expect(wizard.wizardData.value.preferences.ruleSequences).toEqual([])
  })

  it('does not query mediaserver/library on every keystroke in MediaServerSettingsStep name input', async () => {
    const wizard = useSetupWizard()
    wizard.wizardData.value.mediaServer.type = 'emby'
    wizard.wizardData.value.mediaServer.name = 'Emby 服务器'
    mocks.apiGet.mockClear()

    await renderWithProviders(MediaServerSettingsStep, {
      global: { stubs: { VImg: true } },
    })

    // 未保存的新名称不应在挂载或逐字符输入时自动请求 mediaserver/library
    expect(mocks.apiGet).not.toHaveBeenCalledWith('mediaserver/library', expect.anything())

    const nameInput = screen.getByLabelText('名称')
    await fireEvent.update(nameInput, 'Emby A')
    await fireEvent.update(nameInput, 'Emby AB')
    expect(mocks.apiGet).not.toHaveBeenCalledWith('mediaserver/library', expect.anything())
  })
})
