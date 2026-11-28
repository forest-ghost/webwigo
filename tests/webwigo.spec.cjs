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
  await load(page, "synthetic.gwz", await archive())
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

  await expect(page.locator("#id-code pre")).toHaveCount(0)
  await expect(page.locator("#id-data img")).toHaveCount(0)
  await page.locator("#id-builder-tools").click()
  await page.locator("#id-tab-btn-code").click()
  await expect(activeView).toHaveId("section-code")
  await expect(page.locator("#id-code .token").first()).toBeVisible()
  await page.locator("#id-builder-tools").click()
  await page.locator("#id-tab-btn-data").click()
  await expect(activeView).toHaveId("section-data")
  await expect(page.locator("#id-data img").first()).toBeVisible()
  await page.locator('#menu-left a[href="#map"]').click()
  await expect(activeView).toHaveId("section-emap")
})

test("task details, inventory target, literal inputs and zone entry reach Lua", async ({ page }) => {
  await load(page, "gameplay.lua", fixture("gameplay.lua"))
  await expect(page.getByRole("button", { name: "Simulated GPS on" })).toHaveAttribute("aria-pressed", "true")
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

test("first Play loads Lua, shows Loading, and retries a failed VM download", async ({ page }) => {
  const vm = "**/js/lib/lua.vm.js"
  const requests = []
  page.on("request", request => {
    if (request.url().endsWith("/js/lib/lua.vm.js"))
      requests.push(request.url())
  })
  const earlier = await page.evaluate(() => performance.getEntriesByType("resource")
    .filter(entry => entry.name.endsWith("/js/lib/lua.vm.js")).length)
  expect(earlier).toBe(0)
  await load(page, "gameplay.lua", fixture("gameplay.lua"))
  expect(requests).toHaveLength(0)

  let failDownload
  const pending = new Promise(resolve => { failDownload = resolve })
  await page.route(vm, async route => {
    await pending
    await route.fulfill({ status: 503 })
  }, { times: 1 })
  const splashButton = page.locator("#id-splashscreen-play")
  try {
    await splashButton.click()
    await expect(splashButton).toHaveText("Loading")
    await expect(splashButton).toBeDisabled()
    await expect.poll(() => requests.length).toBe(1)
  } finally {
    failDownload()
  }
  await expect(page.locator("#id-emul")).toContainText("Could not load lua.vm.js")
  await page.locator("#id-lua-notice-ok").click()
  await expect(splashButton).toHaveText("Play")
  await splashButton.click()
  await expect(message(page)).toContainText("Choose a test")
  expect(requests).toHaveLength(2)

  await page.getByRole("button", { name: "Stop cartridge" }).click()
  await splashButton.click()
  await expect(message(page)).toContainText("Choose a test")
  expect(requests).toHaveLength(2)
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

    await load(page, `synthetic.${extension}`, await makeCartridge())
    if (extension === "gwc") {
      await expect(page.locator("#id-splashscreen")).toContainText("Départ près du test")
      await page.locator("#id-builder-tools").click()
      await page.locator("#id-tab-btn-info").click()
      const info = page.locator("#id-tab-info-toaster")
      await expect(info).toContainText("3 (1 Lua, 0 images, 1 sounds, 1 others)")
      await page.locator("#id-builder-tools").click()
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

  await load(page, "synthetic.gwz", await archive())
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
  await page.locator("#id-builder-tools").click()
  await page.getByRole("button", { name: "Reload file" }).click()
  await play.click()
  await expect(message(page)).toContainText("Audio requested")
  await expect(speaker).toHaveAttribute("aria-pressed", "false")
  await page.waitForFunction(() => window.fixtureAudio?.muted === true)
})


test.describe("touch navigation", () => {
  test.use({ hasTouch: true })

  test("a narrow screen keeps Play and a keyboard prompt usable", async ({ page }) => {
    const source = Buffer.from([
      'local Wherigo = require "Wherigo"',
      'local cart = Wherigo.ZCartridge()',
      'cart.Name = "Mobile layout fixture"',
      'cart.Description = "' + "A long synthetic description for the emulator panel. ".repeat(32) + '"',
      'local prompt = Wherigo.ZInput(cart)',
      'prompt.Text = "Enter the test word"',
      'prompt.InputType = "Text"',
      'function prompt:OnGetInput(answer) Wherigo.MessageBox{Text = "Received: " .. answer} end',
      'function cart:OnStart() Wherigo.GetInput(prompt) end',
      'return cart',
    ].join("\n"))
    await load(page, "mobile.lua", source)
    await page.setViewportSize({ width: 320, height: 568 })

    const splashPlay = page.locator("#id-splashscreen-play")
    await expect(splashPlay).toBeInViewport({ ratio: 1 })
    await expect(page.getByRole("button", { name: "Tools" })).toBeInViewport({ ratio: 1 })
    await expect(page.getByRole("button", { name: "Cartridge sound" })).toBeInViewport({ ratio: 1 })
    await expect(page.getByRole("link", { name: "About" })).toBeInViewport({ ratio: 1 })
    const tools = page.getByRole("button", { name: "Tools" })
    await tools.tap()
    const reload = page.getByRole("button", { name: "Reload file" })
    await expect(reload).toBeVisible()
    expect(await reload.evaluate(button => {
      const bounds = button.getBoundingClientRect()
      return button.contains(document.elementFromPoint(bounds.left + 20, bounds.top + bounds.height / 2))
    })).toBe(true)
    await tools.tap()
    await expect(tools).toHaveAttribute("aria-expanded", "false")
    await splashPlay.tap()

    const input = page.getByRole("textbox", { name: "Answer" })
    await expect(input).toBeFocused()
    await input.fill("trail")
    await input.press("Enter")
    await expect(message(page)).toContainText("Received: trail")
    await expect(message(page).getByRole("button")).toBeFocused()
  })
})

test("the Stop button recovers from a cartridge stuck during startup", async ({ page }) => {
  const source = Buffer.from([
    'local Wherigo = require "Wherigo"',
    'local cart = Wherigo.ZCartridge()',
    'cart.Name = "Slow fixture"',
    'function cart:OnStart()',
    '  print("Starting fixture loop")',
    '  while true do end',
    'end',
    'return cart',
  ].join("\n"))
  await load(page, "slow.lua", source)
  const loopEntered = page.waitForEvent("console", {
    predicate: entry => entry.text().includes("Starting fixture loop"),
  })
  await page.locator("#id-splashscreen-play").click()
  await loopEntered
  await page.getByRole("button", { name: "Stop cartridge" }).click()
  await load(page, "gameplay.lua", fixture("gameplay.lua"))
  await page.locator("#id-splashscreen-play").click()
  await expect(message(page)).toContainText("Choose a test")
})

test("hidden zones disappear and can be shown explicitly by a builder", async ({ page }) => {
  const source = fixture("gameplay.lua").toString().replace(
    'function cart:OnStart()\n', 'function cart:OnStart()\n  zone.Visible = false\n')
  await load(page, "zones.lua", Buffer.from(source))
  await page.locator("#id-splashscreen-play").click()
  await expect(message(page)).toContainText("Choose a test")
  await expect(page.locator("#id-emap path[stroke='green']")).toHaveCount(0)
  await page.getByRole("button", { name: "Tools" }).click()
  await page.getByRole("button", { name: "Show hidden zones" }).click()
  await expect(page.locator("#id-emap path[stroke='red']")).toHaveCount(1)
  await page.getByRole("button", { name: "Tools" }).click()
  await page.getByRole("button", { name: "Show hidden zones" }).click()
  await expect(page.locator("#id-emap path[stroke='red']")).toHaveCount(0)
})

test("ordinary query parameters leave the player ready and a private basemap stays off", async ({ page }) => {
  await page.goto("/?utm_source=fixture")
  await expect(page.getByRole("button", { name: "Load cartridge" })).toBeEnabled()
  await expect(page.locator("#id-tab-load-toaster")).toBeHidden()
  const supportedFiles = page.getByText("Supported files: .gwc, .gwz, and .lua.")
  await expect(supportedFiles).toBeHidden()
  const loadButton = page.getByRole("button", { name: "Load cartridge" })
  await loadButton.click()
  await expect(supportedFiles).toBeVisible()
  await loadButton.click()
  await page.getByRole("button", { name: "Tools" }).click()
  await page.getByRole("button", { name: "Basemap" }).click()
  const tiles = []
  page.on("request", request => {
    if (request.url().startsWith("https://tile.openstreetmap.org/"))
      tiles.push(request.url())
  })
  await page.reload({ waitUntil: "networkidle" })
  await load(page, "gameplay.lua", fixture("gameplay.lua"))
  const gps = page.locator("#id-gpsr-toggle-onoff")
  await expect(gps).toHaveAttribute("aria-pressed", "true")
  await gps.click()
  await expect(gps).toHaveAttribute("aria-pressed", "false")
  await gps.click()
  await expect(gps).toHaveAttribute("aria-pressed", "true")
  await expect(page.locator("#id-latitude")).toHaveText("N00° 03.000")
  await expect(page.getByText("Set location", { exact: true })).toHaveCount(0)
  expect(tiles).toHaveLength(0)
})

test("failed startup tells the player to reload and keeps Load unavailable", async ({ page }) => {
  await page.route("**/js/app/app1.js", route => route.abort())
  await page.reload()
  const status = page.locator("#id-player-status")
  await expect(status).toContainText("WebWigo could not start")
  await expect(page.getByRole("button", { name: "Reload page" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Load cartridge" })).toBeDisabled()
})


test("tall cartridge icons and long descriptions stay inside their list rows", async ({ page }) => {
  const icon = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement("canvas")
    canvas.width = 100
    canvas.height = 600
    const drawing = canvas.getContext("2d")
    drawing.fillStyle = "#336699"
    drawing.fillRect(0, 0, canvas.width, canvas.height)
    return canvas.toDataURL("image/png").split(",", 2)[1]
  }), "base64")
  const source = [
    'local Wherigo = require "Wherigo"',
    'local cart = Wherigo.ZCartridge()',
    'cart.Name = "Synthetic list layout"',
    'local icon = Wherigo.ZMedia(cart)',
    'icon.Resources = {{Type = "png", Filename = "tall.png"}}',
    'local first = Wherigo.ZItem(cart)',
    'first.Name = "Tall icon"',
    'first.Icon = icon',
    'first.Description = "' + "A row description with enough text to wrap on a phone. ".repeat(12) + '"',
    'first.Visible = true',
    'local second = Wherigo.ZItem(cart)',
    'second.Name = "Next row"',
    'second.Visible = true',
    'function cart:OnStart()',
    '  first:MoveTo(Wherigo.Player)',
    '  second:MoveTo(Wherigo.Player)',
    'end',
    'return cart',
  ].join("\n")
  await page.setViewportSize({ width: 320, height: 568 })
  await load(page, "layout.gwz", await archive({ "cartridge.lua": source, "tall.png": icon }))
  await page.locator("#id-splashscreen-play").click()
  const inventory = page.locator("#id-mainscreen-items-3")
  await expect(inventory).toContainText("Tall icon")
  await inventory.click()

  const first = page.getByRole("button", { name: /^Tall icon/ })
  const second = page.getByRole("button", { name: "Next row" })
  const image = first.locator("img")
  await expect.poll(() => image.evaluate(element => element.naturalHeight)).toBe(600)
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 800 })
    await expect(first).toBeVisible()
    const [row, thumbnail, description, next] = await Promise.all([
      first.boundingBox(), image.boundingBox(), first.locator(".wig-list-description").boundingBox(), second.boundingBox(),
    ])
    expect(thumbnail.height).toBeLessThanOrEqual(40)
    expect(thumbnail.y + thumbnail.height).toBeLessThanOrEqual(row.y + row.height)
    expect(description.y + description.height).toBeLessThanOrEqual(row.y + row.height)
    const [upper, lower] = [row, next].sort((left, right) => left.y - right.y)
    expect(upper.y + upper.height).toBeLessThanOrEqual(lower.y)
  }
})
