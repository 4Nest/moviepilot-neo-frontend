import type { TransferDirectoryConf } from '@/api/types'
import {
  buildDownloadDirectoryOptions,
  filterDownloadDirectoryOption,
  toDownloadDirectoryValue,
  toDownloadPath,
  toDownloadSavePath,
} from '@/utils/downloadDirectory'
import { describe, expect, it } from 'vitest'

function dir(overrides: Partial<TransferDirectoryConf> = {}): TransferDirectoryConf {
  return {
    download_path: '/downloads',
    name: '目录',
    priority: 0,
    storage: 'local',
    transfer_type: 'link',
    ...overrides,
  }
}

describe('toDownloadSavePath', () => {
  it.each([
    [dir({ download_path: '/a' }), '/a'],
    [dir({ download_path: '/a', storage: undefined as unknown as string }), '/a'],
    [dir({ download_path: '/a', storage: null as unknown as string }), '/a'],
    [dir({ download_path: '/a', storage: 'rclone' }), 'rclone:/a'],
    [dir({ download_path: '/a', storage: '' }), ':/a'],
    [dir({ download_path: undefined }), undefined],
    [dir({ download_path: '' }), undefined],
  ])('转换 %j', (item, expected) => {
    expect(toDownloadSavePath(item)).toBe(expected)
  })
})

describe('toDownloadPath', () => {
  it('去除首尾空白且忽略空路径', () => {
    expect(toDownloadPath(dir({ download_path: ' /a ' }))).toBe('/a')
    expect(toDownloadPath(dir({ download_path: '  ' }))).toBeUndefined()
    expect(toDownloadPath(dir({ download_path: undefined }))).toBeUndefined()
  })
})

describe('buildDownloadDirectoryOptions', () => {
  it('显示「别名 (路径)」，无别名只显示路径，值始终是路径', () => {
    const options = buildDownloadDirectoryOptions(
      [dir({ download_path: '/movies', name: '电影' }), dir({ download_path: '/misc', name: '  ' })],
      toDownloadSavePath,
    )
    expect(options).toEqual([
      { title: '/movies', value: '/movies', label: '电影 (/movies)' },
      { title: '/misc', value: '/misc', label: '/misc' },
    ])
  })

  it('同路径去重并合并别名，保持后端优先顺序', () => {
    const options = buildDownloadDirectoryOptions(
      [
        dir({ download_path: '/b', name: 'B1' }),
        dir({ download_path: '/a', name: 'A' }),
        dir({ download_path: '/b', name: 'B2' }),
        dir({ download_path: '/b', name: 'B1' }),
        dir({ download_path: undefined, name: '无路径' }),
      ],
      toDownloadSavePath,
    )
    expect(options.map(item => item.value)).toEqual(['/b', '/a'])
    expect(options[0].label).toBe('B1 / B2 (/b)')
  })

  it('别名与路径相同时不重复显示，远端路径带存储前缀', () => {
    const options = buildDownloadDirectoryOptions(
      [dir({ download_path: '/x', name: '/x' }), dir({ download_path: '/r', name: '远端', storage: 'rclone' })],
      toDownloadSavePath,
    )
    expect(options.map(item => item.label)).toEqual(['/x', '远端 (rclone:/r)'])
    expect(options[1].value).toBe('rclone:/r')
  })

  it('空列表返回空选项', () => {
    expect(buildDownloadDirectoryOptions([], toDownloadSavePath)).toEqual([])
  })
})

describe('toDownloadDirectoryValue', () => {
  it('选项对象取路径，字符串原样返回，清空返回 null', () => {
    expect(toDownloadDirectoryValue({ title: '/a', value: '/a', label: '电影 (/a)' })).toBe('/a')
    expect(toDownloadDirectoryValue('/a/sub')).toBe('/a/sub')
    expect(toDownloadDirectoryValue('')).toBeNull()
    expect(toDownloadDirectoryValue(null)).toBeNull()
    expect(toDownloadDirectoryValue(undefined)).toBeNull()
    expect(toDownloadDirectoryValue({ title: 'x' })).toBeNull()
  })
})

describe('filterDownloadDirectoryOption', () => {
  const [option] = buildDownloadDirectoryOptions(
    [dir({ download_path: '/movies', name: '电影库' })],
    toDownloadSavePath,
  )
  const item = { raw: option }

  it('按别名或路径片段匹配，忽略大小写', () => {
    expect(filterDownloadDirectoryOption('/movies', '电影', item)).toBe(true)
    expect(filterDownloadDirectoryOption('/movies', 'MOV', item)).toBe(true)
    expect(filterDownloadDirectoryOption('/movies', '动漫', item)).toBe(false)
  })

  it('没有选项对象时回退到按值匹配', () => {
    expect(filterDownloadDirectoryOption('/custom/path', 'custom')).toBe(true)
    expect(filterDownloadDirectoryOption('/custom/path', 'nope')).toBe(false)
  })
})
