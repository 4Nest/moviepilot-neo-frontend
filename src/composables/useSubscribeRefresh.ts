import { readonly, ref } from 'vue'

const revision = ref(0)

/** 通知订阅列表重新查询服务端，避免跨页面新增后继续展示旧列表。 */
export function notifySubscribeChanged() {
  revision.value += 1
}

/** 提供订阅变更版本；隐藏页面重新激活时仍按既有机制刷新。 */
export function useSubscribeRefresh() {
  return readonly(revision)
}
