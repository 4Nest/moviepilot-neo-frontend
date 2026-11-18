import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Footer from '@/layouts/default/components/Footer.vue'
import { dynamicButtonRegistry } from '@/composables/dynamicButtonRegistry'
import { renderWithProviders } from '@tests/support/render'
import { ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/composables/usePWA', () => ({
  usePWA: () => ({ appMode: ref(true) }),
}))

vi.mock('@/composables/useLaunchLoading', () => ({
  useLaunchLoading: () => ({ isLaunchLoading: ref(false) }),
}))

vi.mock('vue-router', async importOriginal => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRoute: () => ({ path: '/subscribe' }),
}))

describe('Footer.vue', () => {
  afterEach(() => {
    dynamicButtonRegistry.unregister()
  })

  it('provides aria-label on the dynamic action button and scopes styles under .footer-nav-container', async () => {
    dynamicButtonRegistry.register({
      title: '新增订阅规则',
      icon: 'mdi-plus',
      show: true,
      routePath: '/subscribe',
      action: vi.fn(),
    })

    await renderWithProviders(Footer, {
      props: { showNav: true },
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
        },
      },
    })

    const dynamicBtn = document.body.querySelector('.dynamic-btn-activator button')
    expect(dynamicBtn).not.toBeNull()
    expect(dynamicBtn?.getAttribute('aria-label')).toBe('新增订阅规则')

    const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..')
    const footerSource = readFileSync(resolve(rootDir, 'src/layouts/default/components/Footer.vue'), 'utf8')
    const styleBlock = footerSource.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] ?? ''

    expect(styleBlock).toContain('.footer-nav-container')
    expect(styleBlock).not.toContain('@keyframes fade-in')
    expect(styleBlock).not.toMatch(/^\.footer-nav-card\s*\{/m)
  })
})
