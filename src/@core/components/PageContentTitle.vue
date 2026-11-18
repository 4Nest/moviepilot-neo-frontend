<script setup lang="ts">
defineProps({
  // 标题
  title: String,
})
</script>

<template>
  <div v-if="title" class="mp-page-title-wrap my-2 mx-1 md:flex md:items-center md:justify-between">
    <div class="min-w-0 flex-1">
      <h2 class="mp-page-title truncate sm:overflow-visible md:mb-0" data-testid="page-header">
        {{ title }}
      </h2>
    </div>
  </div>
</template>

<style scoped>
/* 黄金比例页面主标题：正文 13px × φ (1.618) ≈ 21px，高对比实色、克制字重 */
.mp-page-title {
  color: rgba(var(--v-theme-on-surface), 0.95);
  font-size: 1.3125rem;
  font-weight: 600;
  letter-spacing: -0.015em;
  line-height: 1.35;
}

@media (width <= 600px) {
  .mp-page-title {
    font-size: 1.1875rem;
  }
}
</style>
