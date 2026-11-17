import { translate } from '@/composables/useChineseText'
import {
  buildWorkflowPresetFromTemplate,
  getWorkflowTemplates,
  WORKFLOW_TEMPLATE_DEFINITIONS,
} from '@/views/workflow/workflowTemplates'
import { describe, expect, it } from 'vitest'

describe('workflowTemplates library', () => {
  it('provides all 6 built-in templates with valid DAG coordinates and handles', () => {
    const templates = getWorkflowTemplates(translate)

    expect(templates).toHaveLength(6)
    expect(WORKFLOW_TEMPLATE_DEFINITIONS.map(item => item.id)).toEqual([
      'rss-auto-download',
      'site-group-chase-new',
      'ranking-auto-subscribe',
      'scan-scrape-transfer',
      'downloads-patrol-transfer',
      'transfer-complete-plugin-notify',
    ])

    for (const tpl of templates) {
      expect(tpl.name).toBeTruthy()
      expect(tpl.description).toBeTruthy()
      expect(tpl.actions.length).toBeGreaterThanOrEqual(2)
      expect(tpl.flows.length).toBeGreaterThanOrEqual(1)

      const nodeIds = new Set(tpl.actions.map(action => action.id))
      expect(nodeIds.size).toBe(tpl.actions.length)

      tpl.actions.forEach((node, idx) => {
        expect(node.type).toMatch(/Action$/)
        expect(typeof node.position.x).toBe('number')
        expect(typeof node.position.y).toBe('number')
        if (idx > 0) {
          expect(node.position.x).toBeGreaterThan(tpl.actions[idx - 1].position.x)
        }
      })

      tpl.flows.forEach(flow => {
        expect(nodeIds.has(flow.source)).toBe(true)
        expect(nodeIds.has(flow.target)).toBe(true)
        expect(flow.sourceHandle).toBe('edge_out')
        expect(flow.targetHandle).toBe('edge_in')
        expect(flow.animated).toBe(true)
        if (flow.condition) {
          expect(flow.condition).toContain(`outputs.${flow.source}.`)
        }
      })
    }
  })

  it('clones preset payload cleanly for WorkflowAddEditDialog creation', () => {
    const [rssTemplate, chaseTemplate, , scanTemplate, , eventTemplate] = getWorkflowTemplates(translate)

    const rssPreset = buildWorkflowPresetFromTemplate(rssTemplate)
    expect(rssPreset.name).toBe('RSS 订阅过滤自动下载')
    expect(rssPreset.trigger_type).toBe('timer')
    expect(rssPreset.timer).toBe('*/30 * * * *')
    expect(rssPreset.actions).toHaveLength(4)

    const chasePreset = buildWorkflowPresetFromTemplate(chaseTemplate)
    expect(chasePreset.name).toBe('站点官组追新自动下载')
    expect(chasePreset.actions?.[0]?.data).toMatchObject({ only_new: true, search_type: 'keyword' })
    expect(chasePreset.actions?.[1]?.data).toMatchObject({ max_age_hours: 72 })
    expect(chasePreset.actions?.[2]?.data).toMatchObject({ max_downloads: 5 })

    const scanPreset = buildWorkflowPresetFromTemplate(scanTemplate)
    const transferNode = scanPreset.actions?.find(
      (n: { type?: string; data?: { source?: string } }) => n.type === 'TransferFileAction',
    )
    expect(transferNode?.data?.source).toBe('fileitems')

    const eventPreset = buildWorkflowPresetFromTemplate(eventTemplate)
    expect(eventPreset.trigger_type).toBe('event')
    expect(eventPreset.event_type).toBe('transfer.complete')
  })
})
