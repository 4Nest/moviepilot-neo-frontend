import '@testing-library/jest-dom/vitest'
import { abortAllRequests } from '@/utils/requestOptimizer'
import { cleanup } from '@testing-library/vue'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { server } from './support/msw/server'

class ResizeObserverStub implements ResizeObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}

class IntersectionObserverStub implements IntersectionObserver {
  readonly root = null
  readonly rootMargin = '0px'
  readonly thresholds = [0]

  disconnect() {}
  observe() {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
  unobserve() {}
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  value: ResizeObserverStub,
  writable: true,
})

Object.defineProperty(globalThis, 'IntersectionObserver', {
  configurable: true,
  value: IntersectionObserverStub,
  writable: true,
})

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: (query: string): MediaQueryList => ({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn(),
  }),
  writable: true,
})

function ensureStorageClear(storage: Storage | undefined) {
  if (storage && typeof storage.clear !== 'function') {
    Object.defineProperty(storage, 'clear', { configurable: true, value: vi.fn() })
  }
}

ensureStorageClear(globalThis.localStorage)
ensureStorageClear(globalThis.sessionStorage)
ensureStorageClear(window.localStorage)
ensureStorageClear(window.sessionStorage)

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
  cleanup()
  abortAllRequests()
  server.resetHandlers()
  if (typeof localStorage?.clear === 'function') localStorage.clear()
  if (typeof sessionStorage?.clear === 'function') sessionStorage.clear()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

afterAll(() => {
  server.close()
})
