const { test, expect } = require("@playwright/test")
const { fixture, archive, compiled } = require("./fixtures/cartridges.cjs")

async function load(page, name, buffer) {
  await page.locator("#id-tab-btn-load").click()
  await page.locator("#id-load-loc-inp").setInputFiles({
    name, buffer, mimeType: "application/octet-stream",
  })
  await expect(page.locator("#id-splashscreen-play")).toBeVisible()
  await expect(page.locator("#id-tab-load-toaster")).toBeHidden()
}

function message(page) {
  return page.locator("#id-messagebox")
}

test.beforeEach(async ({ page, baseURL }) => {
  await page.route("**/*", route => {
    return route.request().url().startsWith(baseURL) ? route.continue() : route.abort()
  })
  await page.goto("/", { waitUntil: "networkidle" })
  await page.locator("#id-load-loc-inp").waitFor({ state: "attached" })
})

test("wheel and Page Down stay in the active view while toolbar links navigate", async ({ page }) => {
  await load(page, "synthetic.gwz", archive())
  const activeView = page.locator(".fp-section.active")
  await expect(activeView).toHaveId("section-emap")

  const emulator = await page.getByRole("dialog", { name: "Emulator" }).boundingBox()
  await page.mouse.move(emulator.x + 150, emulator.y + 92)
  await page.mouse.move(emulator.x + 90, emulator.y + emulator.height - 2)
  await page.mouse.wheel(0, 800)
  // The wheel event is delivered asynchronously by the browser.
  await page.waitForTimeout(150)
  await expect(activeView).toHaveId("section-emap")
  await page.locator("#id-webwigo-about-link").focus()
  await page.keyboard.press("PageDown")
  await expect(activeView).toHaveId("section-emap")

  const scale = page.locator("#id-emap .leaflet-control-scale-line")
    .filter({ hasText: /\d+ m$/ })
  const originalScale = await scale.textContent()
  await page.locator("#id-emap").hover({ position: { x: 700, y: 400 } })
  await page.mouse.wheel(0, -120)
  await expect(scale).not.toHaveText(originalScale)
  await expect(activeView).toHaveId("section-emap")

  await page.locator("#id-tab-btn-code").click()
  await expect(activeView).toHaveId("section-code")
  await page.locator("#id-tab-btn-data").click()
  await expect(activeView).toHaveId("section-data")
  await page.locator('#menu-left a[href="#map"]').click()
  await expect(activeView).toHaveId("section-emap")
})

test("task details, inventory target, literal inputs and zone entry reach Lua", async ({ page }) => {
  await load(page, "gameplay.lua", fixture("gameplay.lua"))
  await page.locator("#id-gpsr-toggle-onoff").click()
  await page.getByRole("button", { name: "Play", exact: true }).click()
  await message(page).getByRole("button", { name: "Gameplay" }).click()
  await expect(message(page)).toContainText("Open the task")
  await message(page).getByRole("button", { name: "Ok" }).click()
  await expect(page.locator("#id-detailscreen-desc")).toHaveText("The requested task details")
  await page.locator("#id-detailscreen-ok").click()
  await page.locator("#id-listscreen-back").click()

  await expect(page.locator("#id-mainscreen-items-2")).toContainText("Nothing of interest")
  await page.locator("#id-mainscreen-items-3").click()
  await page.locator("#id-listscreen").getByRole("button", { name: "Test tool" }).click()
  await page.getByRole("button", { name: "Use the tool" }).click()
  await page.locator("#id-detailscreen-items").getByRole("button", { name: "Test token" }).click()
  await expect(message(page)).toContainText("Used the tool on the token")
  await message(page).getByRole("button", { name: "Ok" }).click()

  await page.locator("#id-getinput-value").fill('I said "hello"')
  await page.locator("#id-getinput-submit").click()
  await page.getByRole("button", { name: "Fish & chips" }).click()
  await expect(message(page)).toContainText("Choice matched")
  await message(page).getByRole("button", { name: "Ok" }).click()

  await page.evaluate(() => new Promise(resolve => {
    window.require(["lib/m_map"], map => {
      map.setPlayerLocation({ lat: 0.05, lng: 0.05 })
      resolve()
    })
  }))
  await expect(message(page)).toContainText("Entered the test zone")
})

test("a restarted countdown waits for its new deadline", async ({ page }) => {
  await load(page, "gameplay.lua", fixture("gameplay.lua"))
  await page.getByRole("button", { name: "Play", exact: true }).click()
  await message(page).getByRole("button", { name: "Timer" }).click()
  await expect(message(page)).toContainText("Restart countdown")
  await page.waitForTimeout(850)
  const restart = Date.now()
  await message(page).getByRole("button", { name: "Ok" }).click()
  await expect(message(page)).toContainText("Countdown finished")
  expect(Date.now() - restart).toBeGreaterThanOrEqual(1700)
})

test("Play can recover from an engine download failure", async ({ page }) => {
  const engine = "**/lua/Wherigo.Engine.luac"
  await page.route(engine, route => route.fulfill({ status: 503 }))
  await load(page, "gameplay.lua", fixture("gameplay.lua"))
  const play = page.getByRole("button", { name: "Play", exact: true })
  await play.click()
  await expect(page.locator("#id-emul")).toContainText("Could not load Wherigo.Engine.luac")
  await page.unroute(engine)
  await page.locator("#id-lua-notice-ok").click()
  await play.click()
  await expect(message(page)).toContainText("Choose a test")
})

for (const [extension, makeCartridge] of [["gwz", archive], ["gwc", compiled]]) {
  test(`local .${extension} audio plays without fetching a media file`, async ({ page }) => {
    await page.addInitScript(forceBlock => {
      const play = HTMLMediaElement.prototype.play
      window.fixtureAudio = { source: null, blocked: false, ended: false }
      HTMLMediaElement.prototype.play = function() {
        window.fixtureAudio.source = this.src
        if (forceBlock) {
          forceBlock = false
          window.fixtureAudio.blocked = true
          return Promise.reject(new DOMException("Test autoplay block", "NotAllowedError"))
        }
        this.addEventListener("ended", () => { window.fixtureAudio.ended = true }, { once: true })
        return play.call(this).catch(error => {
          window.fixtureAudio.blocked = error.name === "NotAllowedError"
          throw error
        })
      }
    }, extension === "gwc")
    await page.reload({ waitUntil: "networkidle" })
    await page.locator("#id-load-loc-inp").waitFor({ state: "attached" })
    const requested = []
    page.on("request", request => requested.push(request.url()))

    await load(page, `synthetic.${extension}`, makeCartridge())
    if (extension === "gwc") {
      await expect(page.locator("#id-splashscreen")).toContainText("Départ près du test")
      await page.locator("#id-tab-btn-info").click()
      const info = page.locator("#id-tab-info-toaster")
      await expect(info).toContainText("3 (1 Lua, 0 images, 1 sounds, 1 others)")
      await page.locator("#id-tab-btn-info").click()
      await expect(info).toBeHidden()
    }
    await page.getByRole("button", { name: "Play", exact: true }).click()
    await expect(message(page)).toContainText("Audio requested")
    await page.waitForFunction(() => window.fixtureAudio.ended || window.fixtureAudio.blocked)
    if (await page.evaluate(() => window.fixtureAudio.blocked)) {
      const speaker = page.getByRole("button", { name: "Cartridge sound" })
      await expect(speaker).toHaveAttribute("title", "Enable cartridge sound")
      await expect(speaker).toHaveAttribute("aria-pressed", "false")
      await speaker.click()
      await expect(speaker).toHaveAttribute("aria-pressed", "true")
    }
    await page.waitForFunction(() => window.fixtureAudio.ended)
    expect(await page.evaluate(() => window.fixtureAudio.source)).toMatch(/^blob:/)
    expect(requested.some(url => /beep\.wav|synthetic\.(gwz|gwc)/.test(url))).toBe(false)
  })
}

test("speaker toggles cartridge audio and keeps the setting after Stop and Reload", async ({ page }) => {
  await page.evaluate(() => {
    const play = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function() {
      window.fixtureAudio = this
      return play.call(this)
    }
  })

  const speaker = page.getByRole("button", { name: "Cartridge sound" })
  await expect(speaker).toHaveAttribute("aria-pressed", "true")
  await speaker.click()
  await expect(speaker.locator("i")).toHaveClass(/fa-volume-off/)
  await expect(speaker).toHaveAttribute("aria-pressed", "false")

  await load(page, "synthetic.gwz", archive())
  const play = page.getByRole("button", { name: "Play", exact: true })
  await play.click()
  await expect(message(page)).toContainText("Audio requested")
  await page.waitForFunction(() => window.fixtureAudio?.muted === true)
  await speaker.click()
  await expect(speaker.locator("i")).toHaveClass(/fa-volume-up/)
  await expect(speaker).toHaveAttribute("aria-pressed", "true")
  await page.waitForFunction(() => window.fixtureAudio?.muted === false)

  await speaker.click()
  await page.getByRole("button", { name: "Stop cartridge" }).click()
  await page.getByRole("button", { name: "Reload cartridge" }).click()
  await play.click()
  await expect(message(page)).toContainText("Audio requested")
  await expect(speaker).toHaveAttribute("aria-pressed", "false")
  await page.waitForFunction(() => window.fixtureAudio?.muted === true)
})
