import { defineStore } from 'pinia'
import type { userState } from '@/stores/types'

export const useUserStore = defineStore('user', {
  state: (): userState => ({
    userID: -1,
    userName: '',
    avatar: '',
    level: 1,
    wizard: false,
  }),
  persist: true,
  actions: {
    setUserID(userID: number) { this.userID = userID },
    setUserName(userName: string) { this.userName = userName },
    setAvatar(avatar: string) { this.avatar = avatar },
    setLevel(level: number) { this.level = level },
    setWizard(wizard: boolean) { this.wizard = wizard },
    loginUser(payload: userState) {
      this.setUserID(payload.userID)
      this.setUserName(payload.userName)
      this.setAvatar(payload.avatar)
      this.setLevel(payload.level)
      this.setWizard(payload.wizard)
    },
    reset() {
      this.setUserID(-1)
      this.setUserName('')
      this.setAvatar('')
      this.setLevel(1)
      this.setWizard(false)
    },
  },
  getters: {
    getUserID: state => state.userID,
    getUserName: state => state.userName,
    getAvatar: state => state.avatar,
    getLevel: state => state.level,
    getWizard: state => state.wizard,
  },
})
