import { ref } from 'vue'
import api from '@/api'
import type { DiscoverSource } from '@/api/types'
import type { NavMenuTabItem } from '@/@layouts/types'
import type { TextTranslator } from '@/composables/useChineseText'
import { getDiscoverSourceIcon, getDiscoverTabs } from '@/router/i18n-menu'

const LOCAL_ORDER_KEY = 'MP_DISCOVER_TAB_ORDER'

export interface DiscoverNavOrderItem {
  name: string
  mediaid_prefix?: string
  enabled?: boolean
}

export const sharedDiscoverNavTabs = ref<NavMenuTabItem[] | null>(null)
let remoteDiscoverNavLoaded = false
let inflightDiscoverNavLoad: Promise<NavMenuTabItem[]> | null = null

export function resetSharedDiscoverNavTabs() {
  sharedDiscoverNavTabs.value = null
  remoteDiscoverNavLoaded = false
  inflightDiscoverNavLoad = null
}

export function setSharedDiscoverNavTabs(items: NavMenuTabItem[], authoritative = true) {
  sharedDiscoverNavTabs.value = items
  if (authoritative) {
    remoteDiscoverNavLoaded = true
  }
}

function normalizeOrderItems(value: unknown): DiscoverNavOrderItem[] | null {
  if (!Array.isArray(value)) return null
  const result: DiscoverNavOrderItem[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null
    const candidate = item as { name?: unknown; mediaid_prefix?: unknown; enabled?: unknown }
    if (typeof candidate.name !== 'string' || !candidate.name.trim()) return null
    if (candidate.mediaid_prefix !== undefined && typeof candidate.mediaid_prefix !== 'string') return null
    if (candidate.enabled !== undefined && typeof candidate.enabled !== 'boolean') return null

    const normalized: DiscoverNavOrderItem = { name: candidate.name }
    if (candidate.mediaid_prefix?.trim()) normalized.mediaid_prefix = candidate.mediaid_prefix.trim()
    if (candidate.enabled !== undefined) normalized.enabled = candidate.enabled
    result.push(normalized)
  }
  return result
}

function readLocalDiscoverOrder(): DiscoverNavOrderItem[] | null {
  try {
    const raw = localStorage.getItem(LOCAL_ORDER_KEY)
    if (!raw) return null
    return normalizeOrderItems(JSON.parse(raw))
  } catch {
    return null
  }
}

export function buildOrderedDiscoverNavTabs(
  builtInTabs: NavMenuTabItem[],
  extraSources: DiscoverSource[],
  orderConfig: DiscoverNavOrderItem[] | null,
): NavMenuTabItem[] {
  const seen = new Set(builtInTabs.map(item => item.tab))
  const combined: Array<{ name: string; mediaid_prefix: string; icon: string }> = builtInTabs.map(item => ({
    name: item.title,
    mediaid_prefix: item.tab,
    icon: item.icon || getDiscoverSourceIcon(item.tab),
  }))

  for (const src of extraSources) {
    if (!src?.mediaid_prefix || seen.has(src.mediaid_prefix)) continue
    seen.add(src.mediaid_prefix)
    combined.push({
      name: src.name,
      mediaid_prefix: src.mediaid_prefix,
      icon: getDiscoverSourceIcon(src.mediaid_prefix),
    })
  }

  if (orderConfig && orderConfig.length > 0) {
    const findIdx = (entry: { name: string; mediaid_prefix: string }) =>
      orderConfig.findIndex(item =>
        item.mediaid_prefix ? item.mediaid_prefix === entry.mediaid_prefix : item.name === entry.name,
      )
    combined.sort((a, b) => {
      const aIdx = findIdx(a)
      const bIdx = findIdx(b)
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx)
    })
  }

  const visible = orderConfig
    ? combined.filter(entry => {
        const matched = orderConfig.find(item =>
          item.mediaid_prefix ? item.mediaid_prefix === entry.mediaid_prefix : item.name === entry.name,
        )
        return matched ? matched.enabled !== false : true
      })
    : combined

  return visible.map(entry => ({
    title: entry.name,
    tab: entry.mediaid_prefix,
    icon: entry.icon,
  }))
}

export async function ensureDiscoverNavTabsLoaded(t: TextTranslator): Promise<NavMenuTabItem[]> {
  if (remoteDiscoverNavLoaded && sharedDiscoverNavTabs.value && sharedDiscoverNavTabs.value.length > 0) {
    return sharedDiscoverNavTabs.value
  }
  if (inflightDiscoverNavLoad) return inflightDiscoverNavLoad

  const builtInTabs = typeof getDiscoverTabs === 'function' ? getDiscoverTabs(t) : []
  const localOrder = readLocalDiscoverOrder()
  if (localOrder && !sharedDiscoverNavTabs.value) {
    sharedDiscoverNavTabs.value = buildOrderedDiscoverNavTabs(builtInTabs, [], localOrder)
  }

  inflightDiscoverNavLoad = (async () => {
    const [sourcesRes, orderRes] = await Promise.allSettled([
      api.get<DiscoverSource[], DiscoverSource[]>('discover/source'),
      api.get<{ data?: { value?: unknown } }, { data?: { value?: unknown } }>(`/user/config/${LOCAL_ORDER_KEY}`),
    ])

    const sourcesSucceeded = sourcesRes.status === 'fulfilled' && Array.isArray(sourcesRes.value)
    const extraSources = sourcesSucceeded ? sourcesRes.value : []
    const remoteOrder = orderRes.status === 'fulfilled' ? normalizeOrderItems(orderRes.value?.data?.value) : null
    const effectiveOrder = remoteOrder ?? localOrder
    if (remoteOrder) {
      try {
        localStorage.setItem(LOCAL_ORDER_KEY, JSON.stringify(remoteOrder))
      } catch {
        // 忽略存储限制异常
      }
    }

    const resolved = buildOrderedDiscoverNavTabs(builtInTabs, extraSources, effectiveOrder)
    sharedDiscoverNavTabs.value = resolved
    if (sourcesSucceeded) {
      remoteDiscoverNavLoaded = true
    }
    return resolved
  })().finally(() => {
    inflightDiscoverNavLoad = null
  })

  return inflightDiscoverNavLoad
}
