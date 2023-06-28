import { Browser, Page } from 'puppeteer'
import axios from 'axios'
import { createIncognitoBrowser, navigateTo, sleep } from './utils'

const SITE_URL = 'https://www.geetest.com/en/demo'
const SPACE_CAPTCHA_SELECTOR = '.tab-item.tab-item-3 > button'
const GEE_TEST_SELECTOR = '.geetest_radar_tip'
const GEE_TEST_CANVAS = '.geetest_fullpage_click_box'
const LOAD_CAPTCHA_URL_CONTENT = 'get.php'
const LOAD_CAPTCHA_URL_CONTENT_RESPONSE = 'GEE'
const GEE_TEST_RESULT =
  '.geetest_success_radar_tip > span.geetest_success_radar_tip_content'

const API_KEY = process.env.API_KEY

const clickVerifyButton = async (page: Page) => {
  await page.click(GEE_TEST_SELECTOR)
  await page.waitForSelector(GEE_TEST_CANVAS, { visible: true })
  await sleep(1_000)
}

const verifyCaptchaResolved = async (page: Page) => {
  try {
    await page.waitForSelector(GEE_TEST_RESULT, {
      visible: true,
      timeout: 10_000
    })

    return true
  } catch (error) {
    return false
  }
}

type GeeTestValues = {
  challenge: string | undefined
  gt: string | undefined
}

type SolvedCaptcha = {
  geetest_challenge: string
  geetest_validate: string
  geetest_seccode: string
}

const solveGeeTest = async (geeTestValues: GeeTestValues) => {
  const { gt, challenge } = geeTestValues

  if (!gt || !challenge) {
    if (!gt) throw new Error('gt is undefined')

    throw new Error('challenge is undefined')
  }

  const url = `http://2captcha.com/in.php?key=${API_KEY}&method=geetest&gt=${gt}&challenge=${challenge}&pageurl=${SITE_URL}&json=1`
  const { data } = await axios.get(url)

  const captchaId = data.request
  let complete = false
  let attempt = 0
  let captchaJson:
    | {
        status: number
        request: string | SolvedCaptcha
      }
    | undefined

  // It takes a bit of time to complete the geetest so we have to poll for it.
  // 175 seconds seems like enough (35 * 5)
  while (!complete && attempt < 35) {
    await sleep(5_000)
    attempt++
    const captchaUrl = `http://2captcha.com/res.php?key=${API_KEY}&action=get&id=${captchaId}&json=1`
    const captchaResponse = await axios.get(captchaUrl)
    captchaJson = captchaResponse.data

    if (
      captchaJson?.status === 1 ||
      captchaJson?.request !== 'CAPCHA_NOT_READY'
    )
      complete = true
  }

  return captchaJson?.request
}

const handleGeeTest = async (page: Page, geeTestValues: GeeTestValues) => {
  const iframeSrc = await page.$eval('iframe[id="main-iframe"]', element =>
    element.getAttribute('src')
  )
  const dai = iframeSrc?.match(/incident_id=([^&]*)/)?.[1]?.split('-')[1]
  const cts = iframeSrc?.match(/cts=([^&]*)/)?.[1]

  if (!dai || !cts) throw new Error('Failed to get dai or cts from iframe src')

  const solvedCaptcha = await solveGeeTest(geeTestValues)

  if (typeof solvedCaptcha === 'string')
    throw new Error(
      'Something went wrong, solvedCaptcha should not be a string'
    )

  if (!solvedCaptcha?.geetest_challenge)
    throw new Error('failed to solve captcha')

  await page.evaluate(
    (solvedCaptcha: SolvedCaptcha, dai: string, cts: string) => {
      if (!window.XMLHttpRequest)
        throw new Error('window.XMLHttpRequest is not defined')

      // This is their code that I copied so I could perfectly emulate how they submitted these values.
      const xhr = new window.XMLHttpRequest()
      const postBody =
        'geetest_challenge=' +
        solvedCaptcha.geetest_challenge +
        '&geetest_validate=' +
        solvedCaptcha.geetest_validate +
        '&geetest_seccode=' +
        solvedCaptcha.geetest_seccode

      xhr.open(
        'POST',
        `/_Incapsula_Resource?SWCGHOEL=gee&dai=${dai}&cts=${cts}`,
        true
      )
      xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded')
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) window.parent.location.reload()
      }
      xhr.send(postBody)
    },
    solvedCaptcha,
    dai,
    cts
  )

  await sleep(1500)
  await page.goto(SITE_URL)
}

const solver = async () => {
  let browser: Browser | undefined

  try {
    const incognito = await createIncognitoBrowser()
    const { page } = incognito

    browser = incognito.browser
    await navigateTo({
      page,
      url: SITE_URL
    })
    await page.setRequestInterception(true)

    let firstTryJSBlock = true
    let geeTestValues: GeeTestValues | undefined

    page.on('request', async request => {
      if (request.url().includes(LOAD_CAPTCHA_URL_CONTENT) && firstTryJSBlock) {
        await request.abort()
        firstTryJSBlock = false

        try {
          geeTestValues = await page.evaluate(async (url: string) => {
            const gt = url.match(/gt=([^&]*)/)?.[1]
            const challenge = url.match(/challenge=([^&]*)/)?.[1]

            return {
              gt,
              challenge
            }
          }, request.url())
        } catch (e) {}
      } else await request.continue()
    })
    await page.click(SPACE_CAPTCHA_SELECTOR)
    await sleep(5_000)

    if (geeTestValues)
      try {
        await sleep(5_000)
        const solvedCaptcha = await solveGeeTest(geeTestValues)
        console.log(
          '🚀 ~ file: space.ts:183 ~ solver ~ solvedCaptcha:',
          solvedCaptcha
        )

        return typeof solvedCaptcha === 'object'
      } catch (e) {
        console.log('🚀 ~ file: space.ts:186 ~ solver ~ e:', e)

        if (!geeTestValues)
          console.log('geeTestValues is undefined, something went wrong')
      }
    else console.log('geeTestValues is undefined, something went wrong')

    return false
  } catch (error) {
    console.log('error', error)

    return false
  } finally {
    await browser?.close()
  }
}

export { solver }
