import puppeteer, { Page } from 'puppeteer'

const SLIDE_CAPTCHA_URL = 'https://www.geetest.com/en/demo'
const GEE_TEST_SELECTOR = '.geetest_radar_tip'

const sleep = (time: number) =>
  new Promise(resolve => setTimeout(resolve, time))

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
    headless: process.env.NODE_ENV !== 'local',
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

export {
  SLIDE_CAPTCHA_URL,
  GEE_TEST_SELECTOR,
  createIncognitoBrowser,
  navigateTo,
  sleep
}
