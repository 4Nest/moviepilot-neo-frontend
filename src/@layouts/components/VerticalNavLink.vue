<script lang="ts" setup>
import type { NavLink } from '@layouts/types'

defineProps<{
  item: NavLink
}>()
</script>

<template>
  <li class="nav-link" :class="{ disabled: item.disable }">
    <Component
      :is="item.to ? 'RouterLink' : 'a'"
      :to="item.to"
      :href="item.href"
      :title="item.title"
      :aria-label="item.title"
    >
      <VIcon :icon="item.icon as string" class="nav-item-icon" />
      <!-- 👉 Title -->
      <span class="nav-item-title">
        {{ item.title }}
      </span>
    </Component>
  </li>
</template>

<style lang="scss">
.layout-vertical-nav {
  .nav-link a {
    display: flex;
    align-items: center;
    border-radius: 8px;
    cursor: pointer;
    margin-inline: 10px;
    padding-inline: 10px;
  }
}
</style>
