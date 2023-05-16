import { solver as sliderSolver } from '../src/solver/slider'

describe('GeeTestPOC tests', () => {
  it('Must solve the GeeTest slider test', async () => {
    const result = await sliderSolver()

    expect(result).toBe(true)
  }, 45_000)
})
