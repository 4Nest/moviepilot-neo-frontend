<script setup lang="ts">
import WorkflowListView from '@/views/workflow/WorkflowListView.vue'
import WorkflowShareView from '@/views/workflow/WorkflowShareView.vue'
import { useI18n } from '@/composables/useChineseText'
import { useDynamicHeaderTab } from '@/composables/useDynamicHeaderTab'
import { getWorkflowTabs } from '@/router/i18n-menu'

// 国际化
const { t } = useI18n()

const route = useRoute()

const activeTab = ref((route.query.tab as string) || 'list')
const workflowListViewRef = ref<InstanceType<typeof WorkflowListView> | null>(null)

// 获取标签页
const workflowTabs = computed(() => {
  return getWorkflowTabs(t)
})

function refreshWorkflowList() {
  workflowListViewRef.value?.refresh()
}

watch(
  () => route.query.tab,
  nextTab => {
    if (typeof nextTab === 'string' && workflowTabs.value.some(item => item.tab === nextTab)) {
      activeTab.value = nextTab
    }
  },
)

// 使用动态标签页
const { registerHeaderTab } = useDynamicHeaderTab()

// 注册动态标签页
registerHeaderTab({
  items: workflowTabs,
  modelValue: activeTab,
})

// 注册动态标签页
onMounted(() => {
  // 设置初始activeTab值
  if (!activeTab.value && workflowTabs.value.length > 0) {
    activeTab.value = workflowTabs.value[0].tab
  }
})
</script>

<template>
  <div>
    <VWindow v-model="activeTab" class="disable-tab-transition content-window" :touch="false">
      <VWindowItem value="list">
        <div>
          <WorkflowListView ref="workflowListViewRef" />
        </div>
      </VWindowItem>
      <VWindowItem value="share">
        <div>
          <WorkflowShareView @update="refreshWorkflowList" />
        </div>
      </VWindowItem>
    </VWindow>
  </div>
</template>

<style scoped>
.content-window {
  margin-block-start: 0;
}
</style>
