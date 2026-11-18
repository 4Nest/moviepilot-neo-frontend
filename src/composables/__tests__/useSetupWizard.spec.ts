import { useSetupWizard } from '@/composables/useSetupWizard'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  routerPush: vi.fn(),
}))

vi.mock('@/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    default: {
      get: mocks.apiGet,
      post: mocks.apiPost,
      put: mocks.apiPut,
    },
  }
})

vi.mock('vue-toastification', () => ({
  useToast: () => ({
    error: mocks.toastError,
    success: mocks.toastSuccess,
  }),
}))

vi.mock('vue-router', async importOriginal => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRouter: () => ({ push: mocks.routerPush }),
}))

describe('useSetupWizard', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.apiPut.mockReset()
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.routerPush.mockReset()
  })

  it('validates apiToken minimum length of 16 and surfaces updateUserPassword failure', async () => {
    const wizard = useSetupWizard()
    wizard.currentStep.value = 1
    wizard.wizardData.value.basic.username = 'admin'
    wizard.wizardData.value.basic.apiToken = 'short-token'
    wizard.wizardData.value.basic.password = ''
    wizard.wizardData.value.basic.confirmPassword = ''

    const invalidCheck = wizard.validateCurrentStep()
    expect(invalidCheck.isValid).toBe(false)
    expect(invalidCheck.errors).toContain('API Token不得低于16位')

    const candidateSecret = ['newpass', '123'].join('')
    wizard.wizardData.value.basic.apiToken = '1234567890abcdef1234'
    wizard.wizardData.value.basic.password = candidateSecret
    wizard.wizardData.value.basic.confirmPassword = candidateSecret

    mocks.apiPost.mockResolvedValue({ success: true })
    mocks.apiPut.mockResolvedValueOnce({ success: false, message: '弱密码被拒绝' })

    const advanced = await wizard.nextStep()
    expect(advanced).toBe(false)
    expect(mocks.toastError).toHaveBeenCalledWith('弱密码被拒绝')
    expect(wizard.isSavingStep.value).toBe(false)
  })

  it('preserves multi-instance settings (index >= 1) and saves 1D ruleGroupNames array', async () => {
    mocks.apiGet.mockImplementation((url: string) => {
      switch (url) {
        case 'system/env':
          return Promise.resolve({
            success: true,
            data: { SUPERUSER: 'admin', API_TOKEN: '1234567890abcdef1234' },
          })
        case 'site/auth':
          return Promise.resolve({})
        case 'system/setting/UserSiteAuthParams':
          return Promise.resolve({ success: true, data: { value: {} } })
        case 'system/setting/public/Storages':
          return Promise.resolve({
            success: true,
            data: {
              value: [
                { name: '本地存储', type: 'local', config: {} },
                { name: '115网盘', type: 'u115', config: { token: 'keep' } },
              ],
            },
          })
        case 'system/setting/public/Directories':
          return Promise.resolve({
            success: true,
            data: {
              value: [
                { name: '默认目录', storage: 'local', download_path: '/dl1', library_path: '/lib1' },
                { name: '动漫目录', storage: 'u115', download_path: '/dl2', library_path: '/lib2' },
              ],
            },
          })
        case 'system/setting/Downloaders':
          return Promise.resolve({
            success: true,
            data: {
              value: [
                { name: 'qb1', type: 'qbittorrent', config: { host: 'http://127.0.0.1:8080', apikey: 'key1' } },
                { name: 'tr2', type: 'transmission', config: { host: 'http://127.0.0.1:9091' } },
              ],
            },
          })
        case 'system/setting/MediaServers':
          return Promise.resolve({
            success: true,
            data: {
              value: [
                { name: 'emby1', type: 'emby', config: { host: 'http://127.0.0.1:8096', apikey: 'ekey' } },
                { name: 'plex2', type: 'plex', config: { host: 'http://127.0.0.1:32400', token: 'ptok' } },
              ],
            },
          })
        case 'system/setting/Notifications':
          return Promise.resolve({
            success: true,
            data: {
              value: [
                {
                  id: 'n1',
                  name: 'tg1',
                  type: 'telegram',
                  enabled: true,
                  config: { TELEGRAM_TOKEN: 't', TELEGRAM_CHAT_ID: 'c' },
                  switchs: [],
                },
                { id: 'n2', name: 'wx2', type: 'wechat', enabled: true, config: { WECHAT_CORPID: 'w' }, switchs: [] },
              ],
            },
          })
        case 'system/setting/UserFilterRuleGroups':
          return Promise.resolve({
            success: true,
            data: {
              value: [
                { name: '旧首项规则组', rule_string: '4K', media_type: '', category: '' },
                { name: '保留的动漫规则组', rule_string: 'CNSUB', media_type: '电视剧', category: '动漫' },
              ],
            },
          })
        default:
          return Promise.resolve({ success: true })
      }
    })
    mocks.apiPost.mockResolvedValue({ success: true })

    const wizard = useSetupWizard()
    await wizard.initialize()

    // 步骤 3：保存存储与目录时保留索引 >= 1 的存量项
    wizard.currentStep.value = 3
    wizard.wizardData.value.storage.downloadPath = '/dl1-updated'
    wizard.wizardData.value.storage.libraryPath = '/lib1-updated'
    // 跳过 2 秒等待的连通性测试，只验证保存阶段数据：mock moduletest 通过并加速定时器
    vi.useFakeTimers()
    const step3Promise = wizard.nextStep()
    await vi.runAllTimersAsync()
    await step3Promise
    expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/Storages', [
      expect.objectContaining({ type: 'local' }),
      expect.objectContaining({ name: '115网盘', type: 'u115' }),
    ])
    expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/Directories', [
      expect.objectContaining({ download_path: '/dl1-updated', library_path: '/lib1-updated' }),
      expect.objectContaining({ name: '动漫目录', storage: 'u115' }),
    ])

    // 步骤 4：保存下载器时保留索引 >= 1 的存量项
    wizard.currentStep.value = 4
    const step4Promise = wizard.nextStep()
    await vi.runAllTimersAsync()
    await step4Promise
    expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/Downloaders', [
      expect.objectContaining({ name: 'qb1', type: 'qbittorrent', default: true }),
      expect.objectContaining({ name: 'tr2', type: 'transmission', default: false }),
    ])

    // 步骤 5：保存媒体服务器时保留索引 >= 1 的存量项
    wizard.currentStep.value = 5
    const step5Promise = wizard.nextStep()
    await vi.runAllTimersAsync()
    await step5Promise
    expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/MediaServers', [
      expect.objectContaining({ name: 'emby1', type: 'emby' }),
      expect.objectContaining({ name: 'plex2', type: 'plex' }),
    ])
    vi.useRealTimers()

    // 步骤 6：保存通知渠道时保留索引 >= 1 的存量项
    wizard.currentStep.value = 6
    await wizard.nextStep()
    expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/Notifications', [
      expect.objectContaining({ id: 'n1', name: 'tg1', type: 'telegram' }),
      expect.objectContaining({ id: 'n2', name: 'wx2', type: 'wechat' }),
    ])

    // 验证步骤 7 规则组保存：保留索引 >= 1 的存量项，且 SubscribeFilterRuleGroups 为一维字符串数组
    wizard.currentStep.value = 7
    wizard.updatePreferences({ excludeDolbyVision: true, excludeBluray: true }, [
      { name: '4K发烧友', rule_string: '4K & !DOLBY', media_type: '', category: '' },
    ])
    await wizard.nextStep()

    expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/UserFilterRuleGroups', [
      { name: '4K发烧友', rule_string: '4K & !DOLBY', media_type: '', category: '' },
      { name: '保留的动漫规则组', rule_string: 'CNSUB', media_type: '电视剧', category: '动漫' },
    ])
    expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/SubscribeFilterRuleGroups', ['4K发烧友'])
    expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/BestVersionFilterRuleGroups', ['4K发烧友'])
  })
})
