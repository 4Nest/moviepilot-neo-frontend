type SiteIconCacheEntry = {
  expiresAt: number
  value: string
}

const SITE_ICON_CACHE_TTL = 10 * 60 * 1000
const siteIconCache = new Map<string, SiteIconCacheEntry>()
const siteIconRequests = new Map<string, Promise<string>>()
const siteIconGenerations = new Map<string, number>()

function invalidateSiteIcon(key: string) {
  siteIconGenerations.set(key, (siteIconGenerations.get(key) ?? 0) + 1)
  siteIconCache.delete(key)
  siteIconRequests.delete(key)
}

/** 清除指定站点的图标缓存；缺省时清空全部站点，进行中的旧请求也不能回写。 */
export function clearSiteIconCache(siteId?: string | number) {
  if (siteId !== undefined) {
    invalidateSiteIcon(String(siteId))
    return
  }

  const keys = new Set([...siteIconCache.keys(), ...siteIconRequests.keys()])
  keys.forEach(invalidateSiteIcon)
  siteIconCache.clear()
  siteIconRequests.clear()
}

function readCachedSiteIcon(key: string): string | undefined {
  const entry = siteIconCache.get(key)
  if (!entry) {
    return undefined
  }

  if (entry.expiresAt <= Date.now()) {
    siteIconCache.delete(key)
    return undefined
  }

  return entry.value
}

export async function getCachedSiteIcon(
  siteId: string | number,
  loader: () => Promise<string>,
  fallbackIcon?: string,
): Promise<string> {
  const cacheKey = String(siteId)
  const cachedIcon = readCachedSiteIcon(cacheKey)
  if (cachedIcon !== undefined) {
    return cachedIcon
  }

  const currentRequest = siteIconRequests.get(cacheKey)
  if (currentRequest) {
    return currentRequest
  }

  const generation = siteIconGenerations.get(cacheKey) ?? 0
  const request = loader()
    .then(icon => {
      // 空图标和默认占位图可能表示站点图标尚未就绪，不能用长缓存阻止后续重试。
      if (icon && icon !== fallbackIcon && (siteIconGenerations.get(cacheKey) ?? 0) === generation) {
        siteIconCache.set(cacheKey, {
          expiresAt: Date.now() + SITE_ICON_CACHE_TTL,
          value: icon,
        })
      }

      return icon
    })
    .finally(() => {
      if (siteIconRequests.get(cacheKey) === request) siteIconRequests.delete(cacheKey)
    })

  siteIconRequests.set(cacheKey, request)

  return request
}
