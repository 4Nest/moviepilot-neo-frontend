import { reactive } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const routeState = reactive({
  query: {
    title: '主演阵容' as string | undefined,
  },
})

vi.mock('vue-router', async importOriginal => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRoute: () => routeState,
}))

import CreditsPage from '@/pages/credits.vue'

describe('credits.vue', () => {
  it('reactively updates page title when route.query.title changes', async () => {
    const wrapper = mount(CreditsPage, {
      props: { paths: ['tmdb', '123'] },
      global: {
        stubs: {
          VPageContentTitle: {
            props: ['title'],
            template: '<h1 data-testid="page-title">{{ title }}</h1>',
          },
          PersonCardListView: {
            props: ['apipath'],
            template: '<div />',
          },
        },
      },
    })

    expect(wrapper.get('[data-testid="page-title"]').text()).toBe('主演阵容')

    routeState.query.title = '导演与编剧'
    await wrapper.vm.$nextTick()

    expect(wrapper.get('[data-testid="page-title"]').text()).toBe('导演与编剧')
  })
})
