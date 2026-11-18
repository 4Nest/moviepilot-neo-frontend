<script setup lang="ts">
import type { Context, TorrentInfo } from '@/api/types'
import { formatFileSize } from '@/@core/utils/formatters'
import { getTorrentPromotionKind } from '@/utils/torrent'

// 输入参数
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: true,
  },
  items: {
    type: Array as PropType<Context[]>,
    default: () => [],
  },
  siteIcons: {
    type: Object as PropType<Record<number, string>>,
    default: () => ({}),
  },
})

// 定义触发的自定义事件
const emit = defineEmits(['update:modelValue', 'close', 'download', 'detail'])

// 弹窗显示状态
const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

/** 只为已知促销选择语义颜色，不把空倍率误认为免费。 */
function getPromotionChipColor(torrent?: TorrentInfo) {
  const kind = getTorrentPromotionKind(torrent)
  if (!kind) return undefined
  return { free: 'success', discount: 'warning', bonus: 'info', other: 'secondary' }[kind]
}

/** 选择更多来源进行下载。 */
function handleDownload(item: Context) {
  emit('download', item)
}

/** 打开种子详情页。 */
function handleDetail(item: Context) {
  emit('detail', item)
}
</script>

<template>
  <VDialog v-if="visible" v-model="visible" max-width="26rem" location="center">
    <VCard class="mp-dialog-card">
      <VCardItem class="more-sources-header">
        <template #prepend>
          <VIcon icon="mdi-source-branch" size="18" class="me-2 text-primary" />
        </template>
        <VCardTitle>其他来源</VCardTitle>
      </VCardItem>
      <VDialogCloseBtn v-model="visible" />

      <VDivider />

      <VCardText class="more-sources-content pa-0">
        <VList lines="one" density="compact" class="py-1">
          <VListItem
            v-for="(item, index) in props.items"
            :key="index"
            class="more-sources-item"
            @click.stop="handleDownload(item)"
          >
            <template #prepend>
              <div class="d-flex align-center gap-1 min-w-0">
                <div v-if="props.siteIcons[item.torrent_info?.site || 0]" class="more-sources-icon-shell">
                  <VImg
                    :src="props.siteIcons[item.torrent_info?.site || 0]"
                    :alt="item.torrent_info?.site_name"
                    width="16"
                    height="16"
                    :max-width="16"
                    class="flex-grow-0 rounded-xs"
                  />
                </div>
                <VAvatar v-else size="18" class="text-caption bg-surface-variant flex-shrink-0">
                  {{ item.torrent_info?.site_name?.substring(0, 1) }}
                </VAvatar>
                <span class="text-body-2 font-weight-medium text-truncate">{{ item.torrent_info.site_name }}</span>

                <VChip
                  v-if="item.meta_info?.season_episode"
                  color="primary"
                  variant="tonal"
                  size="x-small"
                  class="ms-1 flex-shrink-0"
                >
                  {{ item.meta_info.season_episode }}
                </VChip>

                <VChip
                  v-if="getTorrentPromotionKind(item.torrent_info)"
                  :color="getPromotionChipColor(item.torrent_info)"
                  variant="tonal"
                  size="x-small"
                  class="ms-1 flex-shrink-0"
                >
                  {{ item.torrent_info?.volume_factor }}
                </VChip>
              </div>
            </template>

            <template #append>
              <div class="d-flex align-center gap-2 ms-2 flex-shrink-0">
                <span class="text-caption font-weight-semibold text-primary more-sources-num">
                  {{ formatFileSize(item.torrent_info?.size) }}
                </span>
                <span class="d-flex align-center text-caption font-weight-semibold more-sources-num">
                  <VIcon size="14" color="success" icon="mdi-arrow-up" class="me-0.5" />
                  {{ item.torrent_info?.seeders }}
                </span>
                <IconBtn size="x-small" variant="text" @click.stop="handleDetail(item)">
                  <VIcon size="15" icon="mdi-arrow-top-right" />
                </IconBtn>
              </div>
            </template>
          </VListItem>
        </VList>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style scoped>
.more-sources-header {
  padding-block: 12px;
  padding-inline: 18px 48px;
}

.more-sources-content {
  max-block-size: 60vh;
  overflow-y: auto;
}

.more-sources-item {
  min-block-size: 38px;
  padding-inline: 14px 10px !important;
}

.more-sources-icon-shell {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  padding: 1px;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 4px;
  background-color: rgba(255, 255, 255, 0.08);
  block-size: 20px;
  inline-size: 20px;
}

:root[data-theme='light'] .more-sources-icon-shell,
.v-theme--light .more-sources-icon-shell {
  background-color: var(--mp-item-active-bg);
}

.more-sources-num {
  font-variant-numeric: tabular-nums;
}
</style>
