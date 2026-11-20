/** 文件管理器快捷目录项 */
export interface QuickDirectoryItem {
  /** 目录类型：下载目录或媒体库目录 */
  kind: 'download' | 'library'
  /** 目录别名 */
  name: string
  /** 规范化后的目录路径（以 / 结尾） */
  path: string
}

/**
 * 规范化目录路径：统一分隔符、合并重复斜杠并补齐末尾斜杠。
 * 空字符串或纯空白返回空字符串。
 */
export function normalizeDirectoryPath(rawPath: string): string {
  const trimmed = rawPath.trim()
  if (!trimmed) return ''

  let normalized = trimmed.replace(/\\/g, '/').replace(/\/{2,}/g, '/')

  // 非 Windows 盘符路径统一补齐前导斜杠
  if (!normalized.includes(':') && !normalized.startsWith('/')) {
    normalized = `/${normalized}`
  }

  if (!normalized.endsWith('/')) {
    normalized += '/'
  }

  return normalized
}

/** 提取路径末级名称，根目录返回 '/' */
export function getPathDisplayName(path: string): string {
  if (!path || path === '/') return '/'
  return path.split('/').filter(Boolean).pop() ?? '/'
}
