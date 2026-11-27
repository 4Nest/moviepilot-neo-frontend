<script setup lang="ts">
import api from '@/api'
import type { Site, Plugin, Subscribe } from '@/api/types'
import { getNavMenus, getSettingTabs } from '@/router/i18n-menu'
import { NavMenu } from '@/@layouts/types'
import SearchSiteDialog from '@/components/dialog/SearchSiteDialog.vue'
import { encodeSearchRuleGroupsParam, loadStoredSearchSelection } from '@/composables/useSearchSelection'
import { useI18n } from '@/composables/useChineseText'
import { useUserStore } from '@/stores'
import { useDisplay } from 'vuetify'
import { VDialog, VMenu } from 'vuetify/components'
import type { NativePanelEntry, NativePanelSource } from '@/native/registry'
import { nativePanelId } from '@/native/panel'

// 显示器宽度
const display = useDisplay()

// 多语言支持
const { t } = useI18n()

const userStore = useUserStore()
// 定义 props，接收浮层状态及是否显示响应式入口。
const props = withDefaults(
  defineProps<{
    modelValue: boolean
    showActivator?: boolean
  }>(),
  {
    showActivator: false,
  },
)

// 路由
const router = useRouter()

// 所有订阅数据
const SubscribeItems = ref<Subscribe[]>([])

// 站点选择对话框
const chooseSiteDialog = ref(false)
const selectedSites = ref<number[]>([])
const allSites = ref<Site[]>([])

// 定义事件
const emit = defineEmits(['close', 'update:modelValue'])
// 防止同一软键盘动作通过键盘事件和表单提交重复导航。
let searchSubmissionLocked = false

// 对话框状态的本地计算属性
const dialog = computed({
  get: () => props.modelValue,
  set: val => emit('update:modelValue', val),
})

// 桌面使用锚定下拉，小屏继续使用原有搜索弹窗。
const searchOverlay = computed(() => (display.mdAndUp.value ? VMenu : VDialog))
const searchOverlayProps = computed(() =>
  display.mdAndUp.value
    ? {
        closeOnContentClick: false,
        location: 'bottom start' as const,
        offset: 8,
        scrollStrategy: 'reposition' as const,
      }
    : {
        fullscreen: true,
        maxWidth: '40rem',
        scrollable: true,
      },
)

// 搜索词
const searchWord = ref<string | null>(null)

type MediaSearchSource = 'themoviedb' | 'douban' | 'bangumi' | 'anilist'
type MediaSearchType = 'media' | 'collection' | 'person'

interface MediaSearchSourceOption {
  label: string
  name: string
  value: MediaSearchSource
}

interface MediaSearchAction {
  type: MediaSearchType
  icon: string
  title: string
  description: string
}

// 三类搜索各自维护来源选择，首次使用均默认 TheMovieDB。
const selectedMediaSearchSources = reactive<Record<MediaSearchType, MediaSearchSource>>({
  media: 'themoviedb',
  collection: 'themoviedb',
  person: 'themoviedb',
})

// 按后端实际能力限定每类搜索可选的数据源。
const mediaSearchSourceOptions = computed<Record<MediaSearchType, MediaSearchSourceOption[]>>(() => {
  const themoviedb = {
    label: 'TMDB',
    name: t('discoverTabs.themoviedb'),
    value: 'themoviedb' as const,
  }
  const douban = {
    label: t('discoverTabs.douban'),
    name: t('discoverTabs.douban'),
    value: 'douban' as const,
  }
  const bangumi = {
    label: 'Bangumi',
    name: t('discoverTabs.bangumi'),
    value: 'bangumi' as const,
  }
  const anilist = {
    label: 'AniList',
    name: t('discoverTabs.anilist'),
    value: 'anilist' as const,
  }

  return {
    media: [themoviedb, douban, bangumi, anilist],
    collection: [themoviedb],
    person: [themoviedb, douban],
  }
})

// 搜索项及其来源组共用同一份声明，避免显示能力与请求类型不一致。
const mediaSearchActions = computed(() => {
  return [
    {
      type: 'media',
      icon: 'mdi-movie-search',
      title: `${t('recommend.categoryMovie')}、${t('recommend.categoryTV')}`,
      description: t('resource.title'),
    },
    {
      type: 'collection',
      icon: 'mdi-movie-filter',
      title: t('dialog.searchBar.collections'),
      description: t('dialog.searchBar.collectionSearch'),
    },
    {
      type: 'person',
      icon: 'mdi-account-search',
      title: t('browse.actor'),
      description: t('dialog.searchBar.actorSearch'),
    },
  ] satisfies MediaSearchAction[]
})

// 当前尺寸下可见的搜索输入框。
const searchWordInput = ref<HTMLInputElement | null>(null)

// 近期搜索词条
const recentSearches = ref<string[]>([])

/** 检测操作系统是否为 macOS。 */
function isMac() {
  return navigator.platform.toUpperCase().indexOf('MAC') >= 0
}

// 计算属性：根据操作系统显示不同的按键提示
const metaKey = computed(() => (isMac() ? '⌘+K' : 'Ctrl+K'))

/** 将有效关键词保存到近期搜索记录。 */
function saveRecentSearches(keyword: string) {
  if (!keyword) return
  if (recentSearches.value.includes(keyword)) return
  recentSearches.value.unshift(keyword)
  localStorage.setItem('MP_RecentSearches', JSON.stringify(recentSearches.value))
}

/** 从本地存储加载并裁剪近期搜索记录。 */
function loadRecentSearches() {
  const recentSearchesStr = localStorage.getItem('MP_RecentSearches')
  if (recentSearchesStr) {
    recentSearches.value = JSON.parse(recentSearchesStr)
    // 只保留最近的 5 条
    if (recentSearches.value.length > 5) {
      recentSearches.value = recentSearches.value.slice(0, 5)
    }
  }
}

/** 获取可参与全局搜索的导航菜单和设置入口。 */
function getMenus(): NavMenu[] {
  const menus: NavMenu[] = []
  // 导航菜单
  getNavMenus(t).forEach(
    item =>
      item &&
      menus.push({
        title: item.full_title ?? item.title,
        icon: item.icon,
        to: item.to,
        header: item.header,
        admin: item.admin,
      }),
  )
  if (userStore.superUser) {
    // 设置标签页
    getSettingTabs(t).forEach(
      item =>
        item &&
        menus.push({
          title: t('navItems.setting') + ' -> ' + item.title,
          icon: item.icon,
          to: `/setting?tab=${item.tab}`,
          header: '',
          admin: true,
          description: item.description,
        }),
    )
  }
  return menus
}

// 匹配的菜单列表
const matchedMenuItems = computed(() => {
  if (!searchWord.value) return []
  const lowerWord = (searchWord.value as string).toLowerCase()
  // 根据搜索词过滤菜单
  return getMenus().filter(
    item =>
      item.title.toLowerCase().includes(lowerWord) ||
      (item.description && item.description.toLowerCase().includes(lowerWord)),
  )
})

// 所有插件（已安装）
const pluginItems = ref<Plugin[]>([])

/** 加载已安装插件，供搜索结果匹配。 */
async function fetchInstalledPlugins() {
  try {
    pluginItems.value = await api.get('plugin/', {
      params: {
        state: 'installed',
      },
    })
  } catch (error) {
    console.error(error)
  }
}

// 匹配的插件列表
const matchedPluginItems = computed(() => {
  if (!searchWord.value) return []
  const lowerWord = (searchWord.value as string).toLowerCase()
  return pluginItems.value.filter((item: Plugin) => {
    if (!item.plugin_name && !item.plugin_desc) return false
    return item.plugin_name?.toLowerCase().includes(lowerWord) || item.plugin_desc?.toLowerCase().includes(lowerWord)
  })
})

/** 加载订阅列表，供搜索结果匹配。 */
async function fetchSubscribes() {
  try {
    SubscribeItems.value = await api.get('subscribe/')
  } catch (error) {
    console.error(error)
  }
}

/** 从接口加载用户的站点搜索偏好。 */
const loadUserSitePreferences = async () => {
  try {
    const result = await api.get('system/setting/public/IndexerSites')
    if (result && result.data && result.data.value) {
      selectedSites.value = result.data.value
      return
    }
  } catch (err) {
    console.error(err)
  }
}

/** 查询所有启用站点，并初始化默认选择。 */
async function queryAllSites() {
  try {
    const data: Site[] = await api.get('site/')
    // 过滤站点，只有启用的站点才显示
    allSites.value = data.filter(item => item.is_active)
    // 如果没有选择任何站点并且有可用站点，才默认选择全部
    if (selectedSites.value.length === 0 && allSites.value.length > 0) {
      selectedSites.value = allSites.value.map((site: Site) => site.id)
    }
  } catch (error) {
    console.log(error)
  }
}

/** 打开站点选择对话框。 */
const openSiteDialog = () => {
  chooseSiteDialog.value = true
}

// 匹配的订阅列表
const matchedSubscribeItems = computed(() => {
  if (!searchWord.value) return []
  const lowerWord = (searchWord.value as string).toLowerCase()
  return SubscribeItems.value.filter((item: Subscribe) => Boolean(item.name?.toLowerCase().includes(lowerWord)))
})

// 本次搜索选中的过滤规则参数（undefined 表示沿用系统默认规则）
const selectedRuleGroups = ref<string | undefined>(undefined)

/** 使用选中的站点执行站点资源搜索。 */
function searchSites(sites: number[], ruleGroups?: string) {
  chooseSiteDialog.value = false
  selectedSites.value = sites
  selectedRuleGroups.value = ruleGroups
  performSearchTorrent(true)
}

/** 使用当前关键词搜索站点资源（模板点击入口）。 */
function searchTorrent() {
  performSearchTorrent(false)
}

/** 执行站点资源搜索跳转，非弹窗入口时同步读取本地记忆的站点与规则选择。 */
function performSearchTorrent(fromDialog: boolean) {
  if (!searchWord.value) return
  let targetSites = selectedSites.value
  let targetRuleGroups = selectedRuleGroups.value
  if (!fromDialog) {
    const stored = loadStoredSearchSelection()
    if (stored) {
      if (stored.sites && stored.sites.length > 0 && allSites.value.length > 0) {
        const availableIds = new Set(allSites.value.map((site: Site) => site.id))
        const validStoredSites = stored.sites.filter(id => availableIds.has(id))
        if (validStoredSites.length > 0) {
          targetSites = validStoredSites
        }
      }
      targetRuleGroups = encodeSearchRuleGroupsParam(stored)
    }
  }
  // 记录搜索词
  saveRecentSearches(searchWord.value)
  // 跳转到搜索页面
  router.push({
    path: '/resource',
    query: {
      keyword: searchWord.value,
      area: 'title',
      sites: targetSites.join(','),
      ...(targetRuleGroups ? { rule_groups: targetRuleGroups } : {}),
    },
  })
  closeSearch()
}

/** 从原生输入框读取最新值，覆盖 IME 提交早于 v-model input 的时序。 */
function syncSearchWord(event?: Event): string {
  const input = event?.target instanceof HTMLInputElement ? event.target : searchWordInput.value
  const keyword = input?.value.trim() || searchWord.value?.trim() || ''
  if (searchWord.value !== keyword) searchWord.value = keyword
  return keyword
}

/** 请求当前输入框所属表单提交，统一承接键盘、WebKit search 与换行输入事件。 */
function requestSearchSubmit(event: Event) {
  if (searchSubmissionLocked) return
  if (event instanceof KeyboardEvent && event.isComposing && event.keyCode !== 229) return
  if (event instanceof InputEvent && event.inputType !== 'insertLineBreak' && event.inputType !== 'insertParagraph')
    return

  const input = event.currentTarget instanceof HTMLInputElement ? event.currentTarget : searchWordInput.value
  if (!input || !syncSearchWord(event)) return
  event.preventDefault()
  input.form?.requestSubmit()
}

/** 跳转到指定类型的媒体搜索结果页。 */
function searchMedia(searchType: MediaSearchType, event?: Event) {
  const keyword = syncSearchWord(event)
  if (!keyword || searchSubmissionLocked) return
  searchSubmissionLocked = true
  saveRecentSearches(keyword)
  router.push({
    path: '/browse/media/search',
    query: {
      title: keyword,
      type: searchType,
      source: selectedMediaSearchSources[searchType],
    },
  })
  closeSearch()
}

/** 跳转到包含当前关键词的历史记录页。 */
function searchHistory() {
  if (!searchWord.value) return
  saveRecentSearches(searchWord.value)
  router.push({
    path: '/history',
    query: {
      search: searchWord.value,
    },
  })
  closeSearch()
}

/** 跳转到包含当前关键词的订阅分享页。 */
function searchSubscribeShares() {
  if (!searchWord.value) return
  saveRecentSearches(searchWord.value)
  router.push({
    path: '/subscribe-share',
    query: {
      keyword: searchWord.value,
    },
  })
  closeSearch()
}

/** 打开匹配插件的已安装详情。 */
function showPlugin(pluginId: string) {
  router.push({
    path: `/plugins/`,
    query: {
      tab: 'installed',
      id: pluginId,
    },
  })
  closeSearch()
}

/** 跳转到匹配的功能菜单。 */
function goPage(to: string) {
  router.push(to)
  closeSearch()
}

/** 根据订阅类型跳转到对应订阅详情。 */
function goSubscribe(subscribe: Subscribe) {
  if (subscribe.type === '电影') {
    router.push({
      path: '/subscribe/movie',
      query: {
        id: subscribe.id,
      },
    })
  } else {
    router.push({
      path: '/subscribe/tv',
      query: {
        id: subscribe.id,
      },
    })
  }
  closeSearch()
}

/** 关闭搜索浮层并通知外层入口同步状态。 */
function closeSearch() {
  dialog.value = false
  emit('close')
}

/** 聚焦当前可见输入框，供快捷键入口复用。 */
function focusSearchInput() {
  searchWordInput.value?.focus()
}

watch(dialog, async isOpen => {
  searchSubmissionLocked = !isOpen
  if (!isOpen) return
  searchSubmissionLocked = false
  await nextTick()
  focusSearchInput()
})

/** 让 App 使用系统搜索框；结果、来源选择与跳转均复用本组件状态。 */
function nativePanel(): NativePanelSource {
  const keyword = searchWord.value?.trim() || ''
  const actions: NativePanelEntry[] = []
  if (keyword) {
    for (const action of mediaSearchActions.value) {
      actions.push({
        id: `media-${action.type}`,
        title: action.title,
        icon: action.icon,
        subtitle: `${t('common.search')} ${keyword}`,
        children: [
          {
            id: `run-${action.type}`,
            title: t('common.search'),
            icon: 'search',
            primary: true,
            invoke: () => {
              searchSubmissionLocked = false
              searchMedia(action.type)
            },
          },
          ...mediaSearchSourceOptions.value[action.type].map(source => ({
            id: `source-${action.type}-${source.value}`,
            title: source.label,
            selected: selectedMediaSearchSources[action.type] === source.value,
            keepOpen: true,
            invoke: () => {
              selectedMediaSearchSources[action.type] = source.value
            },
          })),
        ],
      })
    }
    if (userStore.superUser) {
      actions.push({
        id: 'resource-torrent',
        title: t('dialog.searchBar.relatedResources'),
        subtitle: `${t('common.search')} ${keyword}`,
        icon: 'search',
        children: [
          {
            id: 'run-resource-torrent',
            title: t('common.search'),
            icon: 'search',
            primary: true,
            invoke: searchTorrent,
          },
          {
            id: 'sites-torrent',
            title: t('dialog.searchBar.selectSites'),
            icon: 'mdi-web',
            invoke: () => openSiteDialog(),
          },
        ],
      })
      actions.push({
        id: 'shares',
        title: t('subscribe.searchShares'),
        icon: 'mdi-share-variant',
        invoke: searchSubscribeShares,
      })
      actions.push({
        id: 'history',
        title: t('navItems.history'),
        icon: 'mdi-history',
        invoke: searchHistory,
      })
    }
  }
  return {
    title: t('common.search'),
    search: { text: keyword, placeholder: t('dialog.searchBar.searchPlaceholder') },
    emptyText: t('dialog.searchBar.emptySearchHint'),
    onQuery: value => {
      searchSubmissionLocked = false
      searchWord.value = value
    },
    sections: [
      { id: 'actions', items: actions },
      {
        id: 'menus',
        title: t('dialog.searchBar.functions'),
        items: matchedMenuItems.value.slice(0, 20).map(item => ({
          id: nativePanelId('menu', item.to),
          title: item.title || '',
          subtitle: item.description,
          icon: String(item.icon || 'apps'),
          invoke: () => goPage(String(item.to)),
        })),
      },
      {
        id: 'subscriptions',
        title: t('dialog.searchBar.subscriptions'),
        items: matchedSubscribeItems.value.slice(0, 10).map(item => ({
          id: nativePanelId('subscribe', item.id),
          title: item.name || '',
          icon: 'mdi-rss',
          invoke: () => goSubscribe(item),
        })),
      },
      ...(userStore.superUser
        ? [
            {
              id: 'plugins',
              title: t('dialog.searchBar.plugins'),
              items: matchedPluginItems.value.slice(0, 10).map(item => ({
                id: nativePanelId('plugin', item.id),
                title: item.plugin_name || item.id || '',
                subtitle: item.plugin_desc,
                icon: 'mdi-puzzle-outline',
                invoke: () => showPlugin(item.id ?? ''),
              })),
            },
          ]
        : []),
      {
        id: 'recent',
        title: t('dialog.searchBar.recentSearches'),
        items: keyword
          ? []
          : recentSearches.value.slice(0, 5).map(item => ({
              id: nativePanelId('recent', item),
              title: item,
              icon: 'mdi-history',
              keepOpen: true,
              invoke: () => {
                searchWord.value = item
              },
            })),
      },
    ],
  }
}

defineExpose({ focusSearchInput, nativePanel })

onMounted(() => {
  fetchSubscribes()
  loadRecentSearches()
  if (userStore.superUser) {
    fetchInstalledPlugins()
    loadUserSitePreferences()
    queryAllSites()
  }
})
</script>
<template>
  <component :is="searchOverlay" v-model="dialog" v-bind="searchOverlayProps">
    <template v-if="showActivator" #activator="{ props: activatorProps }">
      <!-- 小屏入口保持图标形态，点击后打开全屏搜索弹窗。 -->
      <IconBtn
        v-if="!display.mdAndUp.value"
        v-bind="activatorProps"
        class="search-icon-trigger"
        :aria-label="t('dialog.searchBar.openSearch')"
      >
        <VIcon class="search-icon-trigger__icon" icon="mdi-magnify" />
      </IconBtn>

      <!-- 中屏及以上常驻搜索输入框，输入时直接在下方展示同一组选项。 -->
      <div v-else v-bind="activatorProps" class="search-desktop-activator">
        <form class="search-input-wrapper" @submit.prevent="searchMedia('media', $event)">
          <VIcon icon="mdi-magnify" size="18" class="search-input-icon" />
          <input
            ref="searchWordInput"
            v-model="searchWord"
            id="global-media-search"
            type="search"
            inputmode="search"
            enterkeyhint="search"
            class="search-native-input"
            :aria-label="t('dialog.searchBar.searchPlaceholder')"
            :placeholder="t('dialog.searchBar.searchPlaceholder')"
            @keydown.enter="requestSearchSubmit"
            @keyup.enter="requestSearchSubmit"
            @beforeinput="requestSearchSubmit"
            @search="requestSearchSubmit"
            @compositionend="syncSearchWord"
            @keydown.escape.stop="closeSearch"
          />
          <kbd class="search-shortcut-badge">{{ metaKey }}</kbd>
        </form>
      </div>
    </template>

    <VCard class="search-dialog" :class="{ 'search-dialog--dropdown': display.mdAndUp.value }">
      <!-- 弹窗模式保留原有搜索输入区。 -->
      <div v-if="!display.mdAndUp.value" class="search-header">
        <form class="search-input-wrapper" @submit.prevent="searchMedia('media', $event)">
          <VIcon icon="mdi-magnify" size="18" class="search-input-icon" />
          <input
            ref="searchWordInput"
            v-model="searchWord"
            id="global-media-search"
            type="search"
            inputmode="search"
            enterkeyhint="search"
            class="search-native-input"
            :aria-label="t('dialog.searchBar.searchPlaceholder')"
            :placeholder="t('dialog.searchBar.searchPlaceholder')"
            @keydown.enter="requestSearchSubmit"
            @keyup.enter="requestSearchSubmit"
            @beforeinput="requestSearchSubmit"
            @search="requestSearchSubmit"
            @compositionend="syncSearchWord"
            @keydown.escape.stop="closeSearch"
          />
          <VBtn type="submit" icon size="x-small" variant="text" class="search-submit-btn">
            <VIcon icon="mdi-arrow-right" size="18" />
          </VBtn>
        </form>
      </div>

      <!-- 主内容区域 -->
      <div class="search-content">
        <!-- 有搜索词时显示搜索入口和匹配结果 -->
        <VList lines="two" v-if="searchWord" class="search-list pa-0 py-1.5">
          <!-- 媒体搜索入口 -->
          <VListSubheader class="font-weight-medium text-uppercase px-4 search-subheader">
            {{ t('common.media') }}
          </VListSubheader>

          <VListItem
            v-for="action in mediaSearchActions"
            :key="action.type"
            density="compact"
            link
            class="search-result-item search-source-result-item mx-2"
            @click="searchMedia(action.type)"
          >
            <template #prepend>
              <div class="result-icon-wrapper">
                <VIcon :icon="action.icon" size="16" color="medium-emphasis" />
              </div>
            </template>
            <VListItemTitle class="font-weight-medium text-body-2">
              {{ action.title }}
            </VListItemTitle>
            <VListItemSubtitle class="text-caption text-medium-emphasis">
              {{ t('common.search') }} <span class="primary-text font-weight-medium">{{ searchWord }}</span>
              {{ action.description }}
            </VListItemSubtitle>
            <template v-if="mediaSearchSourceOptions[action.type].length > 1" #append>
              <div class="search-item-source-row">
                <VBtnToggle
                  v-model="selectedMediaSearchSources[action.type]"
                  class="search-item-source-toggle"
                  density="compact"
                  mandatory
                  role="group"
                  selected-class="media-source-button--active"
                  variant="text"
                  :aria-label="t('dialog.searchBar.mediaSourceFor', { type: action.title })"
                  @click.stop
                  @keydown.stop
                >
                  <VBtn
                    v-for="source in mediaSearchSourceOptions[action.type]"
                    :key="source.value"
                    class="media-source-button"
                    size="x-small"
                    :value="source.value"
                    :aria-label="t('dialog.searchBar.searchWithSource', { source: source.name })"
                    :title="t('dialog.searchBar.searchWithSource', { source: source.name })"
                  >
                    {{ source.label }}
                  </VBtn>
                </VBtnToggle>
              </div>
            </template>
          </VListItem>

          <VListItem
            v-if="userStore.superUser"
            density="compact"
            link
            @click="searchSubscribeShares"
            class="search-result-item mx-2"
          >
            <template #prepend>
              <div class="result-icon-wrapper">
                <VIcon icon="mdi-share-variant" size="16" color="medium-emphasis" />
              </div>
            </template>
            <VListItemTitle class="font-weight-medium text-body-2">{{ t('subscribe.searchShares') }}</VListItemTitle>
            <VListItemSubtitle class="text-caption text-medium-emphasis">
              {{ t('common.search') }} <span class="primary-text font-weight-medium">{{ searchWord }}</span>
              {{ t('dialog.searchBar.subscribeShareSearch') }}
            </VListItemSubtitle>
          </VListItem>

          <VListItem
            v-if="userStore.superUser"
            density="compact"
            link
            @click="searchHistory"
            class="search-result-item mx-2"
          >
            <template #prepend>
              <div class="result-icon-wrapper">
                <VIcon icon="mdi-history" size="16" color="medium-emphasis" />
              </div>
            </template>
            <VListItemTitle class="font-weight-medium text-body-2">{{ t('navItems.history') }}</VListItemTitle>
            <VListItemSubtitle class="text-caption text-medium-emphasis">
              {{ t('common.search') }} <span class="primary-text font-weight-medium">{{ searchWord }}</span>
              {{ t('dialog.searchBar.historySearch') }}
            </VListItemSubtitle>
          </VListItem>
          <!-- 匹配的订阅 -->
          <template v-if="matchedSubscribeItems.length > 0">
            <VDivider class="mx-4 my-1.5 search-divider" />
            <VListSubheader class="font-weight-medium text-uppercase px-4 search-subheader">
              {{ t('dialog.searchBar.subscriptions') }}
            </VListSubheader>
            <VListItem
              v-for="subscribe in matchedSubscribeItems"
              :key="subscribe.id"
              density="compact"
              link
              @click="goSubscribe(subscribe)"
              class="search-result-item mx-2"
            >
              <template #prepend>
                <div class="result-icon-wrapper">
                  <VIcon
                    :icon="subscribe.type === '电影' ? 'mdi-movie-roll' : 'mdi-television-classic'"
                    size="16"
                    color="medium-emphasis"
                  />
                </div>
              </template>
              <VListItemTitle class="font-weight-medium text-body-2">
                {{ subscribe.name }}
                <span v-if="subscribe.season" class="text-caption">
                  {{ t('resource.season') }} {{ subscribe.season }}</span
                >
              </VListItemTitle>
              <VListItemSubtitle class="text-caption text-medium-emphasis">
                {{ subscribe.type }}
              </VListItemSubtitle>
            </VListItem>
          </template>

          <!-- 匹配的菜单/功能 -->
          <template v-if="matchedMenuItems.length > 0">
            <VDivider class="mx-4 my-1.5 search-divider" />
            <VListSubheader class="font-weight-medium text-uppercase px-4 search-subheader">
              {{ t('dialog.searchBar.functions') }}
            </VListSubheader>
            <VListItem
              v-for="menu in matchedMenuItems"
              :key="menu.title"
              density="compact"
              link
              @click="goPage(menu.to as string)"
              class="search-result-item mx-2"
            >
              <template #prepend>
                <div class="result-icon-wrapper">
                  <VIcon :icon="menu.icon as string" size="16" color="medium-emphasis" />
                </div>
              </template>
              <VListItemTitle class="font-weight-medium text-body-2">
                {{ menu.title }}
              </VListItemTitle>
              <VListItemSubtitle v-if="menu.description" class="text-caption text-medium-emphasis">
                {{ menu.description }}
              </VListItemSubtitle>
            </VListItem>
          </template>

          <!-- 匹配的插件 -->
          <template v-if="userStore.superUser && matchedPluginItems.length > 0">
            <VDivider class="mx-4 my-1.5 search-divider" />
            <VListSubheader class="font-weight-medium text-uppercase px-4 search-subheader">
              {{ t('dialog.searchBar.plugins') }}
            </VListSubheader>
            <VListItem
              v-for="plugin in matchedPluginItems"
              :key="plugin.id"
              density="compact"
              link
              @click="showPlugin(plugin.id ?? '')"
              class="search-result-item mx-2"
            >
              <template #prepend>
                <div class="result-icon-wrapper">
                  <VIcon icon="mdi-puzzle" size="16" color="medium-emphasis" />
                </div>
              </template>
              <VListItemTitle class="font-weight-medium text-body-2">
                {{ plugin.plugin_name }}
              </VListItemTitle>
              <VListItemSubtitle class="text-caption text-medium-emphasis">
                {{ plugin.plugin_desc }}
              </VListItemSubtitle>
            </VListItem>
          </template>

          <!-- 站点资源搜索 -->
          <template v-if="userStore.superUser">
            <VDivider class="mx-4 my-1.5 search-divider" />
            <VListSubheader class="font-weight-medium text-uppercase px-4 search-subheader">
              {{ t('dialog.searchBar.siteResources') }}
            </VListSubheader>

            <VListItem density="compact" link @click="searchTorrent" class="search-result-item mx-2">
              <template #prepend>
                <div class="result-icon-wrapper">
                  <VIcon icon="mdi-file-search" size="16" color="medium-emphasis" />
                </div>
              </template>
              <VListItemTitle class="font-weight-medium text-body-2">{{
                t('dialog.searchBar.searchInSites')
              }}</VListItemTitle>
              <VListItemSubtitle class="text-caption text-medium-emphasis">
                {{ t('common.search') }} <span class="primary-text font-weight-medium">{{ searchWord }}</span>
                {{ t('dialog.searchBar.relatedResources') }}
              </VListItemSubtitle>
              <template #append>
                <VBtn size="x-small" variant="tonal" color="primary" rounded="pill" @click.stop="openSiteDialog()">
                  {{ t('dialog.searchBar.selectSites') }}
                </VBtn>
              </template>
            </VListItem>
          </template>
        </VList>

        <!-- 无搜索词时显示空状态 -->
        <div v-else class="search-empty-state">
          <!-- 有最近搜索 -->
          <div v-if="!searchWord && recentSearches.length > 0" class="recent-searches-section">
            <div class="text-body-2 font-weight-medium text-medium-emphasis mb-3">
              {{ t('dialog.searchBar.recentSearches') }}
            </div>
            <div class="d-flex flex-wrap gap-2">
              <VChip
                v-for="(word, index) in recentSearches"
                :key="index"
                variant="flat"
                color="primary"
                size="small"
                @click="searchWord = word"
              >
                <VIcon start size="x-small">mdi-history</VIcon>
                {{ word }}
              </VChip>
            </div>
          </div>

          <!-- 空状态提示 -->
          <div v-else class="empty-hint pt-3">
            <span class="text-body-1 text-medium-emphasis">{{ t('dialog.searchBar.emptySearchHint') }}</span>
          </div>
        </div>
      </div>

      <!-- 弹窗形态保留底部关闭按钮，桌面下拉不显示页脚。 -->
      <div v-if="!display.mdAndUp.value" class="search-footer-mobile">
        <VBtn icon variant="tonal" @click="closeSearch">
          <VIcon icon="mdi-close" size="20" />
        </VBtn>
      </div>
    </VCard>
  </component>

  <!-- 站点选择对话框 -->
  <SearchSiteDialog
    v-if="chooseSiteDialog"
    v-model="chooseSiteDialog"
    :sites="allSites"
    :selected="selectedSites"
    @search="searchSites"
    @close="chooseSiteDialog = false"
    @reload="queryAllSites"
  />
</template>

<style scoped>
/* stylelint-disable no-descending-specificity */

.search-dialog {
  display: flex;
  overflow: hidden;
  flex-direction: column;
}

.search-dialog--dropdown {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  inline-size: min(32rem, calc(100vw - 2rem));
  max-block-size: min(72vh, 42rem);
}

.search-desktop-activator {
  flex: 0 1 22rem;
  inline-size: clamp(15rem, 32vw, 22rem);
  max-inline-size: calc(100vw - 10rem);
}

.search-desktop-activator .search-input-wrapper {
  border: 1px solid var(--mp-border-card);
  border-radius: 8px;
  background: rgb(var(--v-theme-surface));
  block-size: 34px;
  padding-inline: 10px;
}

.search-desktop-activator .search-input-wrapper:hover {
  border-color: var(--mp-border-hover);
}

.search-desktop-activator .search-input-wrapper:focus-within {
  border-color: rgb(var(--v-theme-primary));
}

.search-desktop-activator .search-native-input {
  font-size: 13.5px;
}

.search-icon-trigger {
  flex: 0 0 auto;
}

.search-icon-trigger__icon {
  transform: scaleX(-1);
}

/* 搜索头部区域 */
.search-header {
  border-block-end: 1px solid var(--mp-border-subtle);
  padding-block: 10px;
  padding-inline: 12px;
}

/* 搜索输入框容器 */
.search-input-wrapper {
  display: flex;
  align-items: center;
  border: 1px solid var(--mp-border-card);
  border-radius: var(--app-field-radius);
  background-color: var(--mp-field-bg);
  block-size: 38px;
  padding-inline: 12px 6px;
  transition:
    border-color 0.2s ease,
    border-radius 0.2s ease,
    box-shadow 0.2s ease;
}

.search-input-wrapper:focus-within {
  border-color: rgb(var(--v-theme-primary));
}

.search-input-icon {
  flex-shrink: 0;
  color: rgba(var(--v-theme-on-surface), 0.45);
  margin-inline-end: 8px;
}

.search-native-input {
  flex: 1;
  border: none;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.87);
  font-size: 14px;
  line-height: 1.4;
  min-inline-size: 0;
  outline: none;
  appearance: none;
  -webkit-appearance: none;
}

.search-native-input::-webkit-search-cancel-button {
  display: none;
}
.search-native-input::placeholder {
  color: rgba(var(--v-theme-on-surface), 0.38);
}

.search-submit-btn {
  flex-shrink: 0;
  border-radius: 6px !important;
  background-color: rgba(var(--v-theme-on-surface), 0.06) !important;
  block-size: 28px !important;
  color: rgba(var(--v-theme-on-surface), 0.65) !important;
  inline-size: 28px !important;
  transition: background-color 0.2s ease;
}

.search-submit-btn:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.12) !important;
}

.search-shortcut-badge {
  flex-shrink: 0;
  margin-inline-start: 10px;
  white-space: nowrap;
}

/* 主内容区域 */
.search-content {
  max-block-size: 600px;
  min-block-size: 150px;
  overflow-y: auto;
  overscroll-behavior-y: contain;
}

.search-dialog--dropdown .search-content {
  max-block-size: min(58vh, 34rem);
}

.search-list {
  background: transparent !important;
}

.search-subheader {
  font-size: 0.72rem;
  min-block-size: 28px;
}

.search-item-source-row {
  display: inline-flex;
  align-items: center;
  margin-inline-start: 8px;
  min-inline-size: 0;
}

.search-item-source-toggle {
  display: inline-flex;
  align-items: center;
  padding: 2px;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 7px;
  background: var(--mp-tab-groove-bg);
  block-size: 24px;
  gap: 1px;
}

.media-source-button {
  border-radius: 5px !important;
  block-size: 20px !important;
  color: rgba(var(--v-theme-on-surface), 0.65) !important;
  font-size: 0.6875rem;
  font-weight: 500;
  letter-spacing: 0;
  min-block-size: 20px !important;
  min-inline-size: 0 !important;
  padding-inline: 6px !important;
  text-transform: none;
  white-space: nowrap;
}

.media-source-button:hover {
  background: rgba(var(--v-theme-on-surface), 0.05) !important;
  color: rgba(var(--v-theme-on-surface), 0.9) !important;
}

.media-source-button--active {
  background: var(--mp-tab-active-bg) !important;
  box-shadow: var(--mp-tab-active-shadow);
  color: rgb(var(--v-theme-primary)) !important;
  font-weight: 600;
}

.search-result-item {
  border-radius: 8px !important;
  margin-block: 1px;
  min-block-size: 44px !important;
  padding-block: 5px !important;
  padding-inline: 10px !important;
  transition: background-color 0.15s ease;
}

.search-result-item:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.04);
}

.result-icon-wrapper {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  background-color: rgba(var(--v-theme-on-surface), 0.05);
  block-size: 28px;
  inline-size: 28px;
  margin-inline-end: 10px;
}

.search-divider {
  opacity: 0.08;
}

.primary-text {
  color: rgb(var(--v-theme-primary));
}

/* 空状态 */
.search-empty-state {
  display: flex;
  align-items: start;
  justify-content: center;
  min-block-size: 150px;
  padding-block: 0;
  padding-inline: 1.5rem;
}

.recent-searches-section {
  inline-size: 100%;
  padding-block-start: 1rem;
}

.empty-hint {
  text-align: center;
}

kbd {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.15);
  border-radius: 5px;
  background-color: rgba(var(--v-theme-on-surface), 0.04);
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  padding-block: 3px;
  padding-inline: 6px;
}

/* 移动端底部关闭图标 */
.search-footer-mobile {
  display: flex;
  justify-content: center;
  margin-block-start: auto;
  padding-block: 12px;
  padding-block-end: calc(12px + env(safe-area-inset-bottom));
}

/* 响应式 */
@media (width <= 600px) {
  .search-header {
    padding-block: 10px;
    padding-inline: 12px;
  }

  .search-input-wrapper {
    block-size: 36px;
    padding-inline: 10px 4px;
  }

  .search-native-input {
    font-size: 14px;
  }
}
</style>
