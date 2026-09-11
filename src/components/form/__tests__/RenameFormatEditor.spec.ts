import { evalExpr, parseFormat, serializeTokens } from '@/components/form/renameFormatTokens'
import { describe, expect, it } from 'vitest'

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
