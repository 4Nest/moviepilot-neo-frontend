import SearchBarDialog from '@/components/dialog/SearchBarDialog.vue'
import { defineComponent, h, ref } from 'vue'
import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it } from 'vitest'

async function renderSearchBar() {
  return renderWithProviders(SearchBarDialog, {
    props: {
      modelValue: true,
      showActivator: true,
    },
  })
}

function getSearchItem(title: string): HTMLElement {
  const item = screen.getByText(title).closest('.v-list-item')
  if (!(item instanceof HTMLElement)) throw new Error(`Search item not found: ${title}`)
  return item
}

function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width, writable: true })
  window.dispatchEvent(new Event('resize'))
}

describe('SearchBarDialog media source selection', () => {
  beforeEach(() => {
    localStorage.clear()
    setViewport(1280)
  })

  it('defaults media searches to TheMovieDB', async () => {
    const user = userEvent.setup()
    const { router } = await renderSearchBar()
    const input = await screen.findByPlaceholderText('搜索电影、剧集以及更多...')

    expect(input.getAttribute('id')).toBe('global-media-search')
    expect(input.getAttribute('aria-label')).toBe('搜索电影、剧集以及更多...')

    await user.type(input, '流浪地球{Enter}')

    await waitFor(() => {
      expect(router.currentRoute.value.path).toBe('/browse/media/search')
      expect(router.currentRoute.value.query).toEqual({
        source: 'themoviedb',
        title: '流浪地球',
        type: 'media',
      })
    })
  })

  it('submits the mobile search form from the software keyboard action', async () => {
    setViewport(390)
    const user = userEvent.setup()
    const { router } = await renderSearchBar()
    const input = await screen.findByPlaceholderText('搜索电影、剧集以及更多...')

    expect(input).toHaveAttribute('type', 'search')
    expect(input).toHaveAttribute('inputmode', 'search')
    expect(input).toHaveAttribute('enterkeyhint', 'search')
    const form = input.closest('form')
    expect(form).not.toBeNull()

    await user.type(input, '流浪地球')
    await fireEvent.submit(form as HTMLFormElement)

    await waitFor(() => {
      expect(router.currentRoute.value.path).toBe('/browse/media/search')
      expect(router.currentRoute.value.query).toEqual({
        source: 'themoviedb',
        title: '流浪地球',
        type: 'media',
      })
    })
  })

  it('uses the native input value when submit precedes compositionend', async () => {
    setViewport(390)
    const { router } = await renderSearchBar()
    const input = await screen.findByPlaceholderText('搜索电影、剧集以及更多...')
    const form = input.closest('form') as HTMLFormElement

    await fireEvent.compositionStart(input)
    await fireEvent.input(input, { target: { value: '流浪地球' } })
    expect(router.currentRoute.value.path).not.toBe('/browse/media/search')
    await fireEvent.submit(form)

    await waitFor(() => {
      expect(router.currentRoute.value.query).toEqual({
        source: 'themoviedb',
        title: '流浪地球',
        type: 'media',
      })
    })
  })

  it('submits from the WebKit search event used by iOS Safari', async () => {
    setViewport(390)
    const { router } = await renderSearchBar()
    const input = await screen.findByPlaceholderText('搜索电影、剧集以及更多...')

    await fireEvent.input(input, { target: { value: '海贼王' } })
    await fireEvent(input, new Event('search', { bubbles: true, cancelable: true }))

    await waitFor(() => {
      expect(router.currentRoute.value.query).toEqual({
        source: 'themoviedb',
        title: '海贼王',
        type: 'media',
      })
    })
  })

  it('submits from the iOS line-break input fallback', async () => {
    setViewport(390)
    const { router } = await renderSearchBar()
    const input = await screen.findByPlaceholderText('搜索电影、剧集以及更多...')

    await fireEvent.input(input, { target: { value: '海贼王' } })
    await fireEvent(
      input,
      new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertLineBreak',
      }),
    )

    await waitFor(() => {
      expect(router.currentRoute.value.query.title).toBe('海贼王')
    })
  })

  it('submits once when the keyboard emits keydown and keyup around submit', async () => {
    setViewport(390)
    const { router } = await renderSearchBar()
    const input = await screen.findByPlaceholderText('搜索电影、剧集以及更多...')
    const form = input.closest('form') as HTMLFormElement

    await userEvent.setup().type(input, '流浪地球')
    await fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 })
    await fireEvent.submit(form)
    await fireEvent.keyUp(input, { key: 'Enter', keyCode: 13 })

    await waitFor(() => {
      expect(router.currentRoute.value.path).toBe('/browse/media/search')
      expect(router.currentRoute.value.query.title).toBe('流浪地球')
    })
  })

  it('places supported sources inside each search item and uses the selected source', async () => {
    const user = userEvent.setup()
    const { router } = await renderSearchBar()
    const input = await screen.findByPlaceholderText('搜索电影、剧集以及更多...')

    await user.type(input, '芙莉莲')
    const mediaItem = getSearchItem('电影、电视剧')
    const collectionItem = getSearchItem('系列合集')
    const personItem = getSearchItem('演员')

    const mediaGroup = within(mediaItem).getByRole('group', { name: '电影、电视剧搜索数据源' })
    const collectionGroup = within(collectionItem).getByRole('group', { name: '系列合集搜索数据源' })
    const personGroup = within(personItem).getByRole('group', { name: '演员搜索数据源' })

    expect(within(mediaGroup).getAllByRole('button')).toHaveLength(4)
    expect(within(collectionGroup).getAllByRole('button')).toHaveLength(1)
    expect(within(personGroup).getAllByRole('button')).toHaveLength(2)
    expect(within(mediaGroup).getByRole('button', { name: '使用 TheMovieDb 搜索' })).toHaveClass(
      'media-source-button--active',
    )

    await user.click(within(mediaGroup).getByRole('button', { name: '使用 AniList 搜索' }))
    await user.click(input)
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(router.currentRoute.value.query).toEqual({
        source: 'anilist',
        title: '芙莉莲',
        type: 'media',
      })
    })
  })

  it('searches actors with the selected supported source', async () => {
    const user = userEvent.setup()
    const { router } = await renderSearchBar()
    const input = await screen.findByPlaceholderText('搜索电影、剧集以及更多...')

    await user.type(input, '刘德华')
    const personItem = getSearchItem('演员')

    const personGroup = within(personItem).getByRole('group', { name: '演员搜索数据源' })
    await user.click(within(personGroup).getByRole('button', { name: '使用 豆瓣 搜索' }))
    await user.click(personItem)

    await waitFor(() => {
      expect(router.currentRoute.value.query).toEqual({
        source: 'douban',
        title: '刘德华',
        type: 'person',
      })
    })
  })

  it('exposes nativePanel with single-select media sources and NEO resource actions', async () => {
    const dialogRef = ref<InstanceType<typeof SearchBarDialog> | null>(null)
    const Host = defineComponent({
      setup() {
        return () => h(SearchBarDialog, { ref: dialogRef, modelValue: false, showActivator: false })
      },
    })
    const { router } = await renderWithProviders(Host)

    const initialPanel = dialogRef.value?.nativePanel()
    expect(initialPanel?.title).toBe('搜索')
    expect(initialPanel?.sections.find(s => s.id === 'actions')?.items).toEqual([])

    initialPanel?.onQuery?.('沙丘')
    const queriedPanel = dialogRef.value?.nativePanel()
    const actionItems = queriedPanel?.sections.find(s => s.id === 'actions')?.items ?? []
    expect(actionItems.map(item => item.id)).toEqual([
      'media-media',
      'media-collection',
      'media-person',
      'resource-torrent',
      'resource-subtitle',
      'shares',
      'history',
    ])

    const mediaAction = actionItems.find(item => item.id === 'media-media')
    const doubanOption = mediaAction?.children?.find(child => child.id === 'source-media-douban')
    expect(doubanOption?.selected).toBe(false)
    doubanOption?.invoke?.()

    const updatedPanel = dialogRef.value?.nativePanel()
    const updatedMediaAction = updatedPanel?.sections
      .find(s => s.id === 'actions')
      ?.items.find(item => item.id === 'media-media')
    expect(updatedMediaAction?.children?.find(child => child.id === 'source-media-douban')?.selected).toBe(true)

    updatedMediaAction?.children?.find(child => child.id === 'run-media')?.invoke?.()
    await waitFor(() => {
      expect(router.currentRoute.value.path).toBe('/browse/media/search')
      expect(router.currentRoute.value.query).toEqual({
        source: 'douban',
        title: '沙丘',
        type: 'media',
      })
    })
  })
})
