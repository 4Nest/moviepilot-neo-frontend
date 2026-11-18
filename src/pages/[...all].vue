<script setup lang="ts">
import NoDataFound from '@/components/states/NoDataFound.vue'
import { useI18n } from '@/composables/useChineseText'

// 国际化
const { t } = useI18n()
</script>

<template>
  <div class="pt-6">
    <NoDataFound error-code="404" :error-title="t('notFound.title')" :error-description="t('notFound.description')">
      <template #button>
        <VBtn to="/" color="primary" variant="flat" size="small" rounded="lg" prepend-icon="mdi-home-outline">
          {{ t('notFound.backButton') }}
        </VBtn>
      </template>
    </NoDataFound>
  </div>
</template>
