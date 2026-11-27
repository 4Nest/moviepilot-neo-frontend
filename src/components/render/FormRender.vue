<script setup lang="ts">
import type { Component, VNodeChild } from 'vue'
import type { RenderProps } from '@/api/types'

type FormModel = Record<string, unknown>
type PropRecord = Record<string, unknown>
type RenderNodeConfig = Omit<RenderProps, 'props' | 'content' | 'slots' | 'html' | 'text'> & {
  props?: PropRecord
  content?: RenderNodeConfig[]
  slots?: Record<string, RenderNodeConfig | RenderNodeConfig[]>
  html?: string
  text?: string
}

// 定义 props
defineProps<{
  config: RenderProps // JSON 配置
  model: FormModel // 数据模型
}>()

const NATIVE_HTML_TAG_RE = /^[a-z][a-z0-9-]*$/

function evaluateExpression(expression: string, model: FormModel, fallback: unknown = undefined): unknown {
  try {
    return new Function('model', `with(model) { return (${expression}) }`)(model)
  } catch (error) {
    console.error('表单表达式求值错误:', error)
    return fallback
  }
}

/**
 * 解析属性，支持 v-model 和动态绑定
 */
const parseProps = (rawProps: PropRecord, model: FormModel): PropRecord => {
  const parsedProps: PropRecord = {}
  let hiddenByShow = false

  const isExpression = (value: string) => value.startsWith('{{') && value.endsWith('}}')
  const extractExpression = (value: string) => value.slice(2, -2).trim()

  for (const [key, value] of Object.entries(rawProps)) {
    if (key === 'modelvalue' && typeof value === 'string') {
      parsedProps['value'] = model[value]
      parsedProps['onUpdate:value'] = (newValue: unknown) => {
        model[value] = newValue
      }
    } else if (['model', 'v-model'].includes(key) && typeof value === 'string') {
      parsedProps['modelValue'] = model[value]
      parsedProps['onUpdate:modelValue'] = (newValue: unknown) => {
        model[value] = newValue
      }
    } else if (['show', 'v-show'].includes(key)) {
      const expression = typeof value === 'string' && isExpression(value) ? extractExpression(value) : String(value)
      const isVisible = typeof value === 'boolean' ? value : Boolean(evaluateExpression(expression, model, true))
      const currentStyle =
        parsedProps.style && typeof parsedProps.style === 'object' ? (parsedProps.style as Record<string, string>) : {}
      currentStyle.display = isVisible ? '' : 'none'
      parsedProps.style = currentStyle
      if (!isVisible) {
        hiddenByShow = true
      }
    } else if ((key.startsWith('model:') || key.startsWith('v-model:')) && typeof value === 'string') {
      const propName = key.split(':')[1]
      parsedProps[propName] = model[value]
      parsedProps[`onUpdate:${propName}`] = (newValue: unknown) => {
        model[value] = newValue
      }
    } else if (key.startsWith('on')) {
      if (typeof value === 'string') {
        try {
          const handler = new Function(
            'model',
            'event',
            `
              try {
                with(model) {
                  return (${value})(event);
                }
              } catch(e) {
                console.error('事件处理函数执行错误:', e);
              }
            `,
          )
          parsedProps[key] = (...args: unknown[]) => {
            const [event] = args
            return handler(model, event)
          }
        } catch (error) {
          console.error('事件处理函数编译错误:', error)
        }
      } else if (typeof value === 'function') {
        parsedProps[key] = value
      }
    } else {
      // 仅对显式 {{ ... }} 表达式求值，保留普通静态字符串属性不被同名 model 键误替换
      if (typeof value === 'string' && isExpression(value)) {
        const expression = extractExpression(value)
        parsedProps[key] = evaluateExpression(expression, model, undefined)
      } else {
        parsedProps[key] = value
      }
    }
  }

  // 防止 Vuetify 的 .d-flex (!important) 覆盖内联 display: none
  if (hiddenByShow) {
    const rawClass = parsedProps.class
    if (typeof rawClass === 'string') {
      const filtered = rawClass
        .split(/\s+/)
        .filter(token => token && token !== 'd-flex')
      parsedProps.class = [...filtered, 'd-none'].join(' ')
    } else if (Array.isArray(rawClass)) {
      parsedProps.class = [...rawClass.filter(token => token !== 'd-flex'), 'd-none']
    } else {
      parsedProps.class = 'd-none'
    }
  }

  return parsedProps
}

/**
 * 渲染插槽内容
 */
const renderSlotContent = (
  slotContent: RenderNodeConfig | RenderNodeConfig[],
  model: FormModel,
  slotScope: PropRecord,
): VNodeChild => {
  if (Array.isArray(slotContent)) {
    return slotContent.map(childConfig => renderComponent(childConfig, model, slotScope))
  }
  return renderComponent(slotContent, model, slotScope)
}

/**
 * 渲染组件函数（递归支持嵌套）
 */
const renderComponent = (config: RenderNodeConfig, model: FormModel, slotScope: PropRecord = {}): VNodeChild => {
  const { component, props: componentProps = {}, content = [], slots = {}, html, text } = config

  // 动态解析组件（原生 HTML 小写标签直接透传，避免 resolveComponent 告警）
  const resolved =
    typeof component === 'string' && NATIVE_HTML_TAG_RE.test(component)
      ? component
      : (resolveComponent(component) as Component | string)

  const parsedProps = parseProps(componentProps, model)

  // 如果配置了 `html`，直接在当前组件上设置 innerHTML，避免双层 h(Component) 自嵌套
  if (html) {
    const htmlContent = typeof html === 'string' ? html : String(model[html] ?? '')
    return h(resolved as Component, { ...parsedProps, innerHTML: htmlContent })
  }

  const slotNodes: Record<string, (slotScopeData?: PropRecord) => VNodeChild> = {}
  for (const [slotName, slotContent] of Object.entries(slots)) {
    slotNodes[slotName] = (slotScopeData: PropRecord = {}) =>
      renderSlotContent(slotContent, model, { ...slotScope, ...slotScopeData })
  }

  const renderContent = (): VNodeChild => {
    if (text) {
      return typeof text === 'string' ? text : String(model[text] ?? '')
    }
    if (Array.isArray(content)) {
      return content.map(childConfig => renderComponent(childConfig, model, slotScope))
    }
    return null
  }

  if (typeof resolved === 'string') {
    return h(resolved, parsedProps, renderContent() ?? undefined)
  }

  return h(resolved, parsedProps, {
    ...slotNodes,
    default: renderContent,
  })
}
</script>

<template>
  <Component :is="renderComponent(config as RenderNodeConfig, model)" />
</template>

<style lang="scss" scoped>
.d-flex > :deep(.v-img[style*='width']:not([style*='width: 100%'])),
:deep(:is(.d-flex, .v-list-item__prepend, .v-card-item__prepend) > .v-img[style*='width']:not([style*='width: 100%'])) {
  flex: 0 0 auto;
}
</style>
