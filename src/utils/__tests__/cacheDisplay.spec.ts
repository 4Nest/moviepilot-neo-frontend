import { getCacheDescriptionText, getRecognitionQueryText } from '@/utils/cacheDisplay'
import { describe, expect, it } from 'vitest'

describe('缓存展示文本', () => {
  it('提取站点 HTML 的文字、解码实体并保留段落间隔', () => {
    expect(getCacheDescriptionText('<p><strong>片名</strong><br>第 12 集</p><p>简&amp;繁字幕&nbsp;1080p</p>')).toBe(
      '片名 第 12 集 简&繁字幕 1080p',
    )
  })

  it('移除脚本和样式内容，不将图片或事件属性挂载到页面', () => {
    expect(
      getCacheDescriptionText(
        '<script>throw Error("执行")</script><style>.hidden{display:none}</style><img src="https://invalid.test/image" onerror="alert(1)"><p>简介</p>',
      ),
    ).toBe('简介')
    expect(document.querySelector('img[src="https://invalid.test/image"]')).toBeNull()
  })

  it.each([undefined, ''])('空描述返回空文本 %s', description => {
    expect(getCacheDescriptionText(description)).toBe('')
  })

  it.each([
    ['[未知][zh]10 Years-2012-None', '10 Years · 2012'],
    ['[电视剧][zh-CN]Spider-Man [2024]-2025-1', 'Spider-Man [2024] · 2025 · 第1季 · 电视剧'],
    ['[电影][zh-TW]1917-2019-None', '1917 · 2019 · 电影'],
    ['[未知][zh]片名-None-None', '片名'],
    ['[电视剧][en]Special-None-0', 'Special · 第0季 · 电视剧'],
    ['[未知][zh]标题--None', '标题'],
    ['历史自定义缓存键', '历史自定义缓存键'],
  ])('展示可读识别请求 %s', (key, expected) => {
    expect(getRecognitionQueryText(key)).toBe(expected)
  })
})
