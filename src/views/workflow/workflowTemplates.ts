import type { Workflow } from '@/api/types'

export interface WorkflowTemplateNode {
  id: string
  type: string
  name: string
  description?: string
  position: { x: number; y: number }
  data: Record<string, unknown>
}

export interface WorkflowTemplateEdge {
  id: string
  source: string
  sourceHandle: 'edge_out'
  target: string
  targetHandle: 'edge_in'
  type: 'animation'
  animated: boolean
  condition?: string
  label?: string
  class?: string
  data: {
    condition?: string
  }
}

export interface WorkflowTemplateDefinition {
  id: string
  nameKey: string
  descriptionKey: string
  badgeKey: string
  icon: string
  color: 'primary' | 'success' | 'info' | 'warning'
  trigger_type: 'timer' | 'event' | 'manual'
  timer?: string
  event_type?: string
  event_conditions?: Record<string, unknown>
  execution_config?: Record<string, unknown>
  actions: WorkflowTemplateNode[]
  flows: WorkflowTemplateEdge[]
}

export interface ResolvedWorkflowTemplate extends WorkflowTemplateDefinition {
  name: string
  description: string
  badge: string
}

function createTemplateEdge(source: string, target: string, condition?: string): WorkflowTemplateEdge {
  const normalizedCondition = condition?.trim() || undefined
  return {
    id: `edge_${source}_${target}`,
    source,
    sourceHandle: 'edge_out',
    target,
    targetHandle: 'edge_in',
    type: 'animation',
    animated: true,
    condition: normalizedCondition,
    label: normalizedCondition ? '条件' : undefined,
    class: normalizedCondition ? 'workflow-conditional-edge' : undefined,
    data: normalizedCondition ? { condition: normalizedCondition } : {},
  }
}

export const WORKFLOW_TEMPLATE_DEFINITIONS: WorkflowTemplateDefinition[] = [
  {
    id: 'rss-auto-download',
    nameKey: 'workflow.templates.items.rssAutoDownload.name',
    descriptionKey: 'workflow.templates.items.rssAutoDownload.description',
    badgeKey: 'workflow.templates.items.rssAutoDownload.badge',
    icon: 'mdi-rss',
    color: 'primary',
    trigger_type: 'timer',
    timer: '*/30 * * * *',
    actions: [
      {
        id: 'act_fetch_rss',
        type: 'FetchRssAction',
        name: '获取RSS资源',
        description: '订阅RSS地址获取资源',
        position: { x: 80, y: 120 },
        data: {
          url: '',
          proxy: false,
          timeout: 15,
          match_media: true,
        },
      },
      {
        id: 'act_filter_torrents',
        type: 'FilterTorrentsAction',
        name: '过滤资源',
        description: '对资源列表数据进行过滤',
        position: { x: 440, y: 120 },
        data: {
          quality: '',
          resolution: '',
          effect: '',
          include: '',
          exclude: '',
          rule_groups: [],
        },
      },
      {
        id: 'act_add_download',
        type: 'AddDownloadAction',
        name: '添加下载',
        description: '根据资源列表添加下载任务',
        position: { x: 800, y: 120 },
        data: {
          downloader: '',
          labels: '',
          save_path: '',
          only_lack: true,
        },
      },
      {
        id: 'act_send_message',
        type: 'SendMessageAction',
        name: '发送消息',
        description: '发送执行结果通知消息',
        position: { x: 1160, y: 120 },
        data: {
          client: [],
          userid: '',
        },
      },
    ],
    flows: [
      createTemplateEdge('act_fetch_rss', 'act_filter_torrents'),
      createTemplateEdge('act_filter_torrents', 'act_add_download', 'outputs.act_filter_torrents.torrents.count > 0'),
      createTemplateEdge('act_add_download', 'act_send_message'),
    ],
  },
  {
    id: 'ranking-auto-subscribe',
    nameKey: 'workflow.templates.items.rankingAutoSubscribe.name',
    descriptionKey: 'workflow.templates.items.rankingAutoSubscribe.description',
    badgeKey: 'workflow.templates.items.rankingAutoSubscribe.badge',
    icon: 'mdi-movie-star-outline',
    color: 'success',
    trigger_type: 'timer',
    timer: '0 12 * * *',
    actions: [
      {
        id: 'act_fetch_medias',
        type: 'FetchMediasAction',
        name: '获取媒体数据',
        description: '获取流行趋势与热门榜单数据',
        position: { x: 80, y: 120 },
        data: {
          source_type: 'ranking',
          sources: ['recommend/tmdb_trending', 'recommend/douban_movie_hot'],
        },
      },
      {
        id: 'act_filter_medias',
        type: 'FilterMediasAction',
        name: '过滤媒体数据',
        description: '筛选高分影视条目',
        position: { x: 440, y: 120 },
        data: {
          type: '',
          year: '',
          vote: 7.5,
        },
      },
      {
        id: 'act_add_subscribe',
        type: 'AddSubscribeAction',
        name: '添加订阅',
        description: '根据媒体列表添加订阅',
        position: { x: 800, y: 120 },
        data: {},
      },
      {
        id: 'act_send_message',
        type: 'SendMessageAction',
        name: '发送消息',
        description: '发送订阅添加通知消息',
        position: { x: 1160, y: 120 },
        data: {
          client: [],
          userid: '',
        },
      },
    ],
    flows: [
      createTemplateEdge('act_fetch_medias', 'act_filter_medias'),
      createTemplateEdge('act_filter_medias', 'act_add_subscribe', 'outputs.act_filter_medias.medias.count > 0'),
      createTemplateEdge('act_add_subscribe', 'act_send_message'),
    ],
  },
  {
    id: 'scan-scrape-transfer',
    nameKey: 'workflow.templates.items.scanScrapeTransfer.name',
    descriptionKey: 'workflow.templates.items.scanScrapeTransfer.description',
    badgeKey: 'workflow.templates.items.scanScrapeTransfer.badge',
    icon: 'mdi-folder-cog-outline',
    color: 'info',
    trigger_type: 'timer',
    timer: '0 3 * * *',
    actions: [
      {
        id: 'act_scan_file',
        type: 'ScanFileAction',
        name: '扫描目录',
        description: '扫描目录文件到队列',
        position: { x: 80, y: 120 },
        data: {
          storage: 'local',
          directory: '',
        },
      },
      {
        id: 'act_transfer_file',
        type: 'TransferFileAction',
        name: '整理文件',
        description: '整理队列中的文件',
        position: { x: 440, y: 120 },
        data: {
          source: 'fileitems',
        },
      },
      {
        id: 'act_scrape_file',
        type: 'ScrapeFileAction',
        name: '刮削文件',
        description: '刮削文件及图片元数据',
        position: { x: 800, y: 120 },
        data: {},
      },
      {
        id: 'act_send_message',
        type: 'SendMessageAction',
        name: '发送消息',
        description: '发送整理完成通知',
        position: { x: 1160, y: 120 },
        data: {
          client: [],
          userid: '',
        },
      },
    ],
    flows: [
      createTemplateEdge('act_scan_file', 'act_transfer_file'),
      createTemplateEdge('act_transfer_file', 'act_scrape_file'),
      createTemplateEdge('act_scrape_file', 'act_send_message'),
    ],
  },
  {
    id: 'downloads-patrol-transfer',
    nameKey: 'workflow.templates.items.downloadsPatrolTransfer.name',
    descriptionKey: 'workflow.templates.items.downloadsPatrolTransfer.description',
    badgeKey: 'workflow.templates.items.downloadsPatrolTransfer.badge',
    icon: 'mdi-progress-download',
    color: 'warning',
    trigger_type: 'timer',
    timer: '*/20 * * * *',
    actions: [
      {
        id: 'act_fetch_downloads',
        type: 'FetchDownloadsAction',
        name: '获取下载任务',
        description: '获取下载器中的任务列表',
        position: { x: 80, y: 120 },
        data: {
          loop: false,
          loop_interval: 60,
        },
      },
      {
        id: 'act_transfer_file',
        type: 'TransferFileAction',
        name: '整理文件',
        description: '从下载任务中整理已完成文件',
        position: { x: 440, y: 120 },
        data: {
          source: 'downloads',
        },
      },
      {
        id: 'act_send_message',
        type: 'SendMessageAction',
        name: '发送消息',
        description: '存在新整理文件时发送通知',
        position: { x: 800, y: 120 },
        data: {
          client: [],
          userid: '',
        },
      },
    ],
    flows: [
      createTemplateEdge('act_fetch_downloads', 'act_transfer_file'),
      createTemplateEdge('act_transfer_file', 'act_send_message', 'outputs.act_transfer_file.fileitems.count > 0'),
    ],
  },
  {
    id: 'transfer-complete-plugin-notify',
    nameKey: 'workflow.templates.items.transferCompletePluginNotify.name',
    descriptionKey: 'workflow.templates.items.transferCompletePluginNotify.description',
    badgeKey: 'workflow.templates.items.transferCompletePluginNotify.badge',
    icon: 'mdi-lightning-bolt-outline',
    color: 'primary',
    trigger_type: 'event',
    event_type: 'transfer.complete',
    actions: [
      {
        id: 'act_invoke_plugin',
        type: 'InvokePluginAction',
        name: '调用插件',
        description: '调用指定插件动作',
        position: { x: 80, y: 120 },
        data: {
          plugin_id: '',
          action_id: '',
          action_params: {},
        },
      },
      {
        id: 'act_send_message',
        type: 'SendMessageAction',
        name: '发送消息',
        description: '发送联动执行通知',
        position: { x: 440, y: 120 },
        data: {
          client: [],
          userid: '',
        },
      },
    ],
    flows: [createTemplateEdge('act_invoke_plugin', 'act_send_message')],
  },
]

export function getWorkflowTemplates(translateFn: (key: string) => string): ResolvedWorkflowTemplate[] {
  return WORKFLOW_TEMPLATE_DEFINITIONS.map(item => ({
    ...item,
    name: translateFn(item.nameKey),
    description: translateFn(item.descriptionKey),
    badge: translateFn(item.badgeKey),
  }))
}

export function buildWorkflowPresetFromTemplate(template: ResolvedWorkflowTemplate): Partial<Workflow> {
  return {
    name: template.name,
    description: template.description,
    trigger_type: template.trigger_type,
    timer: template.timer,
    event_type: template.event_type,
    event_conditions: template.event_conditions ? JSON.parse(JSON.stringify(template.event_conditions)) : {},
    execution_config: template.execution_config ? JSON.parse(JSON.stringify(template.execution_config)) : {},
    actions: JSON.parse(JSON.stringify(template.actions)),
    flows: JSON.parse(JSON.stringify(template.flows)),
    state: 'P',
  }
}
