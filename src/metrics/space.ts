import { appendFileSync } from 'fs'
import { join } from 'path'
import { solver } from '../solver/space'

const TOTAL = parseInt(process.argv[2]) || 10
let successCount = 0
let totalTime = 0

;(async () => {
  for (let i = 0; i < TOTAL; i++) {
    const time = performance.now()
    const result = await solver()

    totalTime = (performance.now() - time) / 1000

    if (result) successCount++
  }

  appendFileSync(
    join(__dirname, './space.csv'),
    `\n${TOTAL},${successCount},${
      (successCount / TOTAL) * 100
    }%,${totalTime.toFixed(2)}`
  )
})()
