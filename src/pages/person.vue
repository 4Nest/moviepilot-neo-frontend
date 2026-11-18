<script setup lang="ts">
import PersonDetailView from '@/views/discover/PersonDetailView.vue'

// 路由参数
const route = useRoute()

// Person Id
const personid = computed(() => route.query?.personid?.toString())

// 来源
const source = computed(() => route.query?.source?.toString())

// 类型
const type = computed(() => route.query?.type?.toString())
</script>

<template>
  <div>
    <PersonDetailView :personid="personid" :type="type" :source="source" />
  </div>
</template>
