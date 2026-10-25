/** Transparent product artwork through the real shipped Mantur composition. */
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import { launchWebScaffold } from './scaffold.ts'

it('keeps the transparent English wordmark beside the complete Chinese sidebar name', async () => {
  const hub = createServer((_request, response) => {
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({ code: 0, data: [] }))
  })
  await new Promise<void>((resolve, reject) => {
    hub.once('error', reject)
    hub.listen(0, '127.0.0.1', resolve)
  })
  let scaffold: Awaited<ReturnType<typeof launchWebScaffold>> | undefined
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  try {
    const address = hub.address()
    if (address === null || typeof address === 'string') throw new Error('Missing local fixture port')
    scaffold = await launchWebScaffold({
      extraOverlayPath: fileURLToPath(new URL('../../../packages/bundle/mantur-app/cordis.patch.yml', import.meta.url)),
      extraInstallAnchors: [fileURLToPath(new URL('../../../packages/bundle/mantur-app/package.json', import.meta.url))],
      deepSeekMissingCredential: true,
      manturHubBaseUrl: `http://127.0.0.1:${address.port}`,
    })
    // macOS development uses installed Chrome; Linux CI uses its pinned Chromium.
    browser = await chromium.launch(process.platform === 'darwin' ? { channel: 'chrome' } : {})
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, locale: 'zh-CN' })
    await page.goto(scaffold.authenticatedUrl)
    const brand = page.locator('[class*="brandIdentity"]').first()
    const logo = brand.locator('img')
    await logo.waitFor({ state: 'visible' })
    expect(await logo.getAttribute('src')).toContain('aiying-wordmark.svg')
    expect(await brand.getByText('爱映工厂', { exact: true }).count()).toBe(1)
    expect(await brand.locator('[class*="brandName"]').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    expect(await logo.evaluate(async (element) => {
      const image = element as HTMLImageElement
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
      const context = canvas.getContext('2d')!
      context.drawImage(image, 0, 0)
      return context.getImageData(0, 0, 1, 1).data[3]
    })).toBe(0)
    const renderedEdges = await logo.evaluate(async (element) => {
      const image = element as HTMLImageElement
      await image.decode()
      return [1, 1.25, 1.5, 2].map((scale) => {
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(image.clientWidth * scale)
        canvas.height = Math.ceil(image.clientHeight * scale)
        const context = canvas.getContext('2d')!
        const height = canvas.width * image.naturalHeight / image.naturalWidth
        context.drawImage(image, 0, (canvas.height - height) / 2, canvas.width, height)
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
        let partialAlpha = 0
        let whitePixels = 0
        for (let index = 0; index < pixels.length; index += 4) {
          const alpha = pixels[index + 3]!
          if (alpha > 0 && alpha < 255) partialAlpha++
          if (alpha > 0 && pixels[index]! > 240 && pixels[index + 1]! > 240 && pixels[index + 2]! > 240) whitePixels++
        }
        return { partialAlpha, whitePixels }
      })
    })
    for (const edges of renderedEdges) {
      expect(edges.partialAlpha).toBeGreaterThan(0)
      expect(edges.whitePixels).toBe(0)
    }
  } finally {
    const cleanup = await Promise.allSettled([
      browser?.close(), scaffold?.close(),
      new Promise<void>((resolve, reject) => hub.close(error => error ? reject(error) : resolve())),
    ])
    const failures = cleanup.flatMap(result => result.status === 'rejected' ? [result.reason as unknown] : [])
    if (failures.length > 0) throw new AggregateError(failures, 'Wordmark fixture cleanup failed')
  }
}, 120_000)
