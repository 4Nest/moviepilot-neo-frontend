import SubscribeSharePage from '@/pages/subscribe-share.vue'
import {
  canDeleteSubscribeShare,
  canDeleteWorkflowShare,
  isOwnShare,
  resolveShareMediaId,
  runConcurrentBatches,
} from '@/utils/sharePermissions'
import { screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'

describe('sharePermissions & subscribe-share page reactivity', () => {
  it('enforces unified subscribe and workflow share deletion permissions', () => {
    expect(isOwnShare('u1', 'u1')).toBe(true)
    expect(isOwnShare('', '')).toBe(false)
    expect(isOwnShare(undefined, 'u1')).toBe(false)

    // 缺少 id、非超管、或非本人且无中心端管理权限一律禁止
    expect(canDeleteSubscribeShare({ id: undefined, share_uid: 'u1' }, { superUser: true, userUniqueId: 'u1' })).toBe(
      false,
    )
    expect(
      canDeleteSubscribeShare({ id: 1, share_uid: 'u1' }, { superUser: false, userUniqueId: 'u1', canManageAll: true }),
    ).toBe(false)
    expect(canDeleteSubscribeShare({ id: 1, share_uid: 'u2' }, { superUser: true, userUniqueId: 'u1' })).toBe(false)
    expect(canDeleteSubscribeShare({ id: 1, share_uid: 'u1' }, { superUser: true, userUniqueId: 'u1' })).toBe(true)
    expect(
      canDeleteSubscribeShare({ id: 1, share_uid: 'u2' }, { superUser: true, userUniqueId: 'u1', canManageAll: true }),
    ).toBe(true)

    expect(canDeleteWorkflowShare({ id: '', share_uid: 'u1' }, { superUser: true, userUniqueId: 'u1' })).toBe(false)
    expect(
      canDeleteWorkflowShare({ id: '9', share_uid: 'u2' }, { superUser: true, userUniqueId: 'u1', canManageAll: true }),
    ).toBe(true)
  })

  it('resolves share media detail IDs in SubscribeCard priority order', () => {
    expect(resolveShareMediaId({ media_id: '88', media_source: 'themoviedb', tmdbid: 1 })).toBe('tmdb:88')
    expect(resolveShareMediaId({ media_id: '99', media_source: 'bangumi', tmdbid: 1 })).toBe('bangumi:99')
    expect(resolveShareMediaId({ doubanid: '2', tmdbid: 10 })).toBe('tmdb:10')
    expect(resolveShareMediaId({ doubanid: '20' })).toBe('douban:20')
    expect(resolveShareMediaId({ bangumiid: 30 })).toBe('bangumi:30')
    expect(resolveShareMediaId({ anilistid: 40 })).toBe('anilist:40')
    expect(resolveShareMediaId({})).toBeUndefined()
  })

  it('bounds concurrent batch execution to the configured concurrency limit', async () => {
    let active = 0
    let peak = 0
    const items = [1, 2, 3, 4, 5, 6, 7]

    const results = await runConcurrentBatches(items, 4, async item => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise(resolve => setTimeout(resolve, 5))
      active -= 1
      if (item === 5) throw new Error('boom')
      return item * 2
    })

    expect(peak).toBeLessThanOrEqual(4)
    expect(results).toHaveLength(7)
    expect(results[0]).toEqual({ status: 'fulfilled', value: 2 })
    expect(results[4].status).toBe('rejected')
  })

  it('reactively forwards route.query.keyword changes in subscribe-share page', async () => {
    const SubscribeShareViewStub = defineComponent({
      name: 'SubscribeShareView',
      props: { keyword: String },
      setup(props) {
        return () => h('output', { 'aria-label': 'route-share-keyword' }, props.keyword ?? '')
      },
    })

    const { router } = await renderWithProviders(SubscribeSharePage, {
      initialRoute: '/subscribe-share?keyword=initial',
      global: {
        stubs: {
          SubscribeShareView: SubscribeShareViewStub,
          VScrollToTopBtn: true,
        },
      },
    })

    expect(screen.getByLabelText('route-share-keyword')).toHaveTextContent('initial')
    await router.push('/subscribe-share?keyword=updated-query')
    await waitFor(() => expect(screen.getByLabelText('route-share-keyword')).toHaveTextContent('updated-query'))
  })
})
