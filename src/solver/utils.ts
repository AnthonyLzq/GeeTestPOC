import puppeteer, { Page } from 'puppeteer'

const SLIDE_CAPTCHA_URL = 'https://www.geetest.com/en/demo'

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
    args: ['--incognito']
  })
  const context = await browser.createIncognitoBrowserContext()
  const page = await context.newPage()

  return { browser, context, page }
}

export { SLIDE_CAPTCHA_URL, createIncognitoBrowser, navigateTo, sleep }
