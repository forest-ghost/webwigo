const path = require("node:path")
const { defineConfig } = require("@playwright/test")

const url = "http://127.0.0.1:54790/"

module.exports = defineConfig({
  testDir: __dirname,
  timeout: 20000,
  workers: 1,
  use: {
    baseURL: url,
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
  ],
  webServer: {
    command: (process.platform === "win32" ? "py -3" : "python3") +
      " -m http.server 54790 --bind 127.0.0.1",
    cwd: path.join(__dirname, ".."),
    url,
    reuseExistingServer: false,
    stderr: "ignore",
  },
})
