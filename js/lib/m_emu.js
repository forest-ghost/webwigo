/*
    Copyright (C) 2019 Nicolas Bertin

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

//
// Emscripten configuration
//
var Module = {

  print: function(msg) {
    // global routine (see end of module definition)
    __mEMU_Print(msg)
  },

  preRun: function() {
    FS.init()
  }
}

define([
  "lib/m_rdr",
  "lib/m_lua",
  "lib/m_wig",
  "lib/m_gps",
  "lib/m_gui",
  "lib/m_map"
], function(mRDR, mLUA, mWIG, mGPS, mGUI, mMAP) {

  var _this = {}
  var runtimeReady
  var pendingPlay
  var moduleRoot = "/cartridge-modules"
  var moduleRootCreated = false
  var modulesMounted = false

  function clearCartridgeModules() {
    if (modulesMounted) {
      FS.unmount(moduleRoot)
      modulesMounted = false
    }
  }

  function mountCartridgeModules(reader) {
    if (!reader.getSourceModules)
      return
    var modules = reader.getSourceModules()
    if (!modules.length)
      return
    if (!moduleRootCreated) {
      FS.mkdir(moduleRoot)
      moduleRootCreated = true
    }
    FS.mount(MEMFS, {}, moduleRoot)
    modulesMounted = true
    var directories = new Set()
    modules.forEach(function(module) {
      var parts = module.path.split("/")
      var filename = parts.pop()
      var directory = moduleRoot
      parts.forEach(function(part) {
        directory += "/" + part
        if (!directories.has(directory)) {
          FS.mkdir(directory)
          directories.add(directory)
        }
      })
      FS.writeFile(directory + "/" + filename, module.bytes, { encoding: "binary" })
    })
  }

  function loadRuntime() {
    if (!runtimeReady) {
      var files = [
        ["Wherigo.Engine.luac", "Wherigo.lua"],
        ["WIGInternal.lua", "WIGInternal.lua"],
        ["dkjson-v2.5.lua", "dkjson.lua"],
        ["base64.lua", "base64.lua"],
        ["Loader.lua", null]
      ]
      runtimeReady = Promise.all(files.map(function(file) {
        return fetch("lua/" + file[0]).then(function(response) {
          if (!response.ok)
            throw new Error("Could not load " + file[0] + " (HTTP " + response.status + ").")
          return file[1] ? response.arrayBuffer() : response.text()
        })
      })).then(function(contents) {
        files.forEach(function(file, index) {
          if (file[1])
            FS.writeFile("/" + file[1], new Uint8Array(contents[index]), { encoding: "binary" })
        })
        return contents[contents.length - 1]
      }).catch(function(error) {
        runtimeReady = undefined
        throw error
      })
    }
    return runtimeReady
  }

  //
  // Prints a message on browser console and notify listeners. This method is
  // called from Emscripten.
  //
  _this.Print = function(msg) {
    console.log(msg)
    _this.trigger("evt-emu-println", msg)
  }

  _this.Start = function() {
    _this.Reset()
    // not locationless: player location = cartridge location
    var gwx = mRDR.getReader()
    var dat = gwx.getCartMetaData()
    if (!dat.locless && dat.location)
      mMAP.Start(dat.location)

    mGUI.ShowSplashScreen(gwx)

    _this.trigger("evt-emu-started")
  }

  _this.Stop = function() {
    _this.Reset()
    _this.trigger("evt-emu-stopped")
  }

  _this.Play = function() {
    var gwx = mRDR.getReader()
    if (!gwx || pendingPlay)
      return

    var request = {}
    pendingPlay = request
    mGUI.SetStarting(true)
    loadRuntime().then(function(loader) {
      if (pendingPlay !== request)
        return
      mLUA.Start()
      mountCartridgeModules(gwx)
      var encoding = gwx.getCartType() === gwx.TYPE_GWC ? "binary" : "utf8"
      FS.writeFile("/cartridge.lua", gwx.getCode(), { encoding: encoding }, "w+")
      if (mLUA.Exec(loader, true)) {
        mGUI.HideSplashScreen()
        _this.trigger("evt-emu-cartridge-playing")
      }
    }).catch(function(error) {
      if (pendingPlay !== request)
        return
      mLUA.Stop()
      clearCartridgeModules()
      mGUI.ShowStartupError(error.message)
    }).finally(function() {
      if (pendingPlay === request) {
        pendingPlay = undefined
        mGUI.SetStarting(false)
      }
    })
  }

  _this.Reset = function() {
    pendingPlay = undefined
    mLUA.Stop ()
    clearCartridgeModules()
    mWIG.Reset()
    mMAP.Reset()
    mGUI.Reset()

    // FIXME
    //if (mCFG.gpsAutomaticStart())
    //  mGPS.Stop ()
  }

  _this.Create = function(guidiv) {

    mWIG.Create()
    mGPS.Create()
    mMAP.Create()
    mGUI.Create(guidiv)
    _this.listenTo(mLUA, "evt-luavm-error", function(message) {
      var reader = mRDR.getReader()
      _this.Start()
      mGUI.ShowRuntimeNotice("error", message, reader.getCartType() === reader.TYPE_SRC)
    })
    _this.listenTo(mLUA, "evt-luavm-info", function(message) {
      _this.Start()
      mGUI.ShowRuntimeNotice("info", message)
    })

    //
    // evt-wig-cartridge-loaded
    //
    // This event is sent by the mWIG module when the cartridge has been
    // loaded (see lua/Loader.lua / mWIG)
    //
    _this.listenTo(mWIG, "evt-wig-cartridge-loaded", function(lat, lng) {
      var gwx = mRDR.getReader()
      var loc = mGPS.getPlayerLocation()

      if (gwx.getCartMetaData().locless || (lat === 360 && lng === 360) ||
          !Number.isFinite(lat) || !Number.isFinite(lng))
        mLUA.Call("JS2LUA_SetStartingLocation", loc.lat, loc.lng)
      else
        loc = { lat: lat, lng: lng }

      mMAP.Start(loc)
      // FIXME
      //if (mCFG.gpsAutomaticStart())
      //  mGPS.Start()

      if (gwx.getCartType() == gwx.TYPE_GWC)
        mLUA.Call("JS2LUA_SetPlayerName", gwx.getPlayerName())

      mLUA.Call("JS2LUA_StartCartridge")
    })

    //
    // evt-gui-play
    //
    // This event is sent by the mGUI module when the player clicks on the
    // "Play" button
    //
    _this.listenTo(mGUI, "evt-gui-play", function() {
      _this.Play()
    })
  }

  //
  // Adds the "Print" function to the global object so that it can be called
  // from Emscripten (see Emscripten configuration Module object)
  //
  window.__mEMU_Print = _this.Print

  // extends module with Backbone Events
  _.extend(_this, Backbone.Events)
  return _this
});
