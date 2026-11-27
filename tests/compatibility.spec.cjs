const { test, expect } = require("@playwright/test")
const { archive, compiled, fixture } = require("./fixtures/cartridges.cjs")

const source = [
  'local wig = require("Wherigo")',
  '-- Ignore fake = Wherigo.ZCartridge() in comments.',
  'local cart = wig.ZCartridge()',
  "cart.Name = 'Fixture \\'title\\''",
  'cart.Description = [=[',
  'A multiline description.',
  ']=]',
  'cart.StartingLocation = wig.ZonePoint(',
  '  -0.05, 0.04, 0',
  ')',
  'function cart:OnStart()',
  '  wig.MessageBox{Text = "Cartridge started"}',
  'end',
  'return cart',
].join("\n")
const popup = page => page.locator("#id-messagebox")
const play = page => page.getByRole("button", { name: "Play", exact: true })

test.beforeEach(async ({ page, baseURL }) => {
  await page.route("**/*", route =>
    route.request().url().startsWith(baseURL) ? route.continue() : route.abort()
  )
  await page.goto("/", { waitUntil: "networkidle" })
})

async function select(page, name, buffer) {
  const panel = page.locator("#id-tab-load-toaster")
  if (!(await panel.isVisible()))
    await page.getByRole("button", { name: "Load cartridge", exact: true }).click()
  await page.locator("#id-load-loc-inp").setInputFiles({
    name, buffer: Buffer.from(buffer), mimeType: "application/octet-stream",
  })
}

async function open(page, name, buffer) {
  await select(page, name, buffer)
  await expect(page.locator("#id-tab-load-toaster")).toBeHidden()
  await expect(play(page)).toBeVisible()
}

test("aliased Lua, quoted and long metadata, and multiline starting position", async ({ page }) => {
  await open(page, "aliased.lua", source)
  await expect(page.locator("#id-splashscreen")).toContainText("Fixture 'title'")
  await expect(page.locator("#id-splashscreen")).toContainText("A multiline description.")
  await expect(page.locator("#id-latitude")).toHaveText("S00° 03.000")
  await play(page).click()
  await expect(popup(page)).toContainText("Cartridge started")
})

test("uses the GWZ entry point and loads a bundled Lua module", async ({ page }) => {
  const cartridge = source
    .replace('local cart = wig.ZCartridge()', 'local helper = require("lib.helper")\nlocal cart = wig.ZCartridge()')
    .replace('"Cartridge started"', 'helper.message')
  await open(page, "package.gwz", archive({
    "project/cartridge.lua": cartridge,
    "project/lib/helper.lua": 'return { message = "Bundled module loaded" }',
    "unrelated.lua": "return {}",
  }))
  await play(page).click()
  await expect(popup(page)).toContainText("Bundled module loaded")

  await open(page, "another.lua", cartridge)
  await play(page).click()
  await expect(page.locator("#id-emul")).toContainText("module 'lib.helper' not found")
  await expect(page.locator("#id-emul")).toContainText("put them together in a GWZ archive")
})

test("gives actionable errors for source-less and ambiguous GWZ files", async ({ page }) => {
  await select(page, "missing.gwz", archive({ "notes.txt": "Fixture" }))
  const error = page.locator("#id-load-err-msg")
  await expect(error).toBeVisible()
  await expect(error).toHaveText("This GWZ does not contain a Lua source file.")
  await select(page, "multiple.gwz", archive({ "one.lua": source, "two.lua": source }))
  await expect(error).toHaveText(/more than one cartridge source/)
  await open(page, "valid.lua", source)
})

test("plays GWC bytecode compiled with eight-byte Lua string lengths", async ({ page }) => {
  await open(page, "compiled-64.gwc", compiled(fixture("media-64.luac")))
  await play(page).click()
  await expect(popup(page)).toContainText("Audio requested")
})

for (const extension of ["gwc", "gwz"]) {
  test("plays local Garmin tones from " + extension.toUpperCase(), async ({ page }) => {
    const tone = Buffer.alloc(12)
    tone.writeUInt16LE(440, 2)
    tone.writeUInt16LE(150, 4)
    tone.writeUInt16LE(1, 6)
    tone.writeUInt16LE(100, 10)
    const bytes = extension === "gwc"
      ? compiled(fixture("media.luac"), { type: 19, bytes: tone })
      : archive({
        "cartridge.lua": fixture("media.lua").toString().replaceAll("wav", "fdl"),
        "beep.fdl": tone,
      })
    await page.evaluate(() => {
      const playMedia = HTMLMediaElement.prototype.play
      HTMLMediaElement.prototype.play = function() {
        window.testTone = this
        return playMedia.call(this)
      }
    })
    await open(page, "tone." + extension, bytes)
    await play(page).click()
    await expect(popup(page)).toContainText("Audio requested")
    await page.waitForFunction(() => Number.isFinite(window.testTone?.duration))
    const speaker = page.getByRole("button", { name: "Cartridge sound" })
    if (await speaker.getAttribute("title") === "Enable cartridge sound")
      await speaker.click()
    await page.waitForFunction(() => window.testTone?.ended)
    const duration = await page.evaluate(() => window.testTone.duration)
    expect(duration).toBeCloseTo(0.25, 2)
  })
}

test("initial inventory and commands added directly to a Commands table work", async ({ page }) => {
  const cartridge = source.replace('function cart:OnStart()', [
    'local tool = wig.ZItem(cart)',
    'tool.Name = "Test tool"',
    'tool.Visible = true',
    'tool:MoveTo(Player)',
    'local token = wig.ZItem(cart)',
    'token.Name = "Test token"',
    'token.Visible = true',
    'token:MoveTo(Player)',
    'tool.Commands.Use = wig.ZCommand{Text = "Use tool", CmdWith = true, Enabled = true, MakeReciprocal = true}',
    'tool.Commands.Use.WorksWithAll = false',
    'tool.Commands.Use.WorksWithList = {token}',
    'function tool:OnUse(target)',
    '  wig.MessageBox{Text = target == token and "Target received" or "Wrong target"}',
    'end',
    'function cart:OnStart()',
  ].join("\n"))
  await open(page, "initial-inventory.lua", cartridge)
  await play(page).click()
  await expect(popup(page)).toContainText("Cartridge started")
  await popup(page).getByRole("button").click()
  await page.locator("#id-mainscreen-items-3").click()
  await page.locator("#id-listscreen").getByRole("button", { name: "Test tool" }).click()
  await page.getByRole("button", { name: "Use tool" }).click()
  await page.locator("#id-detailscreen-items").getByRole("button", { name: "Test token" }).click()
  await expect(popup(page)).toContainText("Target received")
})

test("uses the map marker as a missing cartridge start location", async ({ page }) => {
  const cartridge = source
    .replace(/cart\.StartingLocation = wig\.ZonePoint\([\s\S]*?\)\n/, "")
    .replace('"Cartridge started"', 'cart.StartingLocation.latitude == 0.25 and "Map start used" or "Wrong start"')
  await open(page, "no-start.lua", cartridge)
  await page.evaluate(() => new Promise(resolve => {
    window.require(["lib/m_map"], map => {
      map.setPlayerLocation({ lat: 0.25, lng: 0.35 })
      resolve()
    })
  }))
  await play(page).click()
  await expect(popup(page)).toContainText("Map start used")
})

test("keeps consecutive messages, inputs, and their callbacks in order", async ({ page }) => {
  const actions = [
    'local input = wig.ZInput(cart)',
    'input.Text = "Enter a reply"',
    'input.InputType = "Text"',
    'function input:OnGetInput(value)',
    '  wig.MessageBox{Text = value == "Reply" and "Input callback ran" or "Wrong answer"}',
    'end',
    'wig.ShowStatusText("Synthetic status")',
    'wig.MessageBox{Text = "First message", Callback = function() cart.Name = "First callback ran" end}',
    'wig.GetInput(input)',
    'wig.MessageBox{Text = "Third message", Callback = function() wig.MessageBox{Text = cart.Name} end}',
  ]
  const cartridge = source.replace('wig.MessageBox{Text = "Cartridge started"}', actions.join("\n"))
  await open(page, "popups.lua", cartridge)
  await play(page).click()
  await expect(page.locator("#id-emul-status")).toHaveText("Synthetic status")
  await expect(popup(page)).toContainText("First message")
  await popup(page).getByRole("button").click()
  await expect(page.locator("#id-getinput")).toContainText("Enter a reply")
  await page.locator("#id-getinput-value").fill("Reply")
  await page.locator("#id-getinput-submit").click()
  for (const text of ["Third message", "Input callback ran", "First callback ran"]) {
    await expect(popup(page)).toContainText(text)
    const button = popup(page).getByRole("button")
    if (text === "Third message") {
      await button.evaluate(element => {
        element.click()
        element.click()
      })
    } else {
      await button.click()
    }
  }
  await page.getByRole("button", { name: "Stop cartridge" }).click()
  await expect(page.locator("#id-emul-status")).toBeHidden()
})

for (const [phase, failure] of [
  ["startup", 'error("Fixture failure")'],
  ["callback", 'wig.MessageBox{Text = "Ready", Callback = function() error("Fixture failure") end}'],
]) {
  test(phase + " errors return the toolbar to Play and allow retry", async ({ page }) => {
    const cartridge = source.replace('wig.MessageBox{Text = "Cartridge started"}', failure)
    await open(page, "failure.lua", cartridge)
    await play(page).click()
    if (phase === "callback")
      await popup(page).getByRole("button").click()
    await expect(page.locator("#id-emul")).toContainText("Fixture failure")
    await expect(page.getByRole("button", { name: "Play cartridge" })).toBeEnabled()
    await page.locator("#id-lua-notice-ok").click()
    await expect(play(page)).toBeVisible()
    await open(page, "valid.lua", source)
    await play(page).click()
    await expect(popup(page)).toContainText("Cartridge started")
  })
}
