<script lang="ts" setup>
import personIcon from '@images/misc/person-icon.png'
import type { Person } from '@/api/types'
import router from '@/router'
import { useGlobalSettingsStore } from '@/stores'
import { getDisplayImageUrl } from '@/utils/imageUtils'

const personProps = defineProps({
  person: Object as PropType<Person>,
  width: String,
  height: String,
})

// 全局设置
const globalSettingsStore = useGlobalSettingsStore()
const globalSettings = globalSettingsStore.globalSettings

// 当前人物（响应式跟随 props.person 变化）
const personInfo = computed(() => personProps.person)

// 人物图片地址
function getPersonImage() {
  let url = ''
  if (personProps.person?.source === 'themoviedb') {
    if (!personInfo.value?.profile_path) return personIcon
    url = `https://${globalSettings.TMDB_IMAGE_DOMAIN}/t/p/w600_and_h900_bestv2${personInfo.value?.profile_path}`
  } else if (personProps.person?.source === 'douban') {
    if (!personInfo.value?.avatar) return personIcon
    if (typeof personInfo.value?.avatar === 'object') {
      url = personInfo.value?.avatar?.normal
    } else {
      url = personInfo.value?.avatar
    }
  } else if (personProps.person?.source === 'bangumi') {
    if (!personInfo.value?.images) return personIcon
    url = personInfo.value?.images?.medium
  } else if (personProps.person?.source === 'anilist') {
    if (!personInfo.value?.images) return personIcon
    url = personInfo.value?.images?.large || personInfo.value?.images?.medium
  } else {
    return personIcon
  }
  return getDisplayImageUrl(url, globalSettings.GLOBAL_IMAGE_CACHE)
}

// 人物姓名
function getPersonName() {
  return personInfo.value?.name
}

// 人物角色
function getPersonCharacter() {
  if (personProps.person?.source === 'bangumi') {
    if (!personInfo.value?.career) return ''
    return personInfo.value?.career.join('、')
  } else {
    return personInfo.value?.character
  }
}

// 人物详情
function goPersonDetail() {
  if (!personInfo.value?.id) return
  router.push({
    path: '/person',
    query: {
      personid: personInfo.value?.id,
      source: personInfo.value?.source,
    },
  })
}
</script>

<template>
  <VHover>
    <template #default="hover">
      <!-- Hover 命中区域保持静止，避免卡片上浮后底边反复触发 mouseleave。 -->
      <div v-bind="hover.props" class="person-card-hover-area">
        <VCard
          :height="personProps.height"
          :width="personProps.width"
          variant="flat"
          class="person-card app-hover-lift-card cursor-pointer overflow-hidden"
          :class="{
            'app-hover-lift-card--hovering': hover.isHovering,
          }"
          @click.stop="goPersonDetail"
        >
          <div class="person-card__portrait">
            <VImg :src="getPersonImage()" aspect-ratio="2/3" cover class="w-full h-full" />
          </div>
          <div class="person-card__meta">
            <div class="person-card__name" :title="getPersonName()">
              {{ getPersonName() }}
            </div>
            <div v-if="getPersonCharacter()" class="person-card__role" :title="getPersonCharacter()">
              {{ getPersonCharacter() }}
            </div>
          </div>
        </VCard>
      </div>
    </template>
  </VHover>
</template>

<style lang="scss" scoped>
.person-card-hover-area {
  inline-size: 100%;
}

.person-card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px !important;
  background-color: rgb(var(--v-theme-surface));
  transition:
    border-color 0.16s ease,
    transform 0.18s ease;
}

.person-card-hover-area:hover .person-card {
  border-color: var(--mp-border-hover);
}

.person-card__portrait {
  overflow: hidden;
  aspect-ratio: 2 / 3;
  background: var(--mp-item-bg);
  inline-size: 100%;
}

.person-card__meta {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-block-size: 46px;
  padding: 7px 8px 8px;
  text-align: center;
}

.person-card__name {
  overflow: hidden;
  color: rgb(var(--v-theme-on-surface));
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.person-card__role {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 11.5px;
  line-height: 1.35;
  margin-block-start: 2px;
  text-overflow: ellipsis;
  word-break: break-all;
}
</style>
