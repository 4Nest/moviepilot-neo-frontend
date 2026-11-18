<script setup lang="ts">
import MediaCardListView from '@/views/discover/MediaCardListView.vue'
import PersonCardListView from '@/views/discover/PersonCardListView.vue'
import { useI18n } from '@/composables/useChineseText'

const { t } = useI18n()

const props = defineProps({
  // `/browse/:paths+` 捕获的 API 路径段。
  paths: {
    type: Array as PropType<string[]>,
    required: true,
  },
})

const route = useRoute()

const type = computed(() => route.query?.type?.toString())

const title = computed(() => {
  const rawTitle = route.query?.title?.toString()
  if (type.value === 'person') return `${t('browse.actor')}: ${rawTitle ?? ''}`
  return rawTitle
})

const showScrollToTop = computed(() => route.path === '/browse' || route.path.startsWith('/browse/'))

function getApiPath(paths: string[]) {
  return paths.join('/')
}
</script>

<template>
  <div>
    <VPageContentTitle :title="title" />
    <PersonCardListView v-if="type === 'person'" :apipath="getApiPath(props.paths)" :params="route.query" />
    <MediaCardListView v-else :apipath="getApiPath(props.paths)" :params="route.query" />
    <Teleport v-if="showScrollToTop" to="body">
      <VScrollToTopBtn />
    </Teleport>
  </div>
</template>
