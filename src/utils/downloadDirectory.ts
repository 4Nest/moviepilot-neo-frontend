import type { TransferDirectoryConf } from '@/api/types'

/** 保存目录下拉项：value 与 title 始终是路径，label 仅用于列表展示。 */
export interface DownloadDirectoryOption {
  title: string
  value: string
  label: string
}

/** 将下载目录配置转换为下载接口可识别的 save_path（非本地存储带 `存储:` 前缀）。 */
export function toDownloadSavePath(item: TransferDirectoryConf): string | undefined {
  if (!item.download_path) return undefined
  // storage 缺省是受支持的本地目录配置，不能生成 undefined/null 前缀。
  if (item.storage === undefined || item.storage === null || item.storage === 'local') return item.download_path
  return `${item.storage}:${item.download_path}`
}

/** 订阅沿用历史的纯下载路径格式，不带存储前缀。 */
export function toDownloadPath(item: TransferDirectoryConf): string | undefined {
  return item.download_path?.trim() || undefined
}

/** 构造「别名 (路径)」下拉项：按路径去重并保持后端顺序，同路径的多个别名合并，无别名只显示路径。 */
export function buildDownloadDirectoryOptions(
  directories: TransferDirectoryConf[],
  toPath: (item: TransferDirectoryConf) => string | undefined,
): DownloadDirectoryOption[] {
  const aliasesByPath = new Map<string, string[]>()
  for (const item of directories) {
    const path = toPath(item)
    if (!path) continue
    const aliases = aliasesByPath.get(path) ?? []
    const alias = item.name?.trim()
    if (alias && alias !== path && !aliases.includes(alias)) aliases.push(alias)
    aliasesByPath.set(path, aliases)
  }
  return [...aliasesByPath].map(([path, aliases]) => ({
    title: path,
    value: path,
    label: aliases.length ? `${aliases.join(' / ')} (${path})` : path,
  }))
}

/** 将 VCombobox 回传的选项对象或自由输入字符串归一为路径；清空时返回 null。 */
export function toDownloadDirectoryValue(value: unknown): string | null {
  const path = typeof value === 'object' && value !== null ? (value as { value?: unknown }).value : value
  return typeof path === 'string' && path !== '' ? path : null
}

/** 按「别名 (路径)」标签过滤，输入别名片段也能筛出目录；自由输入的路径回退到按路径匹配。 */
export function filterDownloadDirectoryOption(value: unknown, query: string, item?: unknown): boolean {
  const raw = (item as { raw?: Partial<DownloadDirectoryOption> } | undefined)?.raw
  const text = raw?.label ?? (typeof value === 'string' ? value : '')
  return text.toLocaleLowerCase().includes(String(query ?? '').toLocaleLowerCase())
}
