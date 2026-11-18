<script lang="ts" setup>
import { useI18n } from '@/composables/useChineseText'
import { useBackground } from '@/composables/useBackground'
import { useAvailableHeight } from '@/composables/useAvailableHeight'
import { useDisplay } from 'vuetify'

type LogEntry = {
  id: number
  raw: string
  level: string
  appName: string
  timestamp: string
  timestampMs: number | null
  secondKey: string
  secondDisplay: string
  timeDisplay: string
  displayLevel: string
  source: string
  message: string
  structured: boolean
}

type LogGroup = {
  id: string
  level: string
  secondKey: string
  secondDisplay: string
  items: LogEntry[]
  lastTimestampMs: number | null
}

type ParsedLog = {
  level: string
  appName: string
  timestamp: string
  source: string
  message: string
  structured: boolean
}

const props = defineProps<{
  logfile: string
}>()

const { t } = useI18n()
const display = useDisplay()
const { useSSE } = useBackground()

const DEFAULT_LEVELS = ['DEBUG', 'INFO', 'WARNING', 'ERROR']
const HIDDEN_LEVELS = ['TRACE', 'CRITICAL']
const MAX_LOG_LINES = 600
const FLUSH_DELAY = 80
const GROUP_GAP_MS = 100
const SCROLL_BOTTOM_THRESHOLD = 32
const ANSI_PATTERN = /\u001B\[[0-9;]*m/g
const TIMESTAMP_PATTERN = /\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?(?:,\d{3})?)?/

const parsedLogs = ref<LogEntry[]>([])
const logViewportRef = ref<HTMLElement | null>(null)
const isMounted = ref(false)
const followTail = ref(true)
// 倒序显示：最新日志在最上方，选择持久化
const newestFirst = ref(localStorage.getItem('MP_LOG_NEWEST_FIRST') === '1')
const isStreamPaused = ref(false)
const searchQuery = ref<string | null>('')
const selectedLevel = ref('ALL')
const pendingLogCount = ref(0)

let timeoutId: number | null = null
let mountTimerId: number | null = null
let logSequence = 0
const buffer: string[] = []

const listenerId = `logging-${props.logfile}`

const logColorMap: Record<string, string> = {
  TRACE: 'secondary',
  DEBUG: 'secondary',
  INFO: 'success',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'error',
}

const normalizedSearchQuery = computed(() => (searchQuery.value ?? '').trim().toLowerCase())
const { availableHeight } = useAvailableHeight(96, 320)

const loggingViewStyle = computed(() => (display.mdAndUp.value ? { blockSize: `${availableHeight.value}px` } : {}))

const levelOptions = computed(() => {
  const extraLevels = parsedLogs.value
    .map(item => item.level)
    .filter(level => level && !DEFAULT_LEVELS.includes(level) && !HIDDEN_LEVELS.includes(level))

  return ['ALL', ...DEFAULT_LEVELS, ...new Set(extraLevels)]
})

const groupedLogs = computed(() => {
  const groups: LogGroup[] = []

  for (const item of parsedLogs.value) {
    const lastGroup = groups.at(-1)
    if (lastGroup && canMergeIntoGroup(lastGroup, item)) {
      lastGroup.items.push(item)
      if (item.timestampMs !== null) {
        lastGroup.lastTimestampMs = item.timestampMs
      }
      continue
    }

    groups.push({
      id: `${item.secondKey || 'log'}-${item.level || 'plain'}-${item.id}`,
      level: item.level,
      secondKey: item.secondKey,
      secondDisplay: item.secondDisplay,
      items: [item],
      lastTimestampMs: item.timestampMs,
    })
  }

  return groups
})

const filteredGroups = computed(() => {
  return groupedLogs.value
    .map(group => ({
      ...group,
      items: group.items.filter(matchesLogFilter),
    }))
    .filter(group => group.items.length > 0)
})

const displayGroups = computed(() => {
  if (!newestFirst.value) {
    return filteredGroups.value
  }

  // 分组与组内条目一起倒序，最新时间显示在最上方
  return filteredGroups.value.map(group => ({ ...group, items: [...group.items].reverse() })).reverse()
})

const visibleLogCount = computed(() => {
  return filteredGroups.value.reduce((count, group) => count + group.items.length, 0)
})

const lastVisibleLogId = computed(() => {
  return filteredGroups.value.at(-1)?.items.at(-1)?.id ?? 0
})

// 跟随滚动锚定到最新一条可见日志；倒序时它位于列表首位
const followAnchorId = computed(() => {
  return newestFirst.value ? (filteredGroups.value.at(0)?.items.at(0)?.id ?? 0) : lastVisibleLogId.value
})

/** 规范化日志级别名称。 */
function normalizeLevel(level: string) {
  const normalizedLevel = level.trim().replace(/:$/, '').toUpperCase()

  if (normalizedLevel === 'WARN') {
    return 'WARNING'
  }

  if (normalizedLevel === 'FATAL') {
    return 'CRITICAL'
  }

  return normalizedLevel
}

/** 移除日志文本中的 ANSI 颜色控制符。 */
function stripAnsi(text: string) {
  return text.replace(ANSI_PATTERN, '')
}

/** 从日志文本中提取时间戳。 */
function extractTimestamp(text: string) {
  return text.match(TIMESTAMP_PATTERN)?.[0] ?? ''
}

/** 将日志时间戳转换为毫秒值。 */
function getTimestampMs(timestamp: string) {
  if (!timestamp) {
    return null
  }

  const normalizedTimestamp = timestamp.replace(' ', 'T').replace(',', '.')
  const parsedTimestamp = Date.parse(normalizedTimestamp)

  return Number.isNaN(parsedTimestamp) ? null : parsedTimestamp
}

/** 获取用于日志分组的秒级时间键。 */
function getSecondKey(timestamp: string) {
  if (!timestamp) {
    return ''
  }

  return timestamp.replace('T', ' ').slice(0, 19)
}

/** 格式化秒级时间键用于界面展示。 */
function getSecondDisplay(secondKey: string) {
  return secondKey ? secondKey.replaceAll('-', '/') : ''
}

/** 提取日志时间戳中的时分秒部分。 */
function getTimeDisplay(timestamp: string) {
  if (!timestamp) {
    return ''
  }

  return timestamp.split(' ').at(-1) ?? timestamp
}

/** 从结构化日志正文中提取消息内容。 */
function extractMessage(text: string) {
  return (
    text
      .split(/\s+-\s+/)
      .slice(1)
      .join(' - ') || text
  )
}

/** 根据原始日志和解析结果创建展示条目。 */
function createLogEntry(raw: string, parsed?: ParsedLog | null): LogEntry {
  const level = parsed?.level ?? ''
  const appName = parsed?.appName ?? ''
  const timestamp = parsed?.timestamp ?? extractTimestamp(raw)
  const secondKey = getSecondKey(timestamp)

  return {
    id: ++logSequence,
    raw,
    level,
    appName,
    timestamp,
    timestampMs: getTimestampMs(timestamp),
    secondKey,
    secondDisplay: getSecondDisplay(secondKey),
    timeDisplay: getTimeDisplay(timestamp),
    displayLevel: `${level || 'LOG'}:`,
    source: parsed?.source ?? '',
    message: parsed?.message ?? raw,
    structured: parsed?.structured ?? false,
  }
}

/** 解析 Python 风格的日志行。 */
function parsePythonStyleLog(raw: string): ParsedLog | null {
  const match = raw.match(/^([A-Za-z]+):\s+(.*)$/)
  if (!match) {
    return null
  }

  const [, rawLevel, remainder] = match
  const level = normalizeLevel(rawLevel)
  if (!DEFAULT_LEVELS.includes(level)) {
    return null
  }

  const body = remainder.trim()
  const bodyMatch = body.match(
    /^(?:\[([^\]]+)\]\s+)?(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:,\d{3})?)\s+([^\s]+)\s+-\s+(.*)$/,
  )

  return {
    level,
    appName: bodyMatch?.[1] ?? '',
    timestamp: bodyMatch?.[2] ?? extractTimestamp(body),
    source: bodyMatch?.[3] ?? '',
    message: bodyMatch?.[4] ?? extractMessage(body),
    structured: Boolean(bodyMatch),
  }
}

/** 解析中文方括号标记的日志行。 */
function parseBracketStyleLog(raw: string): ParsedLog | null {
  const match = raw.match(/^【([^】]+)】\s*(.*)$/)
  if (!match) {
    return null
  }

  const [, rawLevel, remainder] = match
  const level = normalizeLevel(rawLevel)
  const body = remainder.trim()
  const bodyMatch = body.match(
    /^(?:\[([^\]]+)\]\s+)?(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:,\d{3})?)\s+([^\s]+)\s+-\s+(.*)$/,
  )

  return {
    level,
    appName: bodyMatch?.[1] ?? '',
    timestamp: bodyMatch?.[2] ?? extractTimestamp(body),
    source: bodyMatch?.[3] ?? '',
    message: bodyMatch?.[4] ?? extractMessage(body),
    structured: Boolean(bodyMatch),
  }
}

/** 解析以时间戳开头的日志行。 */
function parseTimestampFirstLog(raw: string): ParsedLog | null {
  const match = raw.match(new RegExp(`^(${TIMESTAMP_PATTERN.source})\\s+\\[?([A-Za-z]+)\\]?\\s*(.*)$`))
  if (!match) {
    return null
  }

  const [, timestamp, rawLevel, remainder] = match
  const level = normalizeLevel(rawLevel)
  if (!DEFAULT_LEVELS.includes(level)) {
    return null
  }

  const body = remainder.trim()
  const bodyMatch = body.match(/^(?:\[([^\]]+)\]\s+)?([^\s]+)\s+-\s+(.*)$/)

  return {
    level,
    appName: bodyMatch?.[1] ?? '',
    timestamp,
    source: bodyMatch?.[2] ?? '',
    message: bodyMatch?.[3] ?? extractMessage(body),
    structured: Boolean(bodyMatch),
  }
}

/** 解析以内联级别开头的日志行。 */
function parseInlineLevelLog(raw: string): ParsedLog | null {
  const match = raw.match(/^\[?([A-Za-z]+)\]?:?\s+(.*)$/)
  if (!match) {
    return null
  }

  const [, rawLevel, remainder] = match
  const level = normalizeLevel(rawLevel)
  if (!DEFAULT_LEVELS.includes(level)) {
    return null
  }

  const body = remainder.trim()
  const timestamp = extractTimestamp(body)
  const bodyWithoutTimestamp = timestamp ? body.replace(timestamp, '').trim() : body
  const bodyMatch = bodyWithoutTimestamp.match(/^(?:\[([^\]]+)\]\s+)?([^\s]+)\s+-\s+(.*)$/)

  return {
    level,
    appName: bodyMatch?.[1] ?? '',
    timestamp,
    source: bodyMatch?.[2] ?? '',
    message: bodyMatch?.[3] ?? extractMessage(bodyWithoutTimestamp),
    structured: Boolean(bodyMatch),
  }
}

/** 将单行原始日志解析为展示条目。 */
function parseLogLine(log: string): LogEntry {
  const raw = stripAnsi(log).replace(/\r/g, '').trimEnd()
  const parsed =
    parsePythonStyleLog(raw) ?? parseBracketStyleLog(raw) ?? parseTimestampFirstLog(raw) ?? parseInlineLevelLog(raw)

  return createLogEntry(raw, parsed)
}

/** 判断日志条目是否符合当前级别和关键字筛选。 */
function matchesLogFilter(item: LogEntry) {
  const matchesLevel = selectedLevel.value === 'ALL' || item.level === selectedLevel.value
  if (!matchesLevel) {
    return false
  }

  if (!normalizedSearchQuery.value) {
    return true
  }

  return [item.raw, item.level, item.appName, item.timestamp, item.source, item.message]
    .join(' ')
    .toLowerCase()
    .includes(normalizedSearchQuery.value)
}

/** 判断日志条目能否合并进当前时间分组。 */
function canMergeIntoGroup(group: LogGroup, item: LogEntry) {
  if (!group.secondKey || !item.secondKey) {
    return false
  }

  if (group.secondKey !== item.secondKey || group.level !== item.level) {
    return false
  }

  if (group.lastTimestampMs !== null && item.timestampMs !== null) {
    return item.timestampMs - group.lastTimestampMs <= GROUP_GAP_MS
  }

  return true
}

/** 判断日志视口是否接近底部。 */
function isNearBottom() {
  if (!logViewportRef.value) {
    return true
  }

  const { scrollTop, scrollHeight, clientHeight } = logViewportRef.value
  return scrollHeight - scrollTop - clientHeight <= SCROLL_BOTTOM_THRESHOLD
}

/** 判断日志视口是否接近最新日志一端（正序为底部，倒序为顶部）。 */
function isNearLatest() {
  if (newestFirst.value) {
    return (logViewportRef.value?.scrollTop ?? 0) <= SCROLL_BOTTOM_THRESHOLD
  }

  return isNearBottom()
}

/** 将日志视口滚动到最新日志一端（正序为底部，倒序为顶部）。 */
function scrollToLatest(behavior: ScrollBehavior = 'auto') {
  if (!logViewportRef.value) {
    return
  }

  logViewportRef.value.scrollTo({
    top: newestFirst.value ? 0 : logViewportRef.value.scrollHeight,
    behavior,
  })
}

/** 启用日志末尾跟随并清空待查看计数。 */
function enableFollow(behavior: ScrollBehavior = 'auto') {
  followTail.value = true
  pendingLogCount.value = 0

  nextTick(() => {
    scrollToLatest(behavior)
  })
}

/** 将缓冲区中的日志批量写入展示列表。 */
function flushBuffer() {
  if (timeoutId) {
    clearTimeout(timeoutId)
    timeoutId = null
  }

  if (buffer.length === 0) {
    return
  }

  const incomingLogs = buffer
    .flatMap(item => item.split(/\r?\n/))
    .filter(item => item.length > 0)
    .map(parseLogLine)

  buffer.length = 0

  if (incomingLogs.length === 0) {
    return
  }

  const shouldFollow = isNearLatest()

  parsedLogs.value = [...parsedLogs.value, ...incomingLogs].slice(-MAX_LOG_LINES)

  followTail.value = shouldFollow

  if (shouldFollow) {
    enableFollow()
    return
  }

  pendingLogCount.value += incomingLogs.filter(matchesLogFilter).length
}

/** 安排一次延迟缓冲区刷新。 */
function scheduleFlush() {
  if (timeoutId) {
    return
  }

  timeoutId = window.setTimeout(() => {
    flushBuffer()
  }, FLUSH_DELAY)
}

/** 接收并缓存 SSE 日志消息。 */
function handleSSEMessage(event: MessageEvent) {
  if (!event.data) {
    return
  }

  isConnected.value = true
  buffer.push(String(event.data))
  scheduleFlush()
}

const { manager, isConnected } = useSSE(
  `${import.meta.env.VITE_API_BASE_URL}system/logging?logfile=${encodeURIComponent(props.logfile ?? 'moviepilot.log')}`,
  handleSSEMessage,
  listenerId,
  {
    backgroundCloseDelay: 5000,
    reconnectDelay: 3000,
    maxReconnectAttempts: 3,
    connectDelay: 300,
  },
)

const statusListenerId = `${listenerId}:status`
manager.addStatusListener(statusListenerId, status => {
  // 每次连接都会重发历史尾部；重连时替换旧显示，暂停期间则保留当前内容。
  if (status === 'open' && !isStreamPaused.value) resetDisplayedLogs()
})
onUnmounted(() => manager.removeStatusListener(statusListenerId))

/** 清空待写入缓冲和已显示日志，供重连后接收服务端重发的历史尾部。 */
function resetDisplayedLogs() {
  if (timeoutId) {
    clearTimeout(timeoutId)
    timeoutId = null
  }
  buffer.length = 0
  parsedLogs.value = []
  pendingLogCount.value = 0
}

/** 暂停实时日志流。 */
function pauseStream() {
  if (isStreamPaused.value) {
    return
  }

  flushBuffer()
  isStreamPaused.value = true
  isConnected.value = false
  manager.removeMessageListener(listenerId)
}

/** 恢复实时日志流。 */
function resumeStream() {
  if (!isStreamPaused.value) {
    return
  }

  isStreamPaused.value = false
  isConnected.value = false
  manager.addMessageListener(listenerId, handleSSEMessage)
}

/** 切换实时日志流的暂停状态。 */
function toggleStreamState() {
  if (isStreamPaused.value) {
    resumeStream()
    return
  }

  pauseStream()
}

/** 切换日志倒序显示，切换后吸附到最新日志一端。 */
function toggleNewestFirst() {
  newestFirst.value = !newestFirst.value
  localStorage.setItem('MP_LOG_NEWEST_FIRST', newestFirst.value ? '1' : '0')
  enableFollow()
}

/** 根据滚动位置更新日志末尾跟随状态。 */
function handleScroll() {
  if (isNearLatest()) {
    followTail.value = true
    pendingLogCount.value = 0
    return
  }

  followTail.value = false
}

watch(followAnchorId, (currentId, previousId) => {
  if (!followTail.value || currentId === previousId) {
    return
  }

  nextTick(() => {
    scrollToLatest()
  })
})

onMounted(() => {
  mountTimerId = window.setTimeout(() => {
    isMounted.value = true
  }, 200)
})

onUnmounted(() => {
  if (mountTimerId) {
    clearTimeout(mountTimerId)
  }

  flushBuffer()
})
</script>

<template>
  <VProgressLinear v-if="!isStreamPaused" class="logging-live-progress" indeterminate color="primary" height="1" />
  <div class="logging-view" :style="loggingViewStyle">
    <div class="logging-toolbar">
      <div v-if="display.mdAndUp.value" class="mp-segmented logging-level-segmented" role="group">
        <button
          v-for="level in levelOptions"
          :key="level"
          type="button"
          class="mp-segmented__btn logging-level-btn"
          :class="[`logging-level-btn--${level.toLowerCase()}`, { 'is-active': selectedLevel === level }]"
          @click="selectedLevel = level"
        >
          {{ level === 'ALL' ? t('common.all') : level }}
        </button>
      </div>

      <VSelect
        v-else
        v-model="selectedLevel"
        :items="levelOptions"
        density="compact"
        variant="outlined"
        hide-details
        class="logging-level-select"
        :menu-props="{ width: 'auto' }"
      >
        <template #selection="{ item }">
          <span
            :class="item.value === 'ALL' ? 'text-primary' : `text-${logColorMap[item.value] || 'secondary'}`"
            class="font-weight-medium"
          >
            {{ item.value === 'ALL' ? t('logging.allLevels') : item.value }}
          </span>
        </template>
        <template #item="{ props: itemProps, item }">
          <VListItem v-bind="itemProps" density="compact">
            <template #title>
              <span
                :class="item.value === 'ALL' ? 'text-primary' : `text-${logColorMap[item.value] || 'secondary'}`"
                class="font-weight-medium"
              >
                {{ item.value === 'ALL' ? t('logging.allLevels') : item.value }}
              </span>
            </template>
          </VListItem>
        </template>
      </VSelect>

      <VTextField
        v-model="searchQuery"
        class="logging-search"
        density="compact"
        variant="outlined"
        single-line
        hide-details
        clearable
        @click:clear="searchQuery = ''"
        prepend-inner-icon="mdi-magnify"
        :placeholder="t('logging.searchPlaceholder')"
      />

      <div class="logging-stream-actions">
        <VBtn
          variant="text"
          icon
          size="small"
          class="logging-stream-action"
          :class="{ 'is-active': newestFirst }"
          :title="newestFirst ? t('logging.oldestFirst') : t('logging.newestFirst')"
          :aria-label="newestFirst ? t('logging.oldestFirst') : t('logging.newestFirst')"
          @click="toggleNewestFirst"
        >
          <VIcon :icon="newestFirst ? 'mdi-sort-descending' : 'mdi-sort-ascending'" size="16" />
        </VBtn>

        <VBtn
          variant="text"
          icon
          size="small"
          class="logging-stream-action"
          :class="{ 'is-live': !isStreamPaused }"
          :title="isStreamPaused ? t('logging.resumeStream') : t('logging.pauseStream')"
          :aria-label="isStreamPaused ? t('logging.resumeStream') : t('logging.pauseStream')"
          @click="toggleStreamState"
        >
          <VIcon :icon="isStreamPaused ? 'mdi-play' : 'mdi-pause'" size="16" />
        </VBtn>
      </div>
    </div>

    <div ref="logViewportRef" class="logging-shell is-wrap" @scroll.passive="handleScroll">
      <div v-if="!isMounted" class="logging-loading-overlay">
        <LoadingBanner :text="t('logging.initializing') + ' ...'" />
      </div>

      <div v-else-if="displayGroups.length === 0" class="logging-empty">
        <VIcon :icon="parsedLogs.length === 0 ? 'mdi-console-line' : 'mdi-filter-remove-outline'" size="20" />
        <span>
          {{ parsedLogs.length === 0 ? t('logging.waitingForLogs') : t('common.noMatchingData') }}
        </span>
      </div>

      <div v-else class="logging-list">
        <div v-for="(group, index) in displayGroups" :key="group.id" class="logging-record">
          <div class="logging-record-time">{{ group.secondDisplay || '...' }}</div>

          <div class="logging-record-panel" :class="index % 2 === 0 ? 'is-even' : 'is-odd'">
            <div
              class="logging-record-accent"
              :class="[`level-${(group.level || 'plain').toLowerCase()}`, { 'is-burst': group.items.length > 1 }]"
            />

            <div class="logging-record-lines">
              <div v-for="item in group.items" :key="item.id" class="logging-record-line">
                <div class="logging-record-level" :class="`level-${(item.level || 'plain').toLowerCase()}`">
                  {{ item.displayLevel }}
                </div>

                <div v-if="item.appName" class="logging-record-app">[{{ item.appName }}]</div>

                <div class="logging-record-body">
                  <span v-if="item.timeDisplay" class="logging-record-inline-time">{{ item.timeDisplay }}</span>
                  {{ item.message }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="pendingLogCount > 0 && !followTail" class="logging-latest-action">
        <VBtn
          size="small"
          color="primary"
          variant="elevated"
          :prepend-icon="newestFirst ? 'mdi-arrow-up' : 'mdi-arrow-down'"
          @click="enableFollow('smooth')"
        >
          {{ t('logging.jumpToLatest', { count: pendingLogCount }) }}
        </VBtn>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */
.logging-view {
  --logging-shell-background: rgb(var(--v-theme-surface));
  --logging-text: rgba(var(--v-theme-on-surface), 0.88);
  --logging-muted: rgba(var(--v-theme-on-surface), 0.56);
  --logging-border: var(--mp-border-card);

  display: flex;
  flex-direction: column;
  block-size: 100%;
  gap: 8px;
  min-block-size: 20rem;
}

.logging-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding-block: 4px 0;
  padding-inline: 2px;
}

.logging-level-segmented {
  flex: 0 0 auto;
}

.logging-level-btn {
  font-size: 12px;
  font-weight: 600;
  padding-inline: 11px;
}

.logging-level-btn--debug:not(.is-active) {
  color: rgb(var(--v-theme-secondary));
}

.logging-level-btn--info:not(.is-active) {
  color: rgb(var(--v-theme-success));
}

.logging-level-btn--warning:not(.is-active) {
  color: rgb(var(--v-theme-warning));
}

.logging-level-btn--error:not(.is-active) {
  color: rgb(var(--v-theme-error));
}

.logging-level-select {
  flex: 0 0 7.25rem;
  min-inline-size: 7.25rem;
}

.logging-search {
  flex: 1 1 10rem;
  min-inline-size: 6rem;
}

.logging-level-select :deep(.v-field),
.logging-search :deep(.v-field) {
  border-radius: 8px;
  background: var(--mp-field-bg);
  min-block-size: 32px;
}

.logging-level-select :deep(.v-field__input),
.logging-search :deep(.v-field__input) {
  min-block-size: 32px;
  padding-block: 0;
  font-size: 12.5px;
}

.logging-level-select :deep(.v-field__append-inner),
.logging-search :deep(.v-field__prepend-inner),
.logging-search :deep(.v-field__clearable) {
  align-items: center;
  min-block-size: 32px;
  padding-block: 0;
}

.logging-stream-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.logging-stream-action {
  border: 1px solid var(--mp-border-subtle);
  border-radius: 7px !important;
  background: var(--mp-item-bg);
  block-size: 28px !important;
  color: var(--logging-muted);
  inline-size: 28px !important;
  min-inline-size: 28px !important;
}

.logging-stream-action.is-active {
  border-color: rgba(var(--v-theme-primary), 0.36);
  background: rgba(var(--v-theme-primary), 0.1);
  color: rgb(var(--v-theme-primary));
}

.logging-stream-action.is-live {
  border-color: rgba(var(--v-theme-success), 0.32);
  background: rgba(var(--v-theme-success), 0.08);
  color: rgb(var(--v-theme-success));
}

.logging-shell {
  position: relative;
  overflow: auto;
  flex: 1 1 auto;
  padding: 10px 12px;
  border: 1px solid var(--logging-border);
  border-radius: 10px;
  background: var(--logging-shell-background);
}

.logging-loading-overlay {
  position: sticky;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(var(--v-theme-surface));
  inset-block-start: 0;
  margin-block-end: 10px;
  margin-inline: -12px;
  padding-block: 8px 10px;
  padding-inline: 12px;
}

.logging-loading-overlay :deep(.initial-loading-container) {
  min-block-size: 10rem;
}

.logging-live-progress :deep(.v-progress-linear__background) {
  opacity: 0.12;
}

.logging-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  block-size: 100%;
  color: var(--logging-muted);
  font-size: 13px;
  gap: 8px;
  min-block-size: 16rem;
}

.logging-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-inline-size: 100%;
}

.logging-record {
  display: grid;
  align-items: start;
  gap: 8px;
  grid-template-columns: 9.75rem minmax(0, 1fr);
}

.logging-record-time {
  color: rgb(var(--v-theme-primary));
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  line-height: 1.55;
  padding-block: 6px;
  white-space: nowrap;
}

.logging-record-panel {
  display: flex;
  align-items: stretch;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 8px;
  gap: 10px;
  min-inline-size: 0;
  padding: 6px 10px;
}

.logging-record-panel.is-even {
  background: var(--mp-field-bg);
}

.logging-record-panel.is-odd {
  background: transparent;
}

.logging-record-accent {
  flex: 0 0 auto;
  align-self: flex-start;
  border-radius: 999px;
  background-color: rgba(var(--v-theme-on-surface), 0.24);
  block-size: 6px;
  inline-size: 6px;
  margin-block-start: 6px;
}

.logging-record-accent.is-burst {
  align-self: stretch;
  border-radius: 999px;
  block-size: auto;
  inline-size: 4px;
  margin-block-start: 0;
}

.logging-record-lines {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
  min-inline-size: 0;
}

.logging-record-line {
  display: flex;
  align-items: flex-start;
  color: var(--logging-text);
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  font-size: 12.5px;
  gap: 10px;
  line-height: 1.55;
  min-inline-size: max-content;
}

.logging-shell.is-wrap .logging-record-line {
  min-inline-size: 0;
}

.logging-record-level {
  flex: 0 0 3.9rem;
  font-weight: 700;
  min-inline-size: 3.9rem;
}

.logging-record-body {
  color: var(--logging-text);
  min-inline-size: 0;
  white-space: pre;
}

.logging-record-app,
.logging-record-inline-time {
  flex: 0 0 auto;
  color: var(--logging-muted);
  font-variant-numeric: tabular-nums;
}

.logging-record-app {
  color: rgba(var(--v-theme-on-surface), 0.72);
}

.logging-shell.is-wrap .logging-record-body {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.logging-record-level.level-trace,
.logging-record-level.level-debug {
  color: rgb(var(--v-theme-secondary));
}

.logging-record-level.level-info {
  color: rgb(var(--v-theme-success));
}

.logging-record-level.level-warning {
  color: rgb(var(--v-theme-warning));
}

.logging-record-level.level-error,
.logging-record-level.level-critical {
  color: rgb(var(--v-theme-error));
}

.logging-record-level.level-plain {
  color: var(--logging-muted);
}

.logging-record-accent.level-trace,
.logging-record-accent.level-debug {
  background-color: rgb(var(--v-theme-secondary));
}

.logging-record-accent.level-info {
  background-color: rgb(var(--v-theme-success));
}

.logging-record-accent.level-warning {
  background-color: rgb(var(--v-theme-warning));
}

.logging-record-accent.level-error,
.logging-record-accent.level-critical {
  background-color: rgb(var(--v-theme-error));
}

.logging-record-accent.level-plain {
  background-color: rgba(var(--v-theme-on-surface), 0.24);
}

.logging-latest-action {
  position: sticky;
  display: flex;
  justify-content: flex-end;
  inset-block-end: 10px;
  margin-block-start: 10px;
  pointer-events: none;
}

.logging-latest-action :deep(.v-btn) {
  pointer-events: auto;
}

@media (width <= 960px) {
  .logging-view {
    flex: 1 1 auto;
    block-size: auto;
    min-block-size: 0;
  }

  .logging-record {
    gap: 6px;
    grid-template-columns: 9.25rem minmax(0, 1fr);
  }

  .logging-record-level {
    flex-basis: 4.4rem;
    min-inline-size: 4.4rem;
  }
}

@media (width <= 640px) {
  .logging-view {
    gap: 8px;
    min-block-size: 0;
  }

  .logging-record {
    gap: 3px;
    grid-template-columns: minmax(0, 1fr);
  }

  .logging-record-time {
    padding-block: 0;
  }

  .logging-record-panel {
    padding: 6px 8px;
  }

  .logging-record-line {
    gap: 8px;
  }

  .logging-shell {
    padding: 8px 10px;
  }

  .logging-loading-overlay {
    margin-inline: -10px;
    padding-inline: 10px;
  }
}
</style>
