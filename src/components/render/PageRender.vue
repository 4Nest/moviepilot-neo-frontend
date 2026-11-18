<script lang="ts" setup>
import { isNullOrEmptyObject } from '@/@core/utils'
import api from '@/api'
import { type PropType } from 'vue'
import { RenderProps } from '@/api/types'
import { openSharedDialog } from '@/composables/useSharedDialog'

const ProgressDialog = defineAsyncComponent(() => import('../dialog/ProgressDialog.vue'))

// 定议外部事件
const emit = defineEmits(['action'])

// 输入参数
const props = defineProps({
  config: Object as PropType<RenderProps>,
})

// 进度框文本
const progressText = ref('正在处理...')

let progressDialogController: ReturnType<typeof openSharedDialog> | null = null

// 打开共享进度弹窗，避免渲染节点直接持有弹窗实例。
function openProgressDialog() {
  progressDialogController?.close()
  progressDialogController = openSharedDialog(ProgressDialog, { text: progressText.value }, {}, { closeOn: false })
}

// 关闭当前共享进度弹窗。
function closeProgressDialog() {
  progressDialogController?.close()
  progressDialogController = null
}

// 元素API事件响应（按实际 HTTP 方法分发请求）
async function commonAction(api_path: string, method: string, params = {}) {
  if (!api_path || !method) return
  openProgressDialog()
  try {
    const normalizedMethod = method.toUpperCase()
    if (normalizedMethod === 'GET') {
      await api.get(api_path, {
        params,
      })
    } else if (normalizedMethod === 'PUT') {
      await api.put(api_path, params)
    } else if (normalizedMethod === 'DELETE') {
      await api.delete(api_path, {
        params,
      })
    } else {
      await api.post(api_path, params)
    }
    emit('action')
  } catch (error) {
    console.error(error)
  } finally {
    closeProgressDialog()
  }
}

// 组装事件
let componentEvents = reactive<{ [key: string]: any }>({})
watchEffect(() => {
  for (const existingKey of Object.keys(componentEvents)) {
    delete componentEvents[existingKey]
  }
  if (!isNullOrEmptyObject(props.config?.events)) {
    for (const key in props.config?.events) {
      const attr = props.config?.events[key]
      const func = async () => {
        await commonAction(attr['api'], attr['method'], attr['params'])
      }
      componentEvents[key] = func
    }
  }
})

onUnmounted(() => {
  closeProgressDialog()
})

// 兼容数组或单节点形式的插槽定义
function normalizeSlotItems(slotContent: unknown): RenderProps[] {
  if (Array.isArray(slotContent)) {
    return slotContent as RenderProps[]
  }
  if (slotContent && typeof slotContent === 'object') {
    return [slotContent as RenderProps]
  }
  return []
}
</script>

<template>
  <Component :is="config?.component" v-if="!config?.html" v-bind="config?.props" v-on="componentEvents">
    {{ config?.text }}
    <template v-for="(slotContent, slotName) in config?.slots || {}" :key="slotName" #[slotName]="slotProps">
      <slot :name="slotName" v-bind="slotProps || {}">
        <PageRender
          v-for="(slotItem, slotIndex) in normalizeSlotItems(slotContent)"
          :key="slotIndex"
          :config="slotItem"
          @action="emit('action')"
        />
      </slot>
    </template>
    <PageRender
      v-for="(innerItem, innerIndex) in config?.content || []"
      :key="innerIndex"
      :config="innerItem"
      @action="emit('action')"
    />
  </Component>
  <Component
    :is="config?.component"
    v-if="config?.html"
    v-bind="config?.props"
    v-html="config?.html"
    v-on="componentEvents"
  />
</template>

<style lang="scss" scoped>
.d-flex > :deep(.v-img[style*='width']:not([style*='width: 100%'])),
:deep(:is(.d-flex, .v-list-item__prepend, .v-card-item__prepend) > .v-img[style*='width']:not([style*='width: 100%'])) {
  flex: 0 0 auto;
}
</style>
