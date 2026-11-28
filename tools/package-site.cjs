const fs = require("node:fs")
const { createHash } = require("node:crypto")
const os = require("node:os")
const path = require("node:path")

const root = path.resolve(__dirname, "..")
const vercel = process.argv.includes("--vercel")
const output = vercel ? path.join(root, "dist") : fs.mkdtempSync(path.join(os.tmpdir(), "webwigo-site-"))
const publicFiles = new Set([
  "index.html", "LICENSE", "js/startup.js", "js/lib/lua-worker.js", "lib/leaflet.LICENSE", "lib/jszip.LICENSE",
  "lua/Wherigo.Engine.luac", "lua/WIGInternal.lua", "lua/dkjson-v2.5.lua",
  "lua/base64.lua", "lua/Loader.lua",
])
const retiredLibraries = new Set([
  "lib/Bing.js", "lib/jquery-1.11.2.min.js", "lib/jquery-ui.min.js",
  "lib/js/bootstrap.js", "lib/js/bootstrap.min.js", "lib/js/npm.js",
])
function addAssets(relativeDirectory) {
  const directory = path.join(root, relativeDirectory)
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith("."))
      continue
    const file = relativeDirectory + "/" + entry.name
    if (entry.isDirectory())
      addAssets(file)
    else if (entry.isFile() && /\.(?:css|js|html|png|gif|svg|woff2?|ttf|otf|eot|LICENSE)$/i.test(file)
             && !retiredLibraries.has(file))
      publicFiles.add(file)
  }
}

for (const directory of ["css", "img", "js", "lib"])
  addAssets(directory)

if (vercel && fs.existsSync(output)) {
  const resolvedRoot = fs.realpathSync(root)
  const resolvedOutput = fs.realpathSync(output)
  if (path.relative(resolvedRoot, resolvedOutput) !== "dist" || fs.lstatSync(output).isSymbolicLink())
    throw new Error("Expected the build output directory inside the project")
  fs.rmSync(output, { recursive: true })
}
const hash = createHash("sha256")
for (const file of [...publicFiles].sort()) {
  const source = path.join(root, file)
  if (!fs.lstatSync(source).isFile())
    throw new Error("Expected a regular file: " + file)
  const target = path.join(output, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const bytes = fs.readFileSync(source)
  hash.update(file).update("\0").update(bytes).update("\0")
  fs.writeFileSync(target, bytes)
}

const version = hash.digest("hex").slice(0, 16)
const player = path.join(output, "index.html")
const html = fs.readFileSync(player, "utf8")
fs.writeFileSync(player, html
  .replace('name="webwigo-assets" content=""', 'name="webwigo-assets" content="' + version + '"')
  .replace(/((?:src|href)=")((?:js|lib|css)\/[^"]+)"/g, "$1$2?v=" + version + '"'))

if (!vercel)
  fs.writeFileSync(path.join(output, "_headers"), [
    "/*",
    "  X-Content-Type-Options: nosniff",
    "  Referrer-Policy: strict-origin-when-cross-origin",
    "  Content-Security-Policy: base-uri 'self'; object-src 'none'; frame-ancestors 'self'",
    "/js/lib/lua-worker.js",
    "  Content-Security-Policy: default-src 'none'; script-src 'unsafe-eval'",
    "/js/*",
    "  Cache-Control: public, max-age=3600",
    "/lib/*",
    "  Cache-Control: public, max-age=3600",
    "/lua/*",
    "  Cache-Control: public, max-age=3600",
    "/css/*",
    "  Cache-Control: public, max-age=3600",
    "/img/*",
    "  Cache-Control: public, max-age=3600",
    "/",
    "  Cache-Control: no-cache",
    "",
  ].join("\n"))
console.log(output)
