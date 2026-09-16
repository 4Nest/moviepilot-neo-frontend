export interface authState {
  // 用户令牌
  token: string | null
  // 记住我
  remember: boolean
  // 原始路径
  originalPath?: string | null
}

export interface userState {
  userID: number
  userName: string
  avatar: string
  level: number
  wizard: boolean
}

export interface globalSettingsState {
  // 全局设置数据
  data: { [key: string]: any }
  // 是否已初始化
  initialized: boolean
  // 是否正在加载
  loading: boolean
}
