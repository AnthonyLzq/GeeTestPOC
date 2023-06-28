import puppeteer, { Page } from 'puppeteer'

const sleep = (maxTime: number, minTime = 0) => {
  const time =
    minTime > 0 ? Math.random() * (maxTime - minTime + 1) + minTime : maxTime

  return new Promise(resolve => setTimeout(resolve, time))
}

const navigateTo = async ({
  page,
  url,
  selector
}: {
  page: Page
  url: string
  selector?: string
}) => {
  await page.goto(url, {
    timeout: 60_000,
    waitUntil: 'networkidle2'
  })

  if (selector) {
    await page.waitForSelector(selector)
    await page.click(selector)
    await sleep(5_000)
  }
}

const createIncognitoBrowser = async () => {
  const browser = await puppeteer.launch({
    headless: !process.env.HEADLESS,
    args: [
      '--incognito',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process'
    ],
    devtools: true
  })
  const context = await browser.createIncognitoBrowserContext()
  const page = await context.newPage()

  return { browser, page }
}

export { createIncognitoBrowser, navigateTo, sleep }
