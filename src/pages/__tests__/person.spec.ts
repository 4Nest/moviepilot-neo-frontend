import PersonPage from '@/pages/person.vue'
import { screen } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'

const PersonDetailViewStub = defineComponent({
  name: 'PersonDetailView',
  props: {
    personid: String,
    source: String,
    type: String,
  },
  setup(props) {
    return () => h('output', { 'aria-label': '人物详情参数' }, JSON.stringify(props))
  },
})

describe('person page', () => {
  it('reactively projects route query parameters to PersonDetailView', async () => {
    const { router } = await renderWithProviders(PersonPage, {
      initialRoute: { path: '/person', query: { personid: '101', source: 'themoviedb', type: 'person' } },
      global: {
        stubs: {
          PersonDetailView: PersonDetailViewStub,
        },
      },
    })

    const readProps = () =>
      JSON.parse(screen.getByRole('status', { name: '人物详情参数' }).textContent || '{}') as Record<string, unknown>

    expect(readProps()).toEqual({
      personid: '101',
      source: 'themoviedb',
      type: 'person',
    })

    await router.push({ path: '/person', query: { personid: '202', source: 'douban' } })

    expect(readProps()).toEqual({
      personid: '202',
      source: 'douban',
    })
  })
})
