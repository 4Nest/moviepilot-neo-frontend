import zhCN from '@/locales/zh-CN'

export type TextParams = Record<string, unknown>
export type TextTranslator = (key: string, params?: TextParams) => string

function resolveText(key: string): unknown {
  return key.split('.').reduce<unknown>((value, segment) => {
    if (!value || typeof value !== 'object') return undefined
    return (value as Record<string, unknown>)[segment]
  }, zhCN)
}

export function hasChineseText(key: string): boolean {
  return typeof resolveText(key) === 'string'
}

export function translate(key: string, params: TextParams = {}): string {
  const value = resolveText(key)
  if (typeof value !== 'string') return key

  return value.replace(/\{([^{}]+)\}/g, (placeholder, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name] ?? '') : placeholder,
  )
}

/** 固定简体中文文案接口；无语言状态、探测或切换能力。 */
export function useChineseText() {
  return {
    t: translate,
    te: hasChineseText,
  }
}

// 兼容尚未迁移的组件导入名；实现仍是无状态中文文本查询。
export const useI18n = useChineseText
