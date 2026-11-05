import { defineStore } from 'pinia'
import type { authState } from '@/stores/types'
import { usePluginSidebarNavStore } from '@/stores/pluginSidebarNav'
import { clearCachedMediaSubscribeStatuses } from '@/utils/mediaStatusCache'
import { revokeNativeNotificationBinding } from '@/native/notifications'

export const useAuthStore = defineStore('auth', {
  state: (): authState => ({
    token: null,
    remember: false,
    originalPath: null,
  }),

  // 全局持久化
  persist: true,

  actions: {
    setToken(token: string | null) {
      this.token = token
    },
    clearToken() {
      this.token = null
    },
    setRemember(remember: boolean) {
      this.remember = remember
    },
    setOriginalPath(originalPath: string | null) {
      this.originalPath = originalPath
    },
    login(payload: authState) {
      this.setToken(payload.token)
      this.setRemember(payload.remember)
    },
    /** 重启或认证失效时清理会话与账号缓存，保留独立于登录态的通知绑定。 */
    resetSession() {
      this.clearToken()
      this.setOriginalPath(null)
      clearCachedMediaSubscribeStatuses()
      usePluginSidebarNavStore().reset()
    },
    /** 用户主动退出时先撤销本机及配对网页通知，再清理当前登录会话。 */
    logout() {
      revokeNativeNotificationBinding(this.token)
      this.resetSession()
    },
  },

  getters: {
    getToken: state => state.token,
    getRemember: state => state.remember,
    getOriginalPath: state => state.originalPath,
  },
})
