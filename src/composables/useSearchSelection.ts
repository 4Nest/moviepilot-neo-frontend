export type SearchRuleMode = 'default' | 'custom' | 'none'

export interface StoredSearchSelection {
  sites?: number[]
  ruleMode: SearchRuleMode
  ruleGroups: string[]
  customRules: string[]
}

export const SEARCH_SELECTION_STORAGE_KEY = 'mp_search_dialog_selection_v1'
export const SEARCH_RULE_NONE_TOKEN = '__none__'
export const SEARCH_SINGLE_RULE_PREFIX = 'rule:'

function isValidRuleMode(value: unknown): value is SearchRuleMode {
  return value === 'default' || value === 'custom' || value === 'none'
}

function normalizeStringList(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  const result: string[] = []
  values.forEach(item => {
    if (typeof item === 'string') {
      const trimmed = item.trim()
      if (trimmed && !result.includes(trimmed)) {
        result.push(trimmed)
      }
    }
  })
  return result
}

function normalizeSiteList(values: unknown): number[] | undefined {
  if (!Array.isArray(values)) return undefined
  const result: number[] = []
  values.forEach(item => {
    const id = Number(item)
    if (Number.isInteger(id) && !result.includes(id)) {
      result.push(id)
    }
  })
  return result
}

/**
 * 读取浏览器中记住的上次搜索站点与规则选择。
 */
export function loadStoredSearchSelection(): StoredSearchSelection | null {
  try {
    const raw = localStorage.getItem(SEARCH_SELECTION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return null

    const ruleMode: SearchRuleMode = isValidRuleMode(parsed.ruleMode) ? parsed.ruleMode : 'default'
    return {
      sites: normalizeSiteList(parsed.sites),
      ruleMode,
      ruleGroups: normalizeStringList(parsed.ruleGroups),
      customRules: normalizeStringList(parsed.customRules),
    }
  } catch {
    try {
      localStorage.removeItem(SEARCH_SELECTION_STORAGE_KEY)
    } catch {
      // 忽略存储清理异常
    }
    return null
  }
}

/**
 * 持久化本次搜索弹窗中的站点与过滤规则选择。
 */
export function saveStoredSearchSelection(selection: StoredSearchSelection): void {
  try {
    const payload: StoredSearchSelection = {
      sites: normalizeSiteList(selection.sites),
      ruleMode: isValidRuleMode(selection.ruleMode) ? selection.ruleMode : 'default',
      ruleGroups: normalizeStringList(selection.ruleGroups),
      customRules: normalizeStringList(selection.customRules),
    }
    localStorage.setItem(SEARCH_SELECTION_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // 忽略隐私模式或配额导致的存储异常
  }
}

/**
 * 清除浏览器中保存的搜索弹窗选择。
 */
export function clearStoredSearchSelection(): void {
  try {
    localStorage.removeItem(SEARCH_SELECTION_STORAGE_KEY)
  } catch {
    // 忽略存储清理异常
  }
}

/**
 * 将前端规则选择编码为后端 `rule_groups` 查询参数：
 * - default：返回 undefined（沿用系统默认搜索规则）
 * - none：返回 '__none__'（本次跳过所有过滤规则）
 * - custom：返回逗号分隔的规则组名与 `rule:<id>` 单条规则；未选择任何项时回退默认（undefined）
 */
export function encodeSearchRuleGroupsParam(
  selection: Pick<StoredSearchSelection, 'ruleMode' | 'ruleGroups' | 'customRules'>,
): string | undefined {
  if (selection.ruleMode === 'none') {
    return SEARCH_RULE_NONE_TOKEN
  }
  if (selection.ruleMode !== 'custom') {
    return undefined
  }
  const tokens: string[] = []
  selection.ruleGroups.forEach(groupName => {
    const trimmed = groupName.trim()
    if (trimmed && !tokens.includes(trimmed)) {
      tokens.push(trimmed)
    }
  })
  selection.customRules.forEach(ruleId => {
    const trimmed = ruleId.trim()
    if (!trimmed) return
    const token = `${SEARCH_SINGLE_RULE_PREFIX}${trimmed}`
    if (!tokens.includes(token)) {
      tokens.push(token)
    }
  })
  return tokens.length > 0 ? tokens.join(',') : undefined
}
