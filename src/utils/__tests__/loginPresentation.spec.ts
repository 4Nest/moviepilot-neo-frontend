import { getLoginVisualProfile } from '@/utils/loginPresentation'
import { describe, expect, it } from 'vitest'

describe('login presentation', () => {
  it('maps resolved and legacy themes to solid dark or light workbench profiles', () => {
    expect(getLoginVisualProfile('dark')).toBe('dark')
    expect(getLoginVisualProfile('light')).toBe('light')
    expect(getLoginVisualProfile('glass')).toBe('dark')
    expect(getLoginVisualProfile('transparent')).toBe('dark')
    expect(getLoginVisualProfile('purple')).toBe('dark')
    expect(getLoginVisualProfile(undefined)).toBe('dark')
  })
})
