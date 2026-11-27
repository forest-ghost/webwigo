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

Use the folder icon to load a `.gwc`, `.gwz`, or `.lua` cartridge, then press
**Play**. Turn on **GPSr** to send player-marker movements to the cartridge.
Supported cartridge audio plays from the loaded file in your browser. If the
browser blocks automatic playback, use the speaker button in the toolbar.

The app runs in the browser without a build step. The page starts at
`index.html`. Browser code is in `js/`, bundled libraries are in `lib/`, and the
Wherigo runtime and its Lua bridge are in `lua/`. The UI uses RequireJS,
Backbone, and Leaflet. The map needs internet access to load OpenStreetMap tiles.
