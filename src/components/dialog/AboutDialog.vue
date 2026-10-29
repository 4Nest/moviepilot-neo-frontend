<script setup lang="ts">
import api from '@/api'
import { useI18n } from '@/composables/useChineseText'

const emit = defineEmits(['close'])

const { t } = useI18n()

// 系统环境信息
const systemEnv = ref<Record<string, string>>({})

function visibleBuildValue(value?: string) {
  return value && value !== 'unknown' ? value : ''
}

function shortSha(value?: string) {
  const normalized = visibleBuildValue(value)
  return normalized ? normalized.slice(0, 10) : ''
}

// 查询系统环境
async function querySystemEnv() {
  try {
    const result = (await api.get('system/env')) as { data?: Record<string, string> }
    systemEnv.value = result.data ?? {}
  } catch (error) {
    console.log(error)
  }
}

onMounted(() => {
  querySystemEnv()
})
</script>

<template>
  <VDialog max-width="36rem" scrollable>
    <VCard>
      <VCardItem>
        <VCardTitle>
          <VIcon icon="mdi-information" class="me-2" />
          {{ t('setting.about.title') }}
        </VCardTitle>
        <VDialogCloseBtn @click="emit('close')" />
      </VCardItem>
      <VDivider />
      <VCardText>
        <dl class="about-list">
          <div class="about-row">
            <dt>{{ t('setting.about.softwareVersion') }}</dt>
            <dd>
              <a
                href="https://github.com/4Nest/moviepilot-neo"
                target="_blank"
                rel="noopener noreferrer"
                class="about-version-link"
              >
                <code>{{ systemEnv.VERSION }}</code>
              </a>
            </dd>
          </div>
          <div v-if="visibleBuildValue(systemEnv.BACKEND_BUILD_SHA)" class="about-row">
            <dt>后端构建</dt>
            <dd>
              <code>{{ shortSha(systemEnv.BACKEND_BUILD_SHA) }}</code>
            </dd>
          </div>
          <div v-if="visibleBuildValue(systemEnv.FRONTEND_BUILD_SHA)" class="about-row">
            <dt>前端构建</dt>
            <dd>
              <code>{{ shortSha(systemEnv.FRONTEND_BUILD_SHA) }}</code>
            </dd>
          </div>
          <div v-if="visibleBuildValue(systemEnv.BUILD_CHANNEL)" class="about-row">
            <dt>发布频道</dt>
            <dd>
              <code>{{ systemEnv.BUILD_CHANNEL }}</code>
            </dd>
          </div>
          <div v-if="visibleBuildValue(systemEnv.BUILD_TIME)" class="about-row">
            <dt>构建时间</dt>
            <dd>
              <code>{{ systemEnv.BUILD_TIME }}</code>
            </dd>
          </div>
        </dl>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style scoped>
.about-list {
  display: grid;
  gap: 1rem;
  margin: 0;
  padding: 0.5rem 0;
}

.about-row {
  display: grid;
  align-items: baseline;
  gap: 0.75rem;
  grid-template-columns: 7rem minmax(0, 1fr);
}

.about-row dt {
  font-size: 0.875rem;
  font-weight: 600;
}

.about-row dd {
  min-inline-size: 0;
  margin: 0;
}

.about-version-link {
  color: rgb(var(--v-theme-primary));
  text-decoration: none;
}

.about-version-link:hover {
  text-decoration: underline;
}
</style>
