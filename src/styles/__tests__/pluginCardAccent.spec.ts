import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'

describe('plugin card accent styles', () => {
  it('uses a nullable icon accent before falling back to the active primary theme color', () => {
    const commonStyles = readFileSync(resolve(cwd(), 'src/styles/common.scss'), 'utf8')
    const ruleStart = commonStyles.indexOf('.plugin-card__banner')
    const ruleEnd = commonStyles.indexOf('.grid-downloading-card', ruleStart)
    const bannerRule = commonStyles.slice(ruleStart, ruleEnd)

    expect(ruleStart).toBeGreaterThanOrEqual(0)
    expect(ruleEnd).toBeGreaterThan(ruleStart)
    expect(bannerRule).toContain(
      '--plugin-card-effective-accent-rgb: var(--plugin-card-accent-rgb, var(--v-theme-primary))',
    )
    expect(bannerRule).not.toContain('40, 169, 225')
    expect(bannerRule).not.toContain('--glass-material-accent-rgb')
  })
})
