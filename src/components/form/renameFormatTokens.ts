// 重命名格式 token 模型：jinja 格式 ↔ 字段流 token 的解析、序列化与预览求值

export interface RenameToken {
  type: 'field' | 'text'
  value: string
  /** 完整 jinja 表达式（含 {{}}，如 {{(season|string).zfill(2)}}），简单字段为空 */
  expr?: string
  /** 可选块条件变量（来自 {% if cond %}），空表示必选 */
  cond?: string
}

/** 解析不含 if 的片段为 token（可选块内部用），支持 {{...}} 任意表达式 */
function parseInnerTokens(fragment: string, cond?: string): RenameToken[] {
  const tokens: RenameToken[] = []
  const re = /\{\{([^{}]*)\}\}/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(fragment))) {
    if (match.index > last) tokens.push({ type: 'text', value: fragment.slice(last, match.index), cond })
    const raw = match[0]
    const body = match[1].trim()
    // 简单变量名：常规字段 token
    if (/^\w+$/.test(body)) {
      tokens.push({ type: 'field', value: body, cond })
    } else {
      // 表达式（过滤器/括号/方法）：提取根变量名作为展示标签
      const root = body.match(/\b(\w+)\b/)?.[1] ?? body
      tokens.push({ type: 'field', value: root, expr: raw, cond })
    }
    last = re.lastIndex
  }
  if (last < fragment.length) tokens.push({ type: 'text', value: fragment.slice(last), cond })
  return tokens
}

/** 把 jinja 格式解析为字段流 token */
export function parseFormat(fmt: string): RenameToken[] {
  const tokens: RenameToken[] = []
  const ifRe = /\{%\s*if\s+(\w+)\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = ifRe.exec(fmt))) {
    if (match.index > last) tokens.push(...parseInnerTokens(fmt.slice(last, match.index)))
    tokens.push(...parseInnerTokens(match[2], match[1]))
    last = ifRe.lastIndex
  }
  if (last < fmt.length) tokens.push(...parseInnerTokens(fmt.slice(last)))
  return tokens.filter(token => token.type === 'field' || token.value !== '')
}

/** 字段流序列化回 jinja 格式 */
export function serializeTokens(tokens: RenameToken[]): string {
  const parts: string[] = []
  let i = 0
  while (i < tokens.length) {
    const token = tokens[i]
    if (token.cond) {
      // 收集同一条件的连续 token 为一个 if 块
      const group: RenameToken[] = []
      while (i < tokens.length && tokens[i].cond === token.cond) {
        group.push(tokens[i])
        i++
      }
      const inner = group
        .map(item => (item.type === 'field' ? (item.expr ?? `{{${item.value}}}`) : item.value))
        .join('')
      parts.push(`{% if ${token.cond} %}${inner}{% endif %}`)
    } else {
      parts.push(token.type === 'field' ? (token.expr ?? `{{${token.value}}}`) : token.value)
      i++
    }
  }
  return parts.join('')
}


/** 求值 jinja 表达式（支持根变量 + 常见过滤器链），用于预览 */
export function evalExpr(rawExpr: string, data: Record<string, string>): string {
  let body = rawExpr.replace(/^\{\{|\}\}$/g, '').trim()

  // 展开分组括号（函数调用的参数括号不展开）：(season|string).zfill(2) → season|string.zfill(2)
  let prev = ''
  while (prev !== body) {
    prev = body
    body = body.replace(/(?<![\w])\(([^()]*)\)/g, '$1')
  }

  // 方法调用转过滤器链：string.zfill(2) → string|zfill(2)
  body = body.replace(/\.(\w+)\(/g, '|$1(')

  // 拆过滤器链：根 |filter1 |filter2
  const segments = body.split('|').map(segment => segment.trim())
  let value: string = data[segments[0]] ?? ''

  for (const filter of segments.slice(1)) {
    const zfill = filter.match(/^zfill\((\d+)\)$/)
    if (zfill) {
      value = value.padStart(Number(zfill[1]), '0')
      continue
    }
    if (filter === 'string') continue
    if (filter === 'int') {
      value = String(parseInt(value, 10) || 0)
      continue
    }
    if (filter === 'upper') {
      value = value.toUpperCase()
      continue
    }
    if (filter === 'lower') {
      value = value.toLowerCase()
      continue
    }
    const def = filter.match(/^default\((.+)\)$/) || filter.match(/^d\((.+)\)$/)
    if (def) {
      if (!value) value = def[1].replace(/^['"]|['"]$/g, '')
      continue
    }
    const rep = filter.match(/^replace\(['"](.*?)['"],\s*['"](.*?)['"]\)$/)
    if (rep) {
      value = value.split(rep[1]).join(rep[2])
      continue
    }
  }
  return value
}
