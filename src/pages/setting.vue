<script lang="ts" setup>
import { useRoute } from 'vue-router'
import router from '@/router'
import { getSettingTabs } from '@/router/i18n-menu'
import { useDynamicHeaderTab } from '@/composables/useDynamicHeaderTab'
import { useShortcutTools } from '@/composables/useShortcutTools'
import {
  readThemeCustomizerSettings,
  THEME_CUSTOMIZER_CHANGE_EVENT,
  type ThemeCustomizerSettings,
} from '@/composables/useThemeCustomizer'
import { nativeChromeActive } from '@/native/layout'

const { t } = useI18n()
const route = useRoute()
const { visibleShortcuts, openShortcutDialog } = useShortcutTools()

// 按标签页懒加载子视图，避免初次进入设定页时下载全部面板体积
const AccountSettingSystem = defineAsyncComponent(() => import('@/views/setting/AccountSettingSystem.vue'))
const AccountSettingDirectory = defineAsyncComponent(() => import('@/views/setting/AccountSettingDirectory.vue'))
const AccountSettingSite = defineAsyncComponent(() => import('@/views/setting/AccountSettingSite.vue'))
const AccountSettingRule = defineAsyncComponent(() => import('@/views/setting/AccountSettingRule.vue'))
const AccountSettingSearch = defineAsyncComponent(() => import('@/views/setting/AccountSettingSearch.vue'))
const AccountSettingSubscribe = defineAsyncComponent(() => import('@/views/setting/AccountSettingSubscribe.vue'))
const AccountSettingNotification = defineAsyncComponent(() => import('@/views/setting/AccountSettingNotification.vue'))

interface SettingSectionAnchor {
  id: string
  label: string
  icon: string
  advancedTab?: string
  keywords: string[]
}

interface SettingNavItem {
  tab: string
  group: 'foundation' | 'automation' | 'delivery'
  title: string
  shortHint: string
  description: string
  icon: string
  accent: 'primary' | 'info' | 'success' | 'warning'
  sections: SettingSectionAnchor[]
}

interface QuickJumpResult {
  key: string
  badge: string
  title: string
  subtitle: string
  icon: string
  action: () => void
}

const VALID_TABS = new Set(['system', 'directory', 'site', 'rule', 'search', 'subscribe', 'notification'])

const initialQueryTab = typeof route.query.tab === 'string' && VALID_TABS.has(route.query.tab) ? route.query.tab : ''
const activeTab = ref(initialQueryTab || 'system')
const visitedTabs = ref(new Set<string>([activeTab.value]))
const searchQuery = ref('')
const searchFocused = ref(false)
const themeLayout = ref(readThemeCustomizerSettings().layout)

const systemViewRef = ref<{ openAdvancedTab?: (tab?: string) => void } | null>(null)

function handleThemeLayoutChange(event: Event) {
  themeLayout.value = (event as CustomEvent<ThemeCustomizerSettings>).detail.layout
}

// 仅在水平顶部导航或原生 App 外壳模式下向顶栏暴露动态标签，桌面垂直模式下由左侧设定工作台统一承载
const settingTabs = computed(() => getSettingTabs(t))
const headerTabItems = computed(() =>
  themeLayout.value === 'horizontal' || nativeChromeActive.value ? settingTabs.value : [],
)
const { registerHeaderTab } = useDynamicHeaderTab()
registerHeaderTab({
  items: headerTabItems,
  modelValue: activeTab,
})

const settingNavItems = computed<SettingNavItem[]>(() => [
  {
    tab: 'system',
    group: 'foundation',
    title: t('settingTabs.system.title'),
    shortHint: '域名令牌 · 代理/TMDB · 下载与媒体服',
    description: '管理访问域名与 API 令牌、TMDB 元数据与网络代理、下载客户端及媒体库服务器连接。',
    icon: 'mdi-server-network',
    accent: 'primary',
    sections: [
      {
        id: 'sec-system-basic',
        label: '基础设置',
        icon: 'mdi-shield-key-outline',
        keywords: ['域名', 'app_domain', 'api', 'token', '令牌', 'github'],
      },
      {
        id: 'sec-system-advanced',
        label: '高级参数与网络',
        icon: 'mdi-tune-vertical',
        keywords: ['高级设置', '代理', 'proxy', 'tmdb', 'doh', '日志', '缓存', '清理', '刮削开关', 'rust'],
      },
      {
        id: 'sec-system-downloaders',
        label: '下载器',
        icon: 'mdi-download-network-outline',
        keywords: ['下载器', 'qbittorrent', 'transmission', 'tr', 'qb'],
      },
      {
        id: 'sec-system-mediaservers',
        label: '媒体服务器',
        icon: 'mdi-television-play',
        keywords: ['媒体服务器', 'emby', 'jellyfin', 'plex', '飞牛', '极影视', '绿联'],
      },
    ],
  },
  {
    tab: 'directory',
    group: 'foundation',
    title: t('settingTabs.directory.title'),
    shortHint: '存储源 · 目录映射 · 分类与重命名',
    description: '管理本地磁盘与网盘存储源、下载目录到媒体库目录的整理映射、二级分类策略与重命名模板。',
    icon: 'mdi-folder-multiple-outline',
    accent: 'info',
    sections: [
      {
        id: 'sec-dir-storage',
        label: '存储源',
        icon: 'mdi-harddisk',
        keywords: ['存储', '115', '阿里云盘', 'alist', 'openlist', 'rclone', 'smb', '本地盘'],
      },
      {
        id: 'sec-dir-library',
        label: '目录与分类策略',
        icon: 'mdi-folder-cog-outline',
        keywords: ['目录', '下载目录', '媒体库目录', '二级分类', '自动分类', '硬链接', '整理方式'],
      },
      {
        id: 'sec-dir-organize',
        label: '刮削与重命名模板',
        icon: 'mdi-file-tree-outline',
        keywords: ['重命名', '命名格式', 'jinja', '刮削数据源', '空目录'],
      },
    ],
  },
  {
    tab: 'site',
    group: 'automation',
    title: t('settingTabs.site.title'),
    shortHint: 'CookieCloud · 防盾仿真 · 数据重置',
    description: '配置 CookieCloud 账号自动同步、站点数据定时刷新、FlareSolverr 仿真防盾及站点重置。',
    icon: 'mdi-web',
    accent: 'primary',
    sections: [
      {
        id: 'sec-site-sync',
        label: 'CookieCloud 同步',
        icon: 'mdi-cloud-sync-outline',
        keywords: ['cookiecloud', 'cookie', '站点同步', '端对端加密', '黑名单'],
      },
      {
        id: 'sec-site-options',
        label: '访问与防盾策略',
        icon: 'mdi-earth',
        keywords: ['flaresolverr', '浏览器仿真', 'ocr', '验证码', '站内信', '哨兵', '刷新间隔'],
      },
      {
        id: 'sec-site-danger',
        label: '重置站点数据',
        icon: 'mdi-alert-octagon-outline',
        keywords: ['重置站点', '清空站点', '删除站点'],
      },
    ],
  },
  {
    tab: 'rule',
    group: 'automation',
    title: t('settingTabs.rule.title'),
    shortHint: '自定义规则 · 规则组 · 选种优先级',
    description: '编排正则过滤规则与体积条件、组合多套优先级规则组，并定义多资源命中时的选种排序策略。',
    icon: 'mdi-tune-variant',
    accent: 'warning',
    sections: [
      {
        id: 'sec-rule-custom',
        label: '自定义规则',
        icon: 'mdi-tune-variant',
        keywords: ['自定义规则', '正则', '包含', '排除', '促销', 'free', '特效', '杜比'],
      },
      {
        id: 'sec-rule-groups',
        label: '优先级规则组',
        icon: 'mdi-layers-triple-outline',
        keywords: ['规则组', '优先级规则组', '4k', '导入规则', '分享规则'],
      },
      {
        id: 'sec-rule-priority',
        label: '下载优先规则',
        icon: 'mdi-sort-ascending',
        keywords: ['做种数', '站点优先级', '资源优先级', '选种'],
      },
    ],
  },
  {
    tab: 'search',
    group: 'automation',
    title: t('settingTabs.search.title'),
    shortHint: '搜索数据源 · 搜索过滤 · 索引站点',
    description: '设定影视元数据搜索源（TMDB / 豆瓣 / Bangumi）、搜索过滤规则组、任务标签与默认勾选站点。',
    icon: 'mdi-magnify',
    accent: 'info',
    sections: [
      {
        id: 'sec-search-basic',
        label: '搜索基础参数',
        icon: 'mdi-magnify-expand',
        keywords: ['搜索数据源', '豆瓣', 'bangumi', '下载标签', '页数', '下载字幕', '多名称搜索'],
      },
      {
        id: 'sec-search-sites',
        label: '默认搜索站点',
        icon: 'mdi-radar',
        keywords: ['搜索站点', '索引站点', 'indexersites'],
      },
    ],
  },
  {
    tab: 'subscribe',
    group: 'automation',
    title: t('settingTabs.subscribe.title'),
    shortHint: 'RSS 周期 · 洗版规则 · 分类自动填充',
    description: '管理订阅运行模式、RSS 轮询周期、默认洗版规则组、参与订阅站点与二级分类自动填充策略。',
    icon: 'mdi-rss',
    accent: 'success',
    sections: [
      {
        id: 'sec-sub-basic',
        label: '订阅与洗版策略',
        icon: 'mdi-rss-box',
        keywords: ['订阅模式', 'rss', '洗版', '定时搜索', '本地媒体库检查'],
      },
      {
        id: 'sec-sub-sites',
        label: 'RSS 订阅站点',
        icon: 'mdi-access-point-network',
        keywords: ['订阅站点', 'rss站点'],
      },
      {
        id: 'sec-sub-autofill',
        label: '分类自动填充',
        icon: 'mdi-auto-fix',
        keywords: ['自动填充', '二级分类订阅', '下载回填', '保存路径'],
      },
    ],
  },
  {
    tab: 'notification',
    group: 'delivery',
    title: t('settingTabs.notification.title'),
    shortHint: '推送渠道 · 消息模板 · 范围与时段',
    description: '接入企业微信、Telegram、App 推送渠道，定制 Jinja2 消息模板，并控制场景接收范围与静默窗口。',
    icon: 'mdi-bell-outline',
    accent: 'warning',
    sections: [
      {
        id: 'sec-notify-channels',
        label: '通知渠道',
        icon: 'mdi-send-circle-outline',
        keywords: ['telegram', 'tg', '企业微信', 'wechat', 'app推送', '通知渠道', 'bot'],
      },
      {
        id: 'sec-notify-templates',
        label: '消息模板',
        icon: 'mdi-code-braces-box',
        keywords: ['消息模板', 'jinja2', '文案格式'],
      },
      {
        id: 'sec-notify-scope',
        label: '通知发送范围',
        icon: 'mdi-account-group-outline',
        keywords: ['发送范围', '仅管理员', '所有用户', '整理入库通知'],
      },
      {
        id: 'sec-notify-time',
        label: '发送时间段',
        icon: 'mdi-clock-check-outline',
        keywords: ['时间段', '免打扰', '静默时段'],
      },
    ],
  },
])

const navGroups = computed(() => [
  {
    key: 'foundation',
    label: '基础与存储',
    items: settingNavItems.value.filter(item => item.group === 'foundation'),
  },
  {
    key: 'automation',
    label: '站点与自动化',
    items: settingNavItems.value.filter(item => item.group === 'automation'),
  },
  {
    key: 'delivery',
    label: '消息与触达',
    items: settingNavItems.value.filter(item => item.group === 'delivery'),
  },
])

const currentNavItem = computed(
  () => settingNavItems.value.find(item => item.tab === activeTab.value) ?? settingNavItems.value[0],
)

// 高级系统设置子面板直达索引（供顶部搜索一键唤起弹窗对应页签）
const advancedDeepEntries = [
  {
    key: 'adv-system',
    advancedTab: 'system',
    title: '高级设置 · 运行与更新',
    subtitle: '全局图片缓存、大内存模式、SQLite WAL、自动更新与统计共享',
    icon: 'mdi-tune-vertical',
    keywords: ['全局图片缓存', '大内存', 'sqlite', 'wal', '自动更新', '统计共享'],
  },
  {
    key: 'adv-media',
    advancedTab: 'media',
    title: '高级设置 · 媒体与 TMDB',
    subtitle: 'TMDB API 域名/Key、元数据语言、Fanart 与 NFO/图片刮削策略',
    icon: 'mdi-movie-open-outline',
    keywords: ['tmdb', 'api key', '图片域名', 'fanart', 'nfo', '刮削开关', '元数据缓存'],
  },
  {
    key: 'adv-network',
    advancedTab: 'network',
    title: '高级设置 · 网络与代理',
    subtitle: 'HTTP/SOCKS 网络代理、GitHub / PIP 加速镜像、DoH 与安全图片域名',
    icon: 'mdi-lan',
    keywords: ['代理', 'proxy', 'github代理', '镜像', 'pip', 'doh', 'dns', '安全图片域名'],
  },
  {
    key: 'adv-data',
    advancedTab: 'data',
    title: '高级设置 · 自动数据清理',
    subtitle: '历史通知消息、下载记录、站点数据与整理记录保留天数',
    icon: 'mdi-database-outline',
    keywords: ['数据清理', '保留天数', '历史清理', '自动清理'],
  },
  {
    key: 'adv-log',
    advancedTab: 'log',
    title: '高级设置 · 日志与调试',
    subtitle: 'DEBUG 调试模式、日志级别、单文件大小上限与轮转备份数',
    icon: 'mdi-file-document-outline',
    keywords: ['debug', '调试模式', '日志级别', '日志文件', '轮转'],
  },
  {
    key: 'adv-dev',
    advancedTab: 'dev',
    title: '高级设置 · 实验室与性能',
    subtitle: 'Rust 原生加速、整理并发线程数、插件自动重载与本地插件仓库',
    icon: 'mdi-flask-outline',
    keywords: ['实验室', 'rust', '并发', '整理线程', '插件热重载', '本地仓库'],
  },
]

// 侧栏底部高频运维工具直达列表
const quickUtilityItems = computed(() => {
  const pickTool = (dialogId: string) => visibleShortcuts.value.find(item => item.dialog === dialogId)
  const list: Array<{ key: string; title: string; subtitle: string; icon: string; invoke: () => void }> = [
    {
      key: 'setup-wizard',
      title: '配置向导',
      subtitle: '分步引导检查核心服务配置',
      icon: 'mdi-wizard-hat',
      invoke: () => {
        router.push('/setup')
      },
    },
  ]

  const toolDefs = [
    { id: 'words', fallbackTitle: '识别词与屏蔽词', fallbackSub: '自定义集数偏移与替换词表' },
    { id: 'scheduler', fallbackTitle: '定时服务', fallbackSub: '查看或手动触发后台定时任务' },
    { id: 'cache', fallbackTitle: '缓存管理', fallbackSub: '查看并清理识别与图片缓存' },
    { id: 'systemTest', fallbackTitle: '系统健康检查', fallbackSub: '逐项检测核心模块运行状态' },
  ]

  for (const def of toolDefs) {
    const found = pickTool(def.id)
    if (found) {
      list.push({
        key: def.id,
        title: found.title || def.fallbackTitle,
        subtitle: def.fallbackSub,
        icon: found.icon,
        invoke: () => openShortcutDialog(found),
      })
    }
  }
  return list
})

const quickJumpResults = computed<QuickJumpResult[]>(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return []

  const results: QuickJumpResult[] = []

  // 1. 匹配 7 大分类及页内子板块锚点
  for (const nav of settingNavItems.value) {
    for (const sec of nav.sections) {
      const haystack = [nav.title, sec.label, ...sec.keywords].join(' ').toLowerCase()
      if (haystack.includes(q)) {
        results.push({
          key: `${nav.tab}-${sec.id}`,
          badge: nav.title,
          title: sec.label,
          subtitle: nav.shortHint,
          icon: sec.icon,
          action: () => jumpToSection(nav.tab, sec.id),
        })
      }
    }
  }

  // 2. 匹配高级设置 6 大子面板（一键开窗直达）
  for (const adv of advancedDeepEntries) {
    const haystack = [adv.title, adv.subtitle, ...adv.keywords].join(' ').toLowerCase()
    if (haystack.includes(q)) {
      results.push({
        key: adv.key,
        badge: '高级系统面板',
        title: adv.title,
        subtitle: adv.subtitle,
        icon: adv.icon,
        action: () => jumpToAdvancedTab(adv.advancedTab),
      })
    }
  }

  // 3. 匹配运维工具与向导
  for (const tool of quickUtilityItems.value) {
    const haystack = `${tool.title} ${tool.subtitle}`.toLowerCase()
    if (haystack.includes(q)) {
      results.push({
        key: `tool-${tool.key}`,
        badge: '运维工具',
        title: tool.title,
        subtitle: tool.subtitle,
        icon: tool.icon,
        action: () => {
          searchQuery.value = ''
          searchFocused.value = false
          tool.invoke()
        },
      })
    }
  }

  return results.slice(0, 8)
})

function markTabVisited(tab: string) {
  if (!tab) return
  if (visitedTabs.value.has(tab)) return
  const nextTabs = new Set(visitedTabs.value)
  nextTabs.add(tab)
  visitedTabs.value = nextTabs
}

function selectTab(tab: string) {
  if (!VALID_TABS.has(tab)) return
  activeTab.value = tab
  markTabVisited(tab)
  if (route.path === '/setting' && route.query.tab !== tab) {
    router.replace({ path: '/setting', query: { ...route.query, tab } })
  }
}

async function scrollAndPulseElement(elementId: string) {
  await nextTick()
  // 留出一帧等待异步子组件完成首次挂载
  await new Promise(resolve => setTimeout(resolve, 60))
  const target = document.getElementById(elementId)
  if (!target) return
  target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  target.classList.remove('mp-setting-card--pulse')
  void target.offsetWidth
  target.classList.add('mp-setting-card--pulse')
  setTimeout(() => {
    target.classList.remove('mp-setting-card--pulse')
  }, 1400)
}

async function jumpToSection(tab: string, sectionId: string) {
  searchQuery.value = ''
  searchFocused.value = false
  selectTab(tab)
  await scrollAndPulseElement(sectionId)
}

async function jumpToAdvancedTab(advancedTab: string) {
  searchQuery.value = ''
  searchFocused.value = false
  selectTab('system')
  await nextTick()
  for (let attempt = 0; attempt < 10; attempt++) {
    if (systemViewRef.value?.openAdvancedTab) {
      systemViewRef.value.openAdvancedTab(advancedTab)
      return
    }
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}

function handleSearchEnter() {
  if (quickJumpResults.value.length > 0) {
    quickJumpResults.value[0].action()
  }
}

function handleSearchBlur() {
  setTimeout(() => {
    searchFocused.value = false
  }, 160)
}

watch(
  () => route.query.tab,
  queryTab => {
    if (typeof queryTab === 'string' && VALID_TABS.has(queryTab) && queryTab !== activeTab.value) {
      activeTab.value = queryTab
      markTabVisited(queryTab)
    }
  },
)

watch(activeTab, tab => {
  markTabVisited(tab)
})

onMounted(() => {
  window.addEventListener(THEME_CUSTOMIZER_CHANGE_EVENT, handleThemeLayoutChange)
  if (!activeTab.value || !VALID_TABS.has(activeTab.value)) {
    activeTab.value = 'system'
  }
  markTabVisited(activeTab.value)
})

onUnmounted(() => {
  window.removeEventListener(THEME_CUSTOMIZER_CHANGE_EVENT, handleThemeLayoutChange)
})
</script>

<template>
  <div class="settings-workbench">
    <!-- 左侧常驻设定导航台（桌面端 >= 1080px 常驻粘性导航，窄屏自动折叠为紧凑顶栏） -->
    <aside class="settings-sidebar" aria-label="系统设定分类导航">
      <!-- 全局配置项即时检索跳板 -->
      <div class="settings-search-box">
        <div class="settings-search-input-wrap">
          <VIcon icon="mdi-magnify" size="16" class="settings-search-icon" />
          <input
            v-model="searchQuery"
            type="search"
            class="settings-search-input"
            placeholder="搜索设置项..."
            aria-label="快速查找设置项"
            @focus="searchFocused = true"
            @blur="handleSearchBlur"
            @keydown.enter.prevent="handleSearchEnter"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="settings-search-clear"
            aria-label="清空搜索"
            @mousedown.prevent="searchQuery = ''"
          >
            <VIcon icon="mdi-close-circle" size="14" />
          </button>
        </div>

        <!-- 搜索结果即时跳板浮层 -->
        <div v-if="searchQuery.trim() && searchFocused" class="settings-search-dropdown" role="listbox">
          <template v-if="quickJumpResults.length > 0">
            <button
              v-for="res in quickJumpResults"
              :key="res.key"
              type="button"
              class="settings-search-item"
              @mousedown.prevent="res.action()"
            >
              <span class="settings-search-item__icon">
                <VIcon :icon="res.icon" size="16" />
              </span>
              <span class="settings-search-item__body">
                <span class="settings-search-item__top">
                  <span class="settings-search-item__title">{{ res.title }}</span>
                  <span class="settings-search-item__badge">{{ res.badge }}</span>
                </span>
                <span class="settings-search-item__sub">{{ res.subtitle }}</span>
              </span>
            </button>
          </template>
          <div v-else class="settings-search-empty">未找到匹配的设置模块</div>
        </div>
      </div>

      <!-- 桌面端分组垂直导航 -->
      <nav class="settings-nav-groups" aria-label="设置域列表">
        <div v-for="group in navGroups" :key="group.key" class="settings-nav-group">
          <div class="settings-nav-group__label">{{ group.label }}</div>
          <button
            v-for="item in group.items"
            :key="item.tab"
            type="button"
            class="settings-nav-item"
            :class="{ 'is-active': activeTab === item.tab }"
            :title="item.shortHint"
            :aria-current="activeTab === item.tab ? 'page' : undefined"
            @click="selectTab(item.tab)"
          >
            <span class="settings-nav-item__icon" :class="`settings-nav-item__icon--${item.accent}`">
              <VIcon :icon="item.icon" size="16" />
            </span>
            <span class="settings-nav-item__title">{{ item.title }}</span>
          </button>
        </div>
      </nav>

      <!-- 窄屏横向分类胶囊栏（< 1080px 显示） -->
      <div class="settings-mobile-tabs" role="tablist" aria-label="设置分类">
        <button
          v-for="item in settingNavItems"
          :key="item.tab"
          type="button"
          role="tab"
          :aria-selected="activeTab === item.tab"
          class="settings-mobile-tab"
          :class="{ 'is-active': activeTab === item.tab }"
          @click="selectTab(item.tab)"
        >
          <VIcon :icon="item.icon" size="15" />
          <span>{{ item.title }}</span>
        </button>
      </div>

      <!-- 侧栏底部：运维工具与配置向导直达区 -->
      <div class="settings-tools-card">
        <div class="settings-tools-card__head">
          <span>运维工具与向导</span>
        </div>
        <div class="settings-tools-list">
          <button
            v-for="tool in quickUtilityItems"
            :key="tool.key"
            type="button"
            class="settings-tool-link"
            :title="tool.subtitle"
            @click="tool.invoke()"
          >
            <VIcon :icon="tool.icon" size="15" class="settings-tool-link__icon" />
            <span class="settings-tool-link__title">{{ tool.title }}</span>
            <VIcon icon="mdi-arrow-top-right" size="13" class="settings-tool-link__ext" />
          </button>
        </div>
      </div>
    </aside>

    <!-- 右侧主配置舞台 -->
    <div class="settings-main">
      <!-- 当前分类导览头 + 页内模块锚点胶囊 -->
      <header class="settings-stage-banner">
        <div class="settings-stage-banner__lead">
          <div class="settings-stage-banner__icon" :class="`settings-nav-item__icon--${currentNavItem.accent}`">
            <VIcon :icon="currentNavItem.icon" size="20" />
          </div>
          <div class="settings-stage-banner__copy">
            <h1 class="settings-stage-banner__title">{{ currentNavItem.title }}</h1>
            <p class="settings-stage-banner__desc">{{ currentNavItem.description }}</p>
          </div>
        </div>

        <div class="settings-stage-banner__anchors" role="navigation" aria-label="本页模块快速跳转">
          <button
            v-for="sec in currentNavItem.sections"
            :key="sec.id"
            type="button"
            class="settings-anchor-pill"
            @click="scrollAndPulseElement(sec.id)"
          >
            <VIcon :icon="sec.icon" size="13" class="settings-anchor-pill__icon" />
            <span>{{ sec.label }}</span>
          </button>
        </div>
      </header>

      <!-- 按需懒挂载的 7 大设置面板 -->
      <VWindow v-model="activeTab" class="settings-content-window disable-tab-transition" :touch="false">
        <VWindowItem value="system">
          <AccountSettingSystem v-if="visitedTabs.has('system')" ref="systemViewRef" :active="activeTab === 'system'" />
        </VWindowItem>
        <VWindowItem value="directory">
          <AccountSettingDirectory v-if="visitedTabs.has('directory')" :active="activeTab === 'directory'" />
        </VWindowItem>
        <VWindowItem value="site">
          <AccountSettingSite v-if="visitedTabs.has('site')" :active="activeTab === 'site'" />
        </VWindowItem>
        <VWindowItem value="rule">
          <AccountSettingRule v-if="visitedTabs.has('rule')" :active="activeTab === 'rule'" />
        </VWindowItem>
        <VWindowItem value="search">
          <AccountSettingSearch v-if="visitedTabs.has('search')" :active="activeTab === 'search'" />
        </VWindowItem>
        <VWindowItem value="subscribe">
          <AccountSettingSubscribe v-if="visitedTabs.has('subscribe')" :active="activeTab === 'subscribe'" />
        </VWindowItem>
        <VWindowItem value="notification">
          <AccountSettingNotification v-if="visitedTabs.has('notification')" :active="activeTab === 'notification'" />
        </VWindowItem>
      </VWindow>
    </div>
  </div>
</template>

<style scoped lang="scss">
.settings-workbench {
  display: flex;
  flex-direction: column;
  gap: 16px;
  inline-size: 100%;
  min-inline-size: 0;
}

@media (width >= 1080px) {
  .settings-workbench {
    display: grid;
    align-items: start;
    gap: 18px;
    grid-template-columns: 204px minmax(0, 1fr);
  }
}

/* ===== 左侧常驻导航栏 ===== */
.settings-sidebar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-inline-size: 0;
}

@media (width >= 1080px) {
  .settings-sidebar {
    position: sticky;
    inset-block-start: 78px;
  }
}

/* 搜索跳板框 */
.settings-search-box {
  position: relative;
  z-index: 20;
}

.settings-search-input-wrap {
  display: flex;
  align-items: center;
  padding: 0 10px;
  border: 1px solid var(--mp-border-card);
  border-radius: 9px;
  background: rgb(var(--v-theme-surface));
  block-size: 36px;
  gap: 7px;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;

  &:focus-within {
    border-color: rgb(var(--v-theme-primary));
    box-shadow: 0 0 0 2px rgba(var(--v-theme-primary), 0.14);
  }
}

.settings-search-icon {
  flex-shrink: 0;
  color: rgba(var(--v-theme-on-surface), 0.45);
}

.settings-search-input {
  flex: 1 1 auto;
  padding: 0;
  border: 0;
  background: transparent;
  color: rgb(var(--v-theme-on-surface));
  font-size: 12.5px;
  line-height: 1.4;
  min-inline-size: 0;
  outline: none;

  &::placeholder {
    color: rgba(var(--v-theme-on-surface), 0.42);
  }

  &::-webkit-search-cancel-button {
    display: none;
  }
}

.settings-search-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.45);
  cursor: pointer;

  &:hover {
    color: rgb(var(--v-theme-on-surface));
  }
}

.settings-search-dropdown {
  position: absolute;
  inset-block-start: calc(100% + 6px);
  inset-inline: 0;
  overflow: hidden;
  padding: 5px;
  border: 1px solid var(--mp-border-hover);
  border-radius: 10px;
  background: rgb(var(--v-theme-surface));
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.28);
  min-inline-size: min(340px, 90vw);
}

.settings-search-item {
  display: flex;
  align-items: flex-start;
  padding: 8px 9px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: rgb(var(--v-theme-on-surface));
  cursor: pointer;
  gap: 9px;
  inline-size: 100%;
  text-align: start;
  transition: background-color 0.14s ease;

  &:hover {
    background: var(--mp-item-active-bg, rgba(var(--v-theme-primary), 0.08));
  }
}

.settings-search-item__icon {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: rgba(var(--v-theme-primary), 0.1);
  block-size: 26px;
  color: rgb(var(--v-theme-primary));
  inline-size: 26px;
  margin-block-start: 1px;
}

.settings-search-item__body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
  min-inline-size: 0;
}

.settings-search-item__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.settings-search-item__title {
  color: rgb(var(--v-theme-on-surface));
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.3;
}

.settings-search-item__badge {
  flex-shrink: 0;
  border-radius: 4px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 10.5px;
  font-weight: 500;
  line-height: 1.2;
  padding-block: 1.5px;
  padding-inline: 5px;
}

.settings-search-item__sub {
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.54);
  font-size: 11px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-search-empty {
  padding: 14px 10px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 12px;
  text-align: center;
}

/* 桌面端分组导航面板 */
.settings-nav-groups {
  display: none;
  flex-direction: column;
  padding: 10px 8px;
  border: 1px solid var(--mp-border-card);
  border-radius: 12px;
  background: rgb(var(--v-theme-surface));
  gap: 10px;
}

@media (width >= 1080px) {
  .settings-nav-groups {
    display: flex;
  }
}

.settings-nav-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.settings-nav-group + .settings-nav-group {
  border-block-start: 1px solid var(--mp-border-subtle);
  padding-block-start: 9px;
}

.settings-nav-group__label {
  padding: 0 8px 4px;
  color: rgba(var(--v-theme-on-surface), 0.44);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
}

.settings-nav-item {
  display: flex;
  align-items: center;
  padding: 5px 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  block-size: 34px;
  cursor: pointer;
  gap: 9px;
  inline-size: 100%;
  text-align: start;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;

  &:hover {
    background: var(--mp-item-bg);
  }

  &.is-active {
    border-color: rgba(var(--v-theme-primary), 0.22);
    background: rgba(var(--v-theme-primary), 0.09);

    .settings-nav-item__title {
      color: rgb(var(--v-theme-primary));
      font-weight: 600;
    }
  }
}

.settings-nav-item__icon {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  background: rgba(var(--v-theme-primary), 0.1);
  block-size: 25px;
  color: rgb(var(--v-theme-primary));
  inline-size: 25px;
}

.settings-nav-item__icon--info {
  background: rgba(var(--v-theme-info), 0.1);
  color: rgb(var(--v-theme-info));
}

.settings-nav-item__icon--success {
  background: rgba(var(--v-theme-success), 0.1);
  color: rgb(var(--v-theme-success));
}

.settings-nav-item__icon--warning {
  background: rgba(var(--v-theme-warning), 0.12);
  color: rgb(var(--v-theme-warning));
}

.settings-nav-item__title {
  flex: 1 1 auto;
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.9);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 移动端/平板顶部胶囊栏 */
.settings-mobile-tabs {
  display: flex;
  overflow-x: auto;
  gap: 6px;
  padding-block: 2px;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

@media (width >= 1080px) {
  .settings-mobile-tabs {
    display: none;
  }
}

.settings-mobile-tab {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  padding: 6px 11px;
  border: 1px solid var(--mp-border-card);
  border-radius: 8px;
  background: rgb(var(--v-theme-surface));
  color: rgba(var(--v-theme-on-surface), 0.76);
  cursor: pointer;
  font-size: 12.5px;
  font-weight: 500;
  gap: 6px;
  line-height: 1.25;
  white-space: nowrap;

  &.is-active {
    border-color: rgba(var(--v-theme-primary), 0.4);
    background: rgba(var(--v-theme-primary), 0.12);
    color: rgb(var(--v-theme-primary));
    font-weight: 600;
  }
}

/* 运维工具与向导直达区 */
.settings-tools-card {
  display: none;
  flex-direction: column;
  padding: 10px 8px;
  border: 1px solid var(--mp-border-card);
  border-radius: 12px;
  background: rgb(var(--v-theme-surface));
  gap: 4px;
}

@media (width >= 1080px) {
  .settings-tools-card {
    display: flex;
  }
}

.settings-tools-card__head {
  padding: 0 8px 4px;
  color: rgba(var(--v-theme-on-surface), 0.44);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
}

.settings-tools-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.settings-tool-link {
  display: flex;
  align-items: center;
  padding: 6px 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.78);
  cursor: pointer;
  font-size: 12.5px;
  font-weight: 500;
  gap: 8px;
  inline-size: 100%;
  text-align: start;
  transition:
    background-color 0.14s ease,
    color 0.14s ease;

  &:hover {
    background: var(--mp-item-bg);
    color: rgb(var(--v-theme-primary));

    .settings-tool-link__ext {
      opacity: 1;
      transform: translate(1px, -1px);
    }
  }
}

.settings-tool-link__icon {
  flex-shrink: 0;
  color: rgba(var(--v-theme-on-surface), 0.54);
}

.settings-tool-link__title {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-tool-link__ext {
  flex-shrink: 0;
  opacity: 0.42;
  transition:
    opacity 0.14s ease,
    transform 0.14s ease;
}

/* ===== 右侧主配置舞台 ===== */
.settings-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-inline-size: 0;
}

.settings-stage-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border: 1px solid var(--mp-border-card);
  border-radius: 12px;
  background:
    radial-gradient(120% 140% at 0% 0%, rgba(var(--v-theme-primary), 0.07), transparent 55%),
    rgb(var(--v-theme-surface));
  gap: 12px 16px;
}

.settings-stage-banner__lead {
  display: flex;
  align-items: center;
  gap: 12px;
  min-inline-size: 0;
}

.settings-stage-banner__icon {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  block-size: 38px;
  inline-size: 38px;
}

.settings-stage-banner__copy {
  min-inline-size: 0;
}

.settings-stage-banner__title {
  margin: 0;
  color: rgb(var(--v-theme-on-surface));
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.3;
}

.settings-stage-banner__desc {
  margin: 2px 0 0;
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 12px;
  line-height: 1.45;
}

.settings-stage-banner__anchors {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.settings-anchor-pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 7px;
  background: var(--mp-item-bg);
  color: rgba(var(--v-theme-on-surface), 0.78);
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  gap: 5px;
  line-height: 1.3;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease,
    color 0.15s ease;

  &:hover {
    border-color: rgba(var(--v-theme-primary), 0.4);
    background: rgba(var(--v-theme-primary), 0.08);
    color: rgb(var(--v-theme-primary));
  }
}

.settings-anchor-pill__icon {
  opacity: 0.78;
}

/* 锚点定位高亮微动画 */
:deep(.mp-setting-card--pulse) {
  animation: setting-card-pulse 1.2s ease-out;
}

@keyframes setting-card-pulse {
  0% {
    border-color: rgb(var(--v-theme-primary));
    box-shadow: 0 0 0 3px rgba(var(--v-theme-primary), 0.22);
  }

  100% {
    border-color: var(--mp-border-card);
    box-shadow: none;
  }
}

/* ===== 移动端（<= 600px）紧凑分层与防溢出适配 ===== */
@media (width <= 600px) {
  .settings-workbench {
    gap: 12px;
    padding-block-end: env(safe-area-inset-bottom, 0px);
  }

  .settings-sidebar {
    gap: 8px;
  }

  .settings-search-input-wrap {
    border-radius: 8px;
    block-size: 34px;
    padding-inline: 10px;
  }

  .settings-search-dropdown {
    inline-size: 100%;
    max-block-size: min(55vh, 320px);
    min-inline-size: 0;
    overflow-y: auto;
  }

  .settings-search-item__title,
  .settings-search-item__sub {
    overflow-wrap: anywhere;
    word-break: normal;
  }

  .settings-mobile-tabs {
    gap: 6px;
    scroll-padding-inline: 4px;
  }

  .settings-mobile-tab {
    padding: 5px 10px;
    border-radius: 7px;
    font-size: 12px;
    gap: 5px;
  }

  .settings-main {
    gap: 12px;
  }

  .settings-stage-banner {
    padding: 12px 14px;
    border-radius: 10px;
    gap: 10px;
  }

  .settings-stage-banner__lead {
    align-items: flex-start;
    gap: 10px;
  }

  .settings-stage-banner__icon {
    border-radius: 8px;
    block-size: 32px;
    inline-size: 32px;
  }

  .settings-stage-banner__title {
    font-size: 14.5px;
    font-weight: 600;
  }

  .settings-stage-banner__desc {
    font-size: 11.5px;
    overflow-wrap: anywhere;
    word-break: normal;
  }

  .settings-stage-banner__anchors {
    flex-wrap: nowrap;
    inline-size: 100%;
    overflow-x: auto;
    padding-block-end: 2px;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  .settings-anchor-pill {
    flex: 0 0 auto;
    padding: 4px 8px;
    border-radius: 7px;
    font-size: 11.5px;
    white-space: nowrap;
  }

  /* 统一子视图设定卡片在 375px 下的头部与操作栏布局，避免标题与右侧按钮互相挤压 */
  :deep(.mp-setting-card) {
    border-radius: 10px !important;

    > .v-card-item {
      grid-template-areas:
        'prepend content'
        'append append';
      grid-template-columns: max-content minmax(0, 1fr);
      row-gap: 10px;
      column-gap: 10px;
      padding-block: 11px !important;
      padding-inline: 12px !important;

      .v-card-item__content {
        min-inline-size: 0;
      }

      .v-card-item__append {
        grid-area: append;
        justify-self: stretch;
        padding-inline-start: 0 !important;

        > * {
          justify-content: flex-start !important;
        }
      }

      .v-card-title {
        font-size: 14px;
        gap: 6px;
        overflow-wrap: anywhere;
        word-break: normal;
      }

      .v-card-subtitle {
        font-size: 11.5px;
        overflow-wrap: anywhere;
        word-break: normal;
      }
    }

    > .v-card-text {
      padding-block: 12px !important;
      padding-inline: 12px !important;
    }

    .mp-setting-card__icon {
      border-radius: 8px;
      block-size: 30px;
      inline-size: 30px;
    }

    .mp-card-footer {
      flex-wrap: wrap;
      gap: 8px 10px;
      margin-block-start: 14px;
      padding-block-start: 12px;
    }

    .mp-card-footer__hint {
      flex: 1 1 100%;
      font-size: 11.5px;
      overflow-wrap: anywhere;
      word-break: normal;
    }
  }
}
</style>
