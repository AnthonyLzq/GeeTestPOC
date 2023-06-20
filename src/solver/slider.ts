import { Browser, Page } from 'puppeteer'
import Jimp from 'jimp'
import pixelmatch from 'pixelmatch'
import { cv } from 'opencv-wasm'

import {
  SLIDE_CAPTCHA_URL,
  createIncognitoBrowser,
  navigateTo,
  sleep
} from './utils'

const SLIDE_CAPTCHA_SELECTOR = '.tab-item.tab-item-1'
const GEE_TEST_SELECTOR = '.geetest_radar_tip'
const GEE_TEST_CANVAS = '.geetest_canvas_img canvas'
const SLIDER_SELECTOR = '.geetest_slider_button'
const GEE_TEST_RESULT =
  '.geetest_success_radar_tip > span.geetest_success_radar_tip_content'

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

const getCaptchaImages = async (page: Page) => {
  const images = await page.$$eval('.geetest_canvas_img canvas', canvases => {
    return canvases.map(canvas => {
      // This will get the base64 image data from the html canvas.
      // The replace function simply strip the "data:image" prefix.
      return canvas.toDataURL().replace(/^data:image\/png;base64,/, '')
    })
  })

  // For each base64 string create a Javascript buffer.
  const buffers = images.map(img => Buffer.from(img, 'base64'))

  // And read each buffer into a Jimp image.
  return {
    captcha: await Jimp.read(buffers[0]),
    puzzle: await Jimp.read(buffers[1]),
    original: await Jimp.read(buffers[2])
  }
}

type Images = Awaited<ReturnType<typeof getCaptchaImages>>

const getDiffImage = async (images: Images) => {
  const { width, height } = images.original.bitmap

  // Use the pixelmatch package to create an image diff
  const diffImage = new Jimp(width, height)

  pixelmatch(
    images.original.bitmap.data,
    images.captcha.bitmap.data,
    diffImage.bitmap.data,
    width,
    height,
    { includeAA: true, threshold: 0.2 }
  )

  // Use opencv to make the diff result more clear
  const src = cv.matFromImageData(diffImage.bitmap)
  const dst = new cv.Mat()
  const kernel = cv.Mat.ones(5, 5, cv.CV_8UC1)
  const anchor = new cv.Point(-1, -1)

  cv.threshold(src, dst, 127, 255, cv.THRESH_BINARY)
  cv.erode(dst, dst, kernel, anchor, 1)
  cv.dilate(dst, dst, kernel, anchor, 1)

  return new Jimp({
    width: dst.cols,
    height: dst.rows,
    data: Buffer.from(dst.data)
  })
}

type DiffImage = Awaited<ReturnType<typeof getDiffImage>>

const getPuzzlePieceSlotCenterPosition = (diffImage: DiffImage) => {
  const src = cv.matFromImageData(diffImage.bitmap)
  const dst = new cv.Mat()

  cv.cvtColor(src, src, cv.COLOR_BGR2GRAY)
  cv.threshold(src, dst, 150, 255, cv.THRESH_BINARY_INV)

  // This will find the contours of the image.
  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()

  cv.findContours(
    dst,
    contours,
    hierarchy,
    cv.RETR_EXTERNAL,
    cv.CHAIN_APPROX_SIMPLE
  )

  // Next, extract the center position from these contours.
  const contour = contours.get(0)
  const moment = cv.moments(contour)
  const cx = Math.floor(moment.m10 / moment.m00)
  const cy = Math.floor(moment.m01 / moment.m00)

  // Just for fun, let's draw the contours and center on a new image.
  cv.cvtColor(dst, dst, cv.COLOR_GRAY2BGR)

  const red = new cv.Scalar(255, 0, 0)

  cv.drawContours(dst, contours, 0, red)
  cv.circle(dst, new cv.Point(cx, cy), 3, red)

  return {
    x: cx,
    y: cy
  }
}

type Center = ReturnType<typeof getPuzzlePieceSlotCenterPosition>

const findMyPuzzlePiecePosition = async (page: Page) => {
  // Must call the getCaptchaImages again, because we have changed the
  // slider position (and therefore the image)
  const images = await getCaptchaImages(page)
  const srcPuzzleImage = images.puzzle
  const srcPuzzle = cv.matFromImageData(srcPuzzleImage.bitmap)
  const dstPuzzle = new cv.Mat()

  cv.cvtColor(srcPuzzle, srcPuzzle, cv.COLOR_BGR2GRAY)
  cv.threshold(srcPuzzle, dstPuzzle, 127, 255, cv.THRESH_BINARY)

  const kernel = cv.Mat.ones(5, 5, cv.CV_8UC1)
  const anchor = new cv.Point(-1, -1)

  cv.dilate(dstPuzzle, dstPuzzle, kernel, anchor, 1)
  cv.erode(dstPuzzle, dstPuzzle, kernel, anchor, 1)

  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()

  cv.findContours(
    dstPuzzle,
    contours,
    hierarchy,
    cv.RETR_EXTERNAL,
    cv.CHAIN_APPROX_SIMPLE
  )

  const contour = contours.get(0)
  const moment = cv.moments(contour)

  return {
    x: Math.floor(moment.m10 / moment.m00),
    y: Math.floor(moment.m01 / moment.m00)
  }
}

const slidePuzzlePiece = async (page: Page, center: Center) => {
  const sliderHandle = await page.$(SLIDER_SELECTOR)

  if (!sliderHandle) throw new Error('Could not find slider handle.')

  const handle = await sliderHandle.boundingBox()

  if (!handle) throw new Error('Could not find slider handle bounding box.')

  const handleX = handle.x + handle.width / 2
  const handleY = handle.y + handle.height / 2

  await page.mouse.move(handleX, handleY, { steps: 25 })
  await page.mouse.down()
  await sleep(250)

  let destX = handleX + center.x
  const destY = handleY + 32

  await page.mouse.move(destX, handleY, { steps: 25 })
  await sleep(100)

  // find the location of my puzzle piece.
  const puzzlePos = await findMyPuzzlePiecePosition(page)

  destX = destX + center.x - puzzlePos.x
  await page.mouse.move(destX, destY, { steps: 5 })
  await page.mouse.up()
}

const solver = async () => {
  let browser: Browser | undefined

  try {
    const incognito = await createIncognitoBrowser()
    const { page } = incognito
    browser = incognito.browser

    await navigateTo({
      page,
      url: SLIDE_CAPTCHA_URL,
      selector: SLIDE_CAPTCHA_SELECTOR
    })
    await clickVerifyButton(page)

    if (await verifyCaptchaResolved(page)) return true

    const images = await getCaptchaImages(page)
    const diffImage = await getDiffImage(images)
    const center = getPuzzlePieceSlotCenterPosition(diffImage)

    await slidePuzzlePiece(page, center)
    await sleep(3_000)

    let result = false

    if (await verifyCaptchaResolved(page)) result = true

    return result
  } catch (error) {
    console.error(error)

    return false
  } finally {
    await browser?.close()
  }
}

export { solver }
