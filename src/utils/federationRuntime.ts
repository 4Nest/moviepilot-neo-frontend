import {
  __federation_method_getRemote,
  __federation_method_setRemote,
  __federation_method_unwrapDefault,
  // @ts-expect-error -- virtual 模块由 federation 插件在开发与生产构建时提供。
} from 'virtual:__federation__'

/** 模块联邦运行时接受的远程入口配置。 */
export interface FederationRemoteConfig {
  format: 'esm'
  from: 'vite'
  url: () => Promise<string>
}

// 失败的 remote 在下次注册时以新配置覆盖 OriginJS 缓存的实例。
const failedRemotes = new Set<string>()
const remoteRetryVersions = new Map<string, number>()

/** 给远程入口附加递增版本，绕过浏览器对失败动态 import 的模块缓存。 */
function withRemoteRetryVersion(url: string, version: number): string {
  const hashIndex = url.indexOf('#')
  const base = hashIndex >= 0 ? url.slice(0, hashIndex) : url
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : ''
  return `${base}${base.includes('?') ? '&' : '?'}__mp_retry=${version}${hash}`
}

/** 注册模块联邦远程入口。 */
export function setFederationRemote(id: string, config: FederationRemoteConfig): void {
  const retryVersion = failedRemotes.has(id) ? (remoteRetryVersions.get(id) ?? 0) + 1 : 0
  if (retryVersion > 0) {
    remoteRetryVersions.set(id, retryVersion)
    __federation_method_setRemote(id, {
      ...config,
      url: async () => withRemoteRetryVersion(await config.url(), retryVersion),
    })
  } else {
    __federation_method_setRemote(id, config)
  }
  failedRemotes.delete(id)
}

/** 从已注册远程入口加载指定 expose；失败状态由后续重新注册消费。 */
export async function getFederationRemote(id: string, componentName: string): Promise<unknown> {
  try {
    const module = await __federation_method_getRemote(id, componentName)
    failedRemotes.delete(id)
    return module
  } catch (error) {
    failedRemotes.add(id)
    throw error
  }
}

/** 解包默认导出；具体类型由各 expose 的宿主契约决定。 */
export function unwrapFederationDefault(module: unknown) {
  return __federation_method_unwrapDefault(module)
}
