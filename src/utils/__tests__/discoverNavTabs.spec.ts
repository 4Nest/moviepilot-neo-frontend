import { discoverOrderConfigHandler, discoverSourcesHandler } from '@tests/support/msw/handlers/discover'
import { server } from '@tests/support/msw/server'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useI18n } from '@/composables/useChineseText'
import { getDiscoverSourceIcon, getDiscoverTabs } from '@/router/i18n-menu'
import {
  buildOrderedDiscoverNavTabs,
  ensureDiscoverNavTabsLoaded,
  resetSharedDiscoverNavTabs,
  sharedDiscoverNavTabs,
} from '@/utils/discoverNavTabs'

describe('discoverNavTabs', () => {
  const { t } = useI18n()

  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    resetSharedDiscoverNavTabs()
  })

  afterEach(() => {
    resetSharedDiscoverNavTabs()
  })

  it('preloads built-in and extra discover sources with semantic icons and user order/enabled state', async () => {
    localStorage.setItem(
      'MP_DISCOVER_TAB_ORDER',
      JSON.stringify([
        { name: '腾讯视频', mediaid_prefix: 'tencentvideo', enabled: true },
        { name: '豆瓣', mediaid_prefix: 'douban', enabled: true },
        { name: 'AniList', mediaid_prefix: 'anilist', enabled: false },
      ]),
    )

    server.use(
      discoverSourcesHandler([
        {
          name: '哔哩哔哩',
          mediaid_prefix: 'bilibili',
          api_path: 'discover/bilibili',
          filter_params: {},
          filter_ui: [],
        },
        {
          name: '腾讯视频',
          mediaid_prefix: 'tencentvideo',
          api_path: 'discover/tencentvideo',
          filter_params: {},
          filter_ui: [],
        },
        { name: '芒果TV', mediaid_prefix: 'mangguo', api_path: 'discover/mangguo', filter_params: {}, filter_ui: [] },
      ]),
      discoverOrderConfigHandler([
        { name: '豆瓣', mediaid_prefix: 'douban', enabled: true },
        { name: '哔哩哔哩', mediaid_prefix: 'bilibili', enabled: true },
        { name: '腾讯视频', mediaid_prefix: 'tencentvideo', enabled: true },
        { name: '芒果TV', mediaid_prefix: 'mangguo', enabled: true },
        { name: 'TheMovieDb', mediaid_prefix: 'themoviedb', enabled: true },
        { name: 'AniList', mediaid_prefix: 'anilist', enabled: false },
      ]),
    )

    const resolved = await ensureDiscoverNavTabsLoaded(t)
    expect(resolved.map(item => item.tab)).toEqual([
      'douban',
      'bilibili',
      'tencentvideo',
      'mangguo',
      'themoviedb',
      'bangumi',
    ])
    expect(resolved.find(item => item.tab === 'bilibili')?.icon).toBe('mdi-television-play')
    expect(resolved.find(item => item.tab === 'tencentvideo')?.icon).toBe('mdi-play-box-outline')
    expect(resolved.find(item => item.tab === 'mangguo')?.icon).toBe('mdi-movie-open-play-outline')
    expect(sharedDiscoverNavTabs.value).toHaveLength(6)

    // 再次调用直接复用内存快照
    expect(await ensureDiscoverNavTabsLoaded(t)).toStrictEqual(resolved)
  })

  it('falls back gracefully on custom sources and assigns default compass icon', () => {
    expect(getDiscoverSourceIcon()).toBe('mdi-compass-outline')
    expect(getDiscoverSourceIcon('custom_ext')).toBe('mdi-compass-outline')

    const builtIn = getDiscoverTabs(t)
    const tabs = buildOrderedDiscoverNavTabs(
      builtIn,
      [{ name: '扩展源', mediaid_prefix: 'custom_ext', api_path: 'discover/ext', filter_params: {}, filter_ui: [] }],
      [{ name: '豆瓣', enabled: true }],
    )
    expect(tabs[0].tab).toBe('douban')
    expect(tabs.at(-1)).toEqual({
      title: '扩展源',
      tab: 'custom_ext',
      icon: 'mdi-compass-outline',
    })
  })
})
