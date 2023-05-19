import { solver } from '../src/solver/space'

describe('GeeTestPOC tests', () => {
  it('Must solve the GeeTest space test', async () => {
    const result = await solver()

    expect(result).toBe(true)
  }, 300_000)
})
