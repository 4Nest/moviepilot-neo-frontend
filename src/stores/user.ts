import { defineStore } from 'pinia'
import type { userState } from '@/stores/types'

export const useUserStore = defineStore('user', {
  state: (): Required<userState> => ({
    superUser: true,
    userID: -1,
    userName: '',
    avatar: '',
    level: 1,
    wizard: false,
    permissions: {},
  }),
  persist: true,
  actions: {
    setSuperUser(superUser = true) {
      this.superUser = superUser
    },
    setUserID(userID: number) {
      this.userID = userID
    },
    setUserName(userName: string) {
      this.userName = userName
    },
    setAvatar(avatar: string) {
      this.avatar = avatar
    },
    setLevel(level: number) {
      this.level = level
    },
    setWizard(wizard: boolean) {
      this.wizard = wizard
    },
    setPermissions(permissions: Record<string, unknown> = {}) {
      this.permissions = { ...permissions }
    },
    loginUser(payload: userState) {
      this.setSuperUser(payload.superUser ?? true)
      this.setUserID(payload.userID)
      this.setUserName(payload.userName)
      this.setAvatar(payload.avatar)
      this.setLevel(payload.level)
      this.setWizard(payload.wizard)
      this.setPermissions(payload.permissions ?? {})
    },
    reset() {
      this.setSuperUser(true)
      this.setUserID(-1)
      this.setUserName('')
      this.setAvatar('')
      this.setLevel(1)
      this.setWizard(false)
      this.setPermissions({})
    },
  },
  getters: {
    getSuperUser: state => state.superUser,
    getUserID: state => state.userID,
    getUserName: state => state.userName,
    getAvatar: state => state.avatar,
    getLevel: state => state.level,
    getWizard: state => state.wizard,
    getPermissions: state => state.permissions,
  },
})
