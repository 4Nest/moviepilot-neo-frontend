import SharedDialogHost from '@/components/dialog/SharedDialogHost.vue'
import { openSharedDialog, useSharedDialog } from '@/composables/useSharedDialog'
import { useAuthStore } from '@/stores/auth'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const SecretDialog = defineComponent({
  props: { secret: String },
  setup: props => () => h('div', { 'data-secret': true }, props.secret),
})

describe('shared dialog save and authentication lifecycle', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useSharedDialog().clearDialogs()
  })

  it.each(['close', 'update:modelValue'] as const)(
    'forwards synchronous save/done events after %s before disposing the dialog',
    async closeEvent => {
      const save = vi.fn()
      const done = vi.fn()
      const payload = { id: 1, name: 'updated' }
      const SaveDialog = defineComponent({
        emits: ['close', 'update:modelValue', 'save', 'done'],
        setup(_props, { emit }) {
          return () =>
            h('button', {
              onClick: () => {
                emit(closeEvent, false)
                emit('save', payload)
                emit('done')
              },
            })
        },
      })

      const host = mount(SharedDialogHost)
      openSharedDialog(SaveDialog, {}, { save, done }, { closeOn: ['close', 'update:modelValue'] })
      await flushPromises()

      await host.get('button').trigger('click')

      expect(save).toHaveBeenCalledExactlyOnceWith(payload)
      expect(done).toHaveBeenCalledOnce()
      expect(useSharedDialog().dialogs.value).toHaveLength(0)
      await flushPromises()
      expect(host.find('button').exists()).toBe(false)
      host.unmount()
    },
  )

  it('rejects delayed events after a normal close has completed', async () => {
    let emitLateDone!: () => void
    const done = vi.fn()
    const DelayedDialog = defineComponent({
      emits: ['close', 'done'],
      setup(_props, { emit }) {
        emitLateDone = () => emit('done')
        return () => h('button', { onClick: () => emit('close') })
      },
    })

    const host = mount(SharedDialogHost)
    openSharedDialog(DelayedDialog, {}, { done })
    await flushPromises()

    await host.get('button').trigger('click')
    emitLateDone()

    expect(done).not.toHaveBeenCalled()
    expect(useSharedDialog().dialogs.value).toHaveLength(0)
    host.unmount()
  })

  it('clears active dialogs and blocks late callbacks immediately on logout or session reset', async () => {
    const auth = useAuthStore()
    auth.setToken('account-a')

    let emitLateDone!: () => void
    const onDone = vi.fn()
    const DelayedDialog = defineComponent({
      emits: ['done'],
      setup(_props, { emit }) {
        emitLateDone = () => emit('done', 'private-a-data')
        return () => h('div', { 'data-dialog': 'delayed' })
      },
    })

    const host = mount(SharedDialogHost)
    openSharedDialog(SecretDialog, { secret: 'secret-token' })
    openSharedDialog(DelayedDialog, {}, { done: onDone })
    await flushPromises()
    expect(host.find('[data-secret]').text()).toBe('secret-token')

    auth.logout()
    emitLateDone()

    expect(useSharedDialog().dialogs.value).toHaveLength(0)
    expect(onDone).not.toHaveBeenCalled()
    await flushPromises()
    expect(host.find('[data-secret]').exists()).toBe(false)
    host.unmount()
  })
})
