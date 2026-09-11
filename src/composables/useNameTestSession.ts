interface NameTestForm {
  customWords: string | null
  subtitle: string | null
  title: string | null
}

// 识别测试表单会话状态：弹窗关闭重开后保留上次编辑内容（仅当前页面会话，不落盘）
const nameTestForm = reactive<NameTestForm>({
  title: null,
  subtitle: null,
  customWords: null,
})

/** 返回跨弹窗开关共享的识别测试表单。 */
export function useNameTestSession() {
  return nameTestForm
}

/** 清空识别测试表单（测试隔离用）。 */
export function resetNameTestSession() {
  nameTestForm.title = null
  nameTestForm.subtitle = null
  nameTestForm.customWords = null
}
