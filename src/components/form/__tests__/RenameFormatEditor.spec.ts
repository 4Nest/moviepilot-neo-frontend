import RenameFormatEditor from '@/components/form/RenameFormatEditor.vue'
import {
  evalExpr,
  exprBody,
  parseFormat,
  replaceTokenField,
  serializeTokens,
  setTokenExpr,
} from '@/components/form/renameFormatTokens'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen, within } from '@testing-library/vue'
import { describe, expect, it, vi } from 'vitest'

vi.mock('vue3-ace-editor', () => ({ VAceEditor: { name: 'VAceEditor', render: () => null } }))

describe('rename format token parser', () => {
  it('round-trips the default movie format', () => {
    const fmt =
      '{{title}}{% if year %} ({{year}}){% endif %}/{{title}}{% if year %} ({{year}}){% endif %}{% if part %}-{{part}}{% endif %}{% if videoFormat %} - {{videoFormat}}{% endif %}{{fileExt}}'
    expect(serializeTokens(parseFormat(fmt))).toBe(fmt)
  })

  it('round-trips the default tv format', () => {
    const fmt =
      '{{title}}{% if year %} ({{year}}){% endif %}/Season {{season}}/{{title}} - {{season_episode}}{% if part %}-{{part}}{% endif %}{% if episode %} - 第 {{episode}} 集{% endif %}{{fileExt}}'
    expect(serializeTokens(parseFormat(fmt))).toBe(fmt)
  })

  it('parses mixed text, fields and optional blocks', () => {
    const tokens = parseFormat('{{title}} - {% if year %}({{year}}){% endif %}.mkv')
    expect(tokens).toEqual([
      { type: 'field', value: 'title', expr: undefined, cond: undefined },
      { type: 'text', value: ' - ', expr: undefined, cond: undefined },
      { type: 'text', value: '(', expr: undefined, cond: 'year' },
      { type: 'field', value: 'year', expr: undefined, cond: 'year' },
      { type: 'text', value: ')', expr: undefined, cond: 'year' },
      { type: 'text', value: '.mkv', expr: undefined, cond: undefined },
    ])
  })

  it('appending and removing tokens keeps serialization stable', () => {
    const tokens = parseFormat('{{title}}')
    tokens.push({ type: 'text', value: ' - ' })
    tokens.push({ type: 'field', value: 'videoFormat' })
    expect(serializeTokens(tokens)).toBe('{{title}} - {{videoFormat}}')
    tokens.splice(1, 1)
    expect(serializeTokens(tokens)).toBe('{{title}}{{videoFormat}}')
  })
})

describe('expression support', () => {
  it('parses filter expressions as field tokens with expr preserved', () => {
    const fmt = '{{title}}/{% if season %}Season {{(season|string).zfill(2)}}/{% endif %}{{fileExt}}'
    const tokens = parseFormat(fmt)
    const exprToken = tokens.find(token => token.expr)
    expect(exprToken).toBeDefined()
    expect(exprToken?.value).toBe('season')
    expect(exprToken?.cond).toBe('season')
    expect(serializeTokens(tokens)).toBe(fmt)
  })

  it('evaluates root variables and common filters for preview', () => {
    const data = { season: '1', title: 'test' }
    expect(evalExpr('{{(season|string).zfill(2)}}', data)).toBe('01')
    expect(evalExpr('{{season|zfill(3)}}', data)).toBe('001')
    expect(evalExpr('{{title|upper}}', data)).toBe('TEST')
    expect(evalExpr('{{title|lower}}', data)).toBe('test')
    expect(evalExpr('{{missing|default("x")}}', data)).toBe('x')
  })
})

describe('token editing', () => {
  it('replaces a field and carries its optional block condition along', () => {
    const tokens = parseFormat('{{title}}{% if year %} ({{year}}){% endif %}')
    replaceTokenField(tokens, 2, 'part')
    expect(serializeTokens(tokens)).toBe('{{title}}{% if part %} ({{part}}){% endif %}')
  })

  it('keeps an unrelated condition when replacing a field', () => {
    const tokens = parseFormat('{% if episode %} - {{episode}}{{episode_title}}{% endif %}')
    replaceTokenField(tokens, 2, 'part')
    expect(serializeTokens(tokens)).toBe('{% if episode %} - {{episode}}{{part}}{% endif %}')
  })

  it('renames the variable inside an expression when replacing a field', () => {
    const tokens = parseFormat('{{(season|string).zfill(2)}}')
    replaceTokenField(tokens, 0, 'episode')
    expect(serializeTokens(tokens)).toBe('{{(episode|string).zfill(2)}}')
  })

  it('edits an expression and falls back to a plain field when cleared', () => {
    const [token] = parseFormat('{{season}}')
    setTokenExpr(token, '(season|string).zfill(3)')
    expect(serializeTokens([token])).toBe('{{(season|string).zfill(3)}}')
    expect(exprBody(token)).toBe('(season|string).zfill(3)')
    setTokenExpr(token, '')
    expect(token.expr).toBeUndefined()
    expect(serializeTokens([token])).toBe('{{season}}')
  })
})

describe('RenameFormatEditor', () => {
  it('opens an editor when a text token is clicked and saves the edit', async () => {
    localStorage.setItem('MP_RENAME_FORMAT_MODE', 'simple')
    const { emitted, container } = await renderWithProviders(RenameFormatEditor, {
      props: { modelValue: '{{title}} - {{year}}', mediaType: 'movie' },
    })

    // 快捷文本区也有 ␣-␣，限定在字段流区域内查找
    const tokenArea = container.querySelector<HTMLElement>('.rename-format-editor__token-area')!
    await fireEvent.click(within(tokenArea).getByText('␣-␣'))
    const input = await screen.findByLabelText('文本')
    await fireEvent.update(input, ' / ')

    const updates = emitted()['update:modelValue'] as string[][]
    expect(updates.at(-1)?.[0]).toBe('{{title}} / {{year}}')
  })
})

describe('RenameFormatEditor layout', () => {
  it('frames optional blocks and splits the preview into folders', async () => {
    localStorage.setItem('MP_RENAME_FORMAT_MODE', 'simple')
    const { container } = await renderWithProviders(RenameFormatEditor, {
      props: { modelValue: '{{title}}{% if year %} ({{year}}){% endif %}/{{title}}{{fileExt}}', mediaType: 'movie' },
    })

    const groups = container.querySelectorAll('.rename-format-editor__cond-group')
    expect(groups).toHaveLength(1)
    expect(within(groups[0] as HTMLElement).getByText('有年份时')).toBeTruthy()
    expect(container.querySelectorAll('.rename-format-editor__token--separator')).toHaveLength(1)

    const segments = [...container.querySelectorAll('.rename-format-editor__preview-segment')].map(el =>
      el.textContent?.trim(),
    )
    expect(segments).toEqual(['流浪地球 (2019)', '流浪地球.mkv'])
  })

  it('inserts a quick text token with one click', async () => {
    localStorage.setItem('MP_RENAME_FORMAT_MODE', 'simple')
    const { emitted, container } = await renderWithProviders(RenameFormatEditor, {
      props: { modelValue: '{{title}}', mediaType: 'movie' },
    })

    const palette = container.querySelector<HTMLElement>('.rename-format-editor__palette')!
    await fireEvent.click(within(palette).getByText('␣-␣'))

    const updates = emitted()['update:modelValue'] as string[][]
    expect(updates.at(-1)?.[0]).toBe('{{title}} - ')
  })
})
