import { translate } from '@/composables/useChineseText'

export const storageAttributes = [
  {
    type: 'local',
    icon: 'mdi-folder-multiple-outline',
    remote: false,
  },
  {
    type: 'alipan',
    icon: 'mdi-cloud-outline',
    remote: true,
  },
  {
    type: 'u115',
    icon: 'mdi-cloud-outline',
    remote: true,
  },
  {
    type: 'rclone',
    icon: 'mdi-server-network-outline',
    remote: true,
  },
  {
    type: 'alist',
    icon: 'mdi-server-network-outline',
    remote: true,
  },
  {
    type: 'alistgo',
    icon: 'mdi-server-network-outline',
    remote: true,
  },
  {
    type: 'smb',
    icon: 'mdi-folder-network-outline',
    remote: true,
  },
]

export const storageIconDict = storageAttributes.reduce(
  (dict, item) => {
    dict[item.type] = item.icon
    return dict
  },
  {} as Record<string, string>,
)

export const storageRemoteDict = storageAttributes.reduce(
  (dict, item) => {
    dict[item.type] = item.remote
    return dict
  },
  {} as Record<string, boolean>,
)

export const downloaderOptions = [
  {
    value: 'qbittorrent',
    title: translate('setting.system.qbittorrent'),
  },
  {
    value: 'transmission',
    title: translate('setting.system.transmission'),
  },
  {
    value: 'rtorrent',
    title: translate('setting.system.rtorrent'),
  },
]

export const downloaderDict = downloaderOptions.reduce(
  (dict, item) => {
    dict[item.value] = item.title
    return dict
  },
  {} as Record<string, string>,
)

export const mediaServerOptions = [
  {
    value: 'emby',
    title: translate('setting.system.emby'),
  },
  {
    value: 'zspace',
    title: translate('setting.system.zspace'),
  },
  {
    value: 'jellyfin',
    title: translate('setting.system.jellyfin'),
  },
  {
    value: 'plex',
    title: translate('setting.system.plex'),
  },
  {
    value: 'trimemedia',
    title: translate('setting.system.trimeMedia'),
  },
  {
    value: 'ugreen',
    title: translate('setting.system.ugreen'),
  },
  {
    value: 'mediavault',
    title: translate('setting.system.mediaVault'),
  },
]

export const mediaServerDict = mediaServerOptions.reduce(
  (dict, item) => {
    dict[item.value] = item.title
    return dict
  },
  {} as Record<string, string>,
)

export const innerFilterRules = [
  { title: translate('filterRules.specSub'), value: ' SPECSUB ' },
  { title: translate('filterRules.cnSub'), value: ' CNSUB ' },
  { title: translate('filterRules.cnVoi'), value: ' CNVOI ' },
  { title: translate('filterRules.gz'), value: ' GZ ' },
  { title: translate('filterRules.notCnVoi'), value: ' !CNVOI ' },
  { title: translate('filterRules.hkVoi'), value: ' HKVOI ' },
  { title: translate('filterRules.notHkVoi'), value: ' !HKVOI ' },
  { title: translate('filterRules.free'), value: ' FREE ' },
  { title: translate('filterRules.resolution4k'), value: ' 4K ' },
  { title: translate('filterRules.resolution1080p'), value: ' 1080P ' },
  { title: translate('filterRules.resolution720p'), value: ' 720P ' },
  { title: translate('filterRules.not720p'), value: ' !720P ' },
  { title: translate('filterRules.qualityBlu'), value: ' BLU ' },
  { title: translate('filterRules.notBlu'), value: ' !BLU ' },
  { title: translate('filterRules.qualityBluray'), value: ' BLURAY ' },
  { title: translate('filterRules.notBluray'), value: ' !BLURAY ' },
  { title: translate('filterRules.qualityUhd'), value: ' UHD ' },
  { title: translate('filterRules.notUhd'), value: ' !UHD ' },
  { title: translate('filterRules.qualityRemux'), value: ' REMUX ' },
  { title: translate('filterRules.notRemux'), value: ' !REMUX ' },
  { title: translate('filterRules.qualityWebdl'), value: ' WEBDL ' },
  { title: translate('filterRules.notWebdl'), value: ' !WEBDL ' },
  { title: translate('filterRules.quality60fps'), value: ' 60FPS ' },
  { title: translate('filterRules.not60fps'), value: ' !60FPS ' },
  { title: translate('filterRules.codecH265'), value: ' H265 ' },
  { title: translate('filterRules.notH265'), value: ' !H265 ' },
  { title: translate('filterRules.codecH264'), value: ' H264 ' },
  { title: translate('filterRules.notH264'), value: ' !H264 ' },
  { title: translate('filterRules.effectDolby'), value: ' DOLBY ' },
  { title: translate('filterRules.notDolby'), value: ' !DOLBY ' },
  { title: translate('filterRules.effectAtmos'), value: ' ATMOS ' },
  { title: translate('filterRules.notAtmos'), value: ' !ATMOS ' },
  { title: translate('filterRules.effectHdr'), value: ' HDR ' },
  { title: translate('filterRules.notHdr'), value: ' !HDR ' },
  { title: translate('filterRules.effectSdr'), value: ' SDR ' },
  { title: translate('filterRules.notSdr'), value: ' !SDR ' },
  { title: translate('filterRules.effect3d'), value: ' 3D ' },
  { title: translate('filterRules.not3d'), value: ' !3D ' },
]

export const transferTypeOptions = [
  { title: translate('transferType.copy'), value: 'copy' },
  { title: translate('transferType.move'), value: 'move' },
  { title: translate('transferType.link'), value: 'link' },
  { title: translate('transferType.softlink'), value: 'softlink' },
]

export const qualityOptions = ref([
  {
    title: translate('qualityOptions.all'),
    value: '',
  },
  {
    title: translate('qualityOptions.blurayOriginal'),
    value: 'Blu-?Ray.+VC-?1|Blu-?Ray.+AVC|UHD.+blu-?ray.+HEVC|MiniBD',
  },
  {
    title: translate('qualityOptions.remux'),
    value: 'Remux',
  },
  {
    title: translate('qualityOptions.bluray'),
    value: 'Blu-?Ray',
  },
  {
    title: translate('qualityOptions.uhd'),
    value: 'UHD|UltraHD',
  },
  {
    title: translate('qualityOptions.webdl'),
    value: 'WEB-?DL|WEB-?RIP',
  },
  {
    title: translate('qualityOptions.hdtv'),
    value: 'HDTV',
  },
  {
    title: translate('qualityOptions.h265'),
    value: '[Hx].?265|HEVC',
  },
  {
    title: translate('qualityOptions.h264'),
    value: '[Hx].?264|AVC',
  },
])

// 分辨率选择框数据
export const resolutionOptions = ref([
  {
    title: translate('resolutionOptions.all'),
    value: '',
  },
  {
    title: translate('resolutionOptions.4k'),
    value: '4K|2160p|x2160',
  },
  {
    title: translate('resolutionOptions.1080p'),
    value: '1080[pi]|x1080',
  },
  {
    title: translate('resolutionOptions.720p'),
    value: '720[pi]|x720',
  },
])

// 特效选择框数据
export const effectOptions = ref([
  {
    title: translate('effectOptions.all'),
    value: '',
  },
  {
    title: translate('effectOptions.dolbyVision'),
    value: 'Dolby[\\s.]+Vision|DOVI|[\\s.]+DV[\\s.]+',
  },
  {
    title: translate('effectOptions.dolbyAtmos'),
    value: 'Dolby[\\s.]*\\+?Atmos|Atmos',
  },
  {
    title: translate('effectOptions.hdr'),
    value: '[\\s.]+HDR[\\s.]+|HDR10|HDR10\\+',
  },
  {
    title: translate('effectOptions.sdr'),
    value: '[\\s.]+SDR[\\s.]+',
  },
])

// 媒体类型选项
export const mediaTypeOptions = [
  {
    title: translate('mediaType.movie'),
    value: '电影',
  },
  {
    title: translate('mediaType.tv'),
    value: '电视剧',
  },
  {
    title: translate('mediaType.anime'),
    value: '动漫',
  },
  {
    title: translate('mediaType.collection'),
    value: '合集',
  },
  {
    title: translate('mediaType.unknown'),
    value: '未知',
  },
]

// 媒体类型字典
export const mediaTypeDict = mediaTypeOptions.reduce(
  (dict, item) => {
    dict[item.value] = item.title
    return dict
  },
  {} as Record<string, string>,
)

// 通知开关选项
export const notificationSwitchOptions = [
  {
    title: translate('notificationSwitch.resourceDownload'),
    value: '资源下载',
  },
  {
    title: translate('notificationSwitch.organize'),
    value: '整理入库',
  },
  {
    title: translate('notificationSwitch.subscribe'),
    value: '订阅',
  },
  {
    title: translate('notificationSwitch.site'),
    value: '站点',
  },
  {
    title: translate('notificationSwitch.mediaServer'),
    value: '媒体服务器',
  },
  {
    title: translate('notificationSwitch.manual'),
    value: '手动处理',
  },
  {
    title: translate('notificationSwitch.plugin'),
    value: '插件',
  },
  {
    title: translate('notificationSwitch.other'),
    value: '其它',
  },
]

// 通知开关字典
export const notificationSwitchDict = notificationSwitchOptions.reduce(
  (dict, item) => {
    dict[item.value] = item.title
    return dict
  },
  {} as Record<string, string>,
)

// 操作步骤选项
export const actionStepOptions = [
  {
    title: translate('actionStep.addDownload'),
    value: '添加下载',
  },
  {
    title: translate('actionStep.addSubscribe'),
    value: '添加订阅',
  },
  {
    title: translate('actionStep.fetchDownloads'),
    value: '获取下载任务',
  },
  {
    title: translate('actionStep.fetchMedias'),
    value: '获取媒体数据',
  },
  {
    title: translate('actionStep.fetchRss'),
    value: '获取RSS资源',
  },
  {
    title: translate('actionStep.fetchTorrents'),
    value: '搜索站点资源',
  },
  {
    title: translate('actionStep.filterMedias'),
    value: '过滤媒体数据',
  },
  {
    title: translate('actionStep.filterTorrents'),
    value: '过滤资源',
  },
  {
    title: translate('actionStep.scanFile'),
    value: '扫描目录',
  },
  {
    title: translate('actionStep.scrapeFile'),
    value: '刮削文件',
  },
  {
    title: translate('actionStep.sendEvent'),
    value: '发送事件',
  },
  {
    title: translate('actionStep.sendMessage'),
    value: '发送消息',
  },
  {
    title: translate('actionStep.transferFile'),
    value: '整理文件',
  },
  {
    title: translate('actionStep.invokePlugin'),
    value: '调用插件',
  },
  {
    title: translate('actionStep.note'),
    value: '备注',
  },
]

// 操作步骤字典
export const actionStepDict = actionStepOptions.reduce(
  (dict, item) => {
    dict[item.value] = item.title
    return dict
  },
  {} as Record<string, string>,
)
