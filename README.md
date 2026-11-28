# webwigo
webwigo - the online Wherigo (c) cartridge emulator

## Run locally

Clone the repository and start an HTTP server from the checkout:

```sh
git clone https://github.com/forest-ghost/webwigo.git
cd webwigo
python3 -m http.server 8000 --bind 127.0.0.1
```

On Windows, use `py -3` in place of `python3` if you use the Python launcher.
Open [http://127.0.0.1:8000/](http://127.0.0.1:8000/) in your browser.

Select **Load** to open a .gwc, .gwz, or .lua cartridge, then press **Play**.
The Lua engine downloads on first Play. **Simulated GPS** is on by default
and sends your position to the cartridge when you drag the green marker.
You can turn it off from the GPS readout.
Supported cartridge audio plays from the loaded file in your browser. Use the
speaker button in the toolbar to mute or unmute it. If the browser blocks
automatic playback, the same button starts the sound.
WebWigo also renders Garmin FDL tones locally.

GWZ archives can include Lua modules alongside the main cartridge. When
multiple Lua files are present, WebWigo prefers a root `cartridge.lua` or
`_cartridge.lua`. For a loose Lua source file that uses other Lua files, load
the complete GWZ archive.

The app runs in the browser without a build step. The page starts at
`index.html`. Browser code is in `js/`, bundled libraries are in `lib/`, and the
Wherigo runtime and its Lua bridge are in `lua/`. The UI uses Backbone, Leaflet 1.9.4, RequireJS 2.3.8, and JSZip 3.10.2. OpenStreetMap
tiles require internet access. Turn off **Basemap** in **Tools** before loading
a cartridge if you want to test with a blank map and no tile requests.

**Stop** resets the current run and keeps the cartridge loaded. **Reload file**
rereads the local cartridge. Refreshing the browser clears the play session.

## Deploy through GitHub

Vercel builds the static player from this repository. Push a feature branch
for a preview. Updates to the production branch deploy automatically. The
build publishes the player assets and licenses from the dist directory.

## Cloudflare preview

Run the package script from the checkout to prepare the static site in a
temporary directory. The script prints the path to pass to Cloudflare's cf CLI.

    node tools/package-site.cjs
    cf deploy <printed-directory> --dry-run

After signing in to the intended Cloudflare account, use the same deploy
command without the dry-run flag. The configuration names the Worker
webwigo-preview. The package contains the player files and licenses. Test
fixtures, local cartridges, draft documents, and environment files stay out
of the upload.

## Regression tests

Run these commands from the checkout with Node.js 20 or later, npm, and Python 3:

```sh
npm --prefix tests ci
npm --prefix tests run install-browsers
npm --prefix tests test
```

Playwright runs the checks in Chromium and Firefox against a local server.
The fixtures use fictional data. The tests generate the cartridge archives
and audio in memory and block external requests, including map tiles.
To rebuild the compiled fixtures, use both a 32-bit and a 64-bit Lua 5.1 compiler:

```sh
luac -s -o tests/fixtures/media.luac tests/fixtures/media.lua
luac64 -s -o tests/fixtures/media-64.luac tests/fixtures/media.lua
```
