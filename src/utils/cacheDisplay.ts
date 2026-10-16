/** 将站点描述转换为纯文本；在惰性模板中解析，避免执行脚本或加载外部资源。 */
export function getCacheDescriptionText(description?: string): string {
  if (!description) return ''
  const template = document.createElement('template')
  template.innerHTML = description
  template.content.querySelectorAll('script, style, template, noscript').forEach(element => element.remove())
  template.content.querySelectorAll('br, p, div, li, tr, td, th, h1, h2, h3, h4, h5, h6, hr').forEach(element => {
    element.before(' ')
    element.after(' ')
  })
  return (template.content.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** 将历史识别缓存键转换为查询摘要，保留片名中的连字符和方括号。 */
export function getRecognitionQueryText(key: string): string {
  const match = /^\[(电影|电视剧|未知)\]\[[^\]]+\](.+)-(\d{4}|None|)-(\d+|None|)$/.exec(key)
  if (!match) return key
  const [, mediaType, name, year, season] = match
  return [
    name,
    year && year !== 'None' ? year : '',
    season && season !== 'None' ? `第${Number(season)}季` : '',
    mediaType === '未知' ? '' : mediaType,
  ]
    .filter(Boolean)
    .join(' · ')
}
