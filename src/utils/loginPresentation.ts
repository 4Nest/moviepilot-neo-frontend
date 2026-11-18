export type LoginVisualProfile = 'dark' | 'light'

const legacyDarkThemes = new Set(['glass', 'purple', 'transparent'])

/** 将当前主题名称收敛为登录工作台的明暗视觉档位。 */
export function getLoginVisualProfile(themeName: string | null | undefined): LoginVisualProfile {
  if (themeName === 'light' || themeName === 'default') {
    return 'light'
  }
  if (themeName === 'dark' || legacyDarkThemes.has(themeName || '')) {
    return 'dark'
  }
  return 'dark'
}
