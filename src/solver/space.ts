import { Browser, Page } from 'puppeteer'
import axios from 'axios'
import { createIncognitoBrowser, navigateTo, sleep } from './utils'

const SITE_URL = 'https://nuwber.com/'
const LOAD_CAPTCHA_URL_CONTENT = 'get.php'
const LOAD_CAPTCHA_URL_CONTENT_RESPONSE = 'GEE'
const API_KEY = process.env.API_KEY

type GeeTestValues = {
  challenge: string
  gt: string
}

type SolvedCaptcha = {
  geetest_challenge: string
  geetest_validate: string
  geetest_seccode: string
}

const solveGeeTest = async (geeTestValues: GeeTestValues) => {
  const url = `http://2captcha.com/in.php?key=${API_KEY}&method=geetest&gt=${geeTestValues.gt}&challenge=${geeTestValues.challenge}&pageurl=${SITE_URL}&json=1`
  const { data } = await axios.get(url)
  console.log('data', data)

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
      xhr.onreadystatechange = function (event) {
        console.log('ev', event)

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

    let firstTryJSBlock = true
    let firstTry = true
    let geeTestValues: GeeTestValues | undefined

    await page.setRequestInterception(true)

    page.on('request', async request => {
      if (request.url().includes(LOAD_CAPTCHA_URL_CONTENT) && firstTryJSBlock) {
        await request.abort()
        firstTryJSBlock = false
      } else await request.continue()
    })

    page.on('response', async response => {
      if (
        response.url().includes(LOAD_CAPTCHA_URL_CONTENT_RESPONSE) &&
        firstTry
      ) {
        console.log(
          '🚀 ~ file: space.ts:42 ~ solver ~ response.url:',
          response.url()
        )

        firstTry = false
        try {
          geeTestValues = await page.evaluate((url: string) => {
            return fetch(url)
              .then(response => response.json())
              .then(data => data)
          }, response.url())
        } catch (e) {
          console.log('🚀 ~ file: space.ts:47 ~ solver ~ e:', e)
        }
      }
    })

    await navigateTo({
      page,
      url: SITE_URL
    })

    const captchaIframe = await page.$('#main-iframe')

    if (captchaIframe && geeTestValues)
      try {
        await sleep(5_000)
        await handleGeeTest(page, geeTestValues)

        return true
      } catch (e) {
        if (!geeTestValues)
          console.log('geeTestValues is undefined, something went wrong')
      }

    return false
  } catch (error) {
    console.log('error', error)

    return false
  } finally {
    await browser?.close()
  }
}

export { solver }
