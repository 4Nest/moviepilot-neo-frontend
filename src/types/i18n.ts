export interface LocaleInfo {
  name: string
  title: string
  flag?: string
}

// 仅保留简体中文
export const SUPPORTED_LOCALES: Record<string, LocaleInfo> = {
  'zh-CN': {
    name: 'zh-CN',
    title: '简体中文',
    flag: '🇨🇳',
  },
}

export type SupportedLocale = keyof typeof SUPPORTED_LOCALES
