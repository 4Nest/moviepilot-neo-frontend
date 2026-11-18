<script lang="ts" setup>
// 输入参数
const props: any = inject('rankingPropsKey')
</script>

<template>
  <div class="title-wrapper">
    <div class="title-section">
      <h3 class="title-text">{{ props?.title }}</h3>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */

.title-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  inline-size: 100%;

  :deep(a) {
    color: rgba(var(--v-theme-on-surface), 0.58);
    font-size: 0.8125rem;
    font-weight: 500;
    transition: color 0.15s ease;

    &:hover {
      color: rgba(var(--v-theme-on-surface), 0.92);
    }
  }
}

.title-section {
  position: relative;
  display: flex;
  align-items: center;
}

.title-text {
  padding: 0;
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.94);
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.4;
}
</style>
