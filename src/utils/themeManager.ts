import { applyDocumentThemeChrome } from '@/utils/themePalette'

// 主题管理器 - 管理应用主题状态与按需扩展主题样式
export interface ThemeConfig {
  name: string
  cssPath: string
  isLoaded: boolean
}

const legacyDarkThemes = new Set(['glass', 'purple', 'transparent'])

class ThemeManager {
  private themes: Map<string, ThemeConfig> = new Map()
  private currentTheme: string = 'default'
  private loadedLinks: Map<string, HTMLLinkElement> = new Map()
  private themeListeners: Map<(theme: string) => void, EventListener> = new Map()

  /** 注册内置主题。 */
  constructor() {
    this.registerTheme('default', '')
    this.registerTheme('light', '')
    this.registerTheme('dark', '')
    this.registerTheme('auto', '')
  }

  /**
   * 注册主题
   */
  registerTheme(name: string, cssPath: string): void {
    this.themes.set(name, {
      name,
      cssPath,
      isLoaded: false,
    })
  }

  /**
   * 获取当前主题
   */
  getCurrentTheme(): string {
    return this.currentTheme
  }

  /**
   * 设置主题（兼容历史持久化值平滑迁移到 dark）
   */
  async setTheme(themeName: string): Promise<void> {
    const normalizedTheme = legacyDarkThemes.has(themeName) ? 'dark' : themeName
    if (!this.themes.has(normalizedTheme)) {
      console.warn(`Theme "${normalizedTheme}" not found`)
      return
    }

    const theme = this.themes.get(normalizedTheme)!

    // 清理其他主题的CSS（除了当前要设置的主题）
    this.unloadOtherThemes()

    // 如果主题有CSS文件，则加载CSS
    if (theme.cssPath) {
      try {
        await this.loadThemeCSS(normalizedTheme, theme.cssPath)
      } catch (error) {
        console.error(`Failed to load CSS for theme "${normalizedTheme}":`, error)
      }
    }

    // 应用主题
    this.applyTheme(normalizedTheme)
  }

  /**
   * 加载主题CSS文件
   */
  private async loadThemeCSS(themeName: string, cssPath: string): Promise<void> {
    if (this.loadedLinks.has(themeName)) {
      return
    }

    try {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.type = 'text/css'
      link.href = cssPath
      link.id = `theme-${themeName}`

      await new Promise<void>((resolve, reject) => {
        link.onload = () => {
          this.loadedLinks.set(themeName, link)
          this.themes.get(themeName)!.isLoaded = true
          resolve()
        }
        link.onerror = () => {
          reject(new Error(`Failed to load theme CSS: ${cssPath}`))
        }
      })

      document.head.appendChild(link)
    } catch (error) {
      console.error(`Error loading theme "${themeName}":`, error)
      throw error
    }
  }

  /**
   * 应用主题到DOM
   */
  private applyTheme(themeName: string): void {
    const { resolvedTheme } = applyDocumentThemeChrome(themeName)

    this.currentTheme = themeName

    this.dispatchThemeChangeEvent(resolvedTheme)
  }

  /**
   * 卸载主题CSS
   */
  unloadTheme(themeName: string): void {
    const theme = this.themes.get(themeName)
    if (!theme) return

    const link = this.loadedLinks.get(themeName)
    if (link) {
      link.remove()
      this.loadedLinks.delete(themeName)
      theme.isLoaded = false
    }
  }

  /**
   * 卸载所有主题CSS（除了当前主题）
   */
  unloadOtherThemes(): void {
    for (const [themeName] of this.themes) {
      if (themeName !== this.currentTheme && this.themes.get(themeName)?.isLoaded) {
        this.unloadTheme(themeName)
      }
    }
  }

  /**
   * 获取已注册的主题列表
   */
  getAvailableThemes(): string[] {
    return Array.from(this.themes.keys())
  }

  /**
   * 检查主题是否已加载
   */
  isThemeLoaded(themeName: string): boolean {
    return this.themes.get(themeName)?.isLoaded || false
  }

  /**
   * 触发主题变更事件
   */
  private dispatchThemeChangeEvent(themeName: string): void {
    const event = new CustomEvent('themechange', {
      detail: { theme: themeName },
    })
    document.dispatchEvent(event)
  }

  /**
   * 监听主题变更事件
   */
  onThemeChange(callback: (theme: string) => void): void {
    if (this.themeListeners.has(callback)) {
      return
    }

    const listener: EventListener = event => {
      callback((event as CustomEvent<{ theme: string }>).detail.theme)
    }

    this.themeListeners.set(callback, listener)
    document.addEventListener('themechange', listener)
  }

  /**
   * 移除主题变更监听器
   */
  offThemeChange(callback: (theme: string) => void): void {
    const listener = this.themeListeners.get(callback)
    if (!listener) {
      return
    }

    document.removeEventListener('themechange', listener)
    this.themeListeners.delete(callback)
  }
}

// 创建单例实例
export const themeManager = new ThemeManager()

// 导出类型
export type { ThemeManager }
