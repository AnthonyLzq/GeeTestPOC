import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { solver } from '../src/solver'

describe('GeetestPOC tests', () => {
  it('Must find a "solved.png file"', async () => {
    await solver()
    expect(existsSync(join(__dirname, '../src/images/solved.png'))).toBe(true)
  }, 30_000)
})
