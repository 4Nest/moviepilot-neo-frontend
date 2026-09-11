import { createI18n } from 'vue-i18n'
import { SupportedLocale } from '@/types/i18n'

// 仅保留简体中文
import zhCN from '@/locales/zh-CN'

// 创建 i18n 实例
const i18n = createI18n({
  legacy: false, // 使用组合式API
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
  },
  silentTranslationWarn: true,
  silentFallbackWarn: true,
})

/** 唯一支持的语言 */
export function getBrowserLocale(): SupportedLocale {
  return 'zh-CN'
}

/**
 * 设置i18n语言环境（单语言下仅同步 HTML lang 属性）
 */
export async function setI18nLanguage(_locale: SupportedLocale) {
  // 单语言应用：locale 恒为 zh-CN，仅同步 HTML lang 属性
  document.querySelector('html')?.setAttribute('lang', 'zh-CN')
}

/**
 * 获取当前语言
 */
export function getCurrentLocale(): SupportedLocale {
  return i18n.global.locale.value as SupportedLocale
}

export default i18n
