import { defineAsyncComponent, defineComponent, h, shallowRef, watch, type Component, type WatchSource } from 'vue'
import RemoteComponentError from '@/components/misc/RemoteComponentError.vue'
import RemoteComponentLoading from '@/components/misc/RemoteComponentLoading.vue'

interface RetryableRemoteComponentOptions {
  /** 重试前清理宿主缓存的加载 Promise。 */
  beforeRetry?: () => void
  /** 远程组件身份变化时自动创建新的异步包装器。 */
  identity?: WatchSource
}

/** 为联邦组件提供加载超时和原地重试，重新创建包装器以清除 Vue 的失败状态。 */
export function useRetryableRemoteComponent(
  loader: () => Promise<Component>,
  options: RetryableRemoteComponentOptions = {},
) {
  /** 用户重试时保留宿主弹窗及业务状态，只重新加载远程组件。 */
  function retry() {
    options.beforeRetry?.()
    component.value = createComponent()
  }

  /** 每次加载使用独立错误态，超时后仍允许迟到的成功结果正常显示。 */
  function createComponent() {
    return defineAsyncComponent({
      loader,
      loadingComponent: RemoteComponentLoading,
      errorComponent: defineComponent({
        setup: () => () => h(RemoteComponentError, { onRetry: retry }),
      }),
      timeout: 20000,
    })
  }

  const component = shallowRef<Component>(createComponent())
  if (options.identity) watch(options.identity, retry)
  return component
}
