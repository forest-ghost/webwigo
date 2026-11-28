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
  var playing = false

  _this.isPlaying = function() {
    return playing
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
      var sourceDownloads = files.map(function(file) {
        return fetch(window.webwigoAsset("lua/" + file[0])).then(function(response) {
          if (!response.ok)
            throw new Error("Could not load " + file[0] + " (HTTP " + response.status + ").")
          return file[1] ? response.arrayBuffer() : response.text()
        })
      })
      runtimeReady = Promise.all([mLUA.Load(), Promise.all(sourceDownloads)]).then(function(runtime) {
        var contents = runtime[1]
        return {
          vm: runtime[0],
          loader: contents[contents.length - 1],
          files: files.slice(0, -1).map(function(file, index) {
            return { name: file[1], bytes: new Uint8Array(contents[index]) }
          })
        }
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
    _this.trigger("evt-emu-starting")
    Promise.all([loadRuntime(), gwx.getSourceModules ? gwx.getSourceModules() : []]).then(function(results) {
      if (pendingPlay !== request)
        return
      var runtime = results[0]
      return mLUA.Start({
        vm: runtime.vm,
        files: runtime.files,
        modules: results[1],
        encoding: gwx.getCartType() === gwx.TYPE_GWC ? "binary" : "utf8",
        code: gwx.getCode()
      }).then(function(started) {
        if (started && pendingPlay === request)
          return mLUA.Exec(runtime.loader, true)
      }).then(function(loaded) {
        if (loaded && pendingPlay === request) {
          playing = true
          mGPS.SetPlaying(true)
          mGUI.HideSplashScreen()
          _this.trigger("evt-emu-cartridge-playing")
        }
      })
    }).catch(function(error) {
      if (pendingPlay !== request)
        return
      mLUA.Stop()
      mGUI.ShowStartupError(error.message)
      _this.trigger("evt-emu-started")
    }).finally(function() {
      if (pendingPlay === request) {
        pendingPlay = undefined
        mGUI.SetStarting(false)
      }
    })
  }

  _this.Reset = function() {
    pendingPlay = undefined
    playing = false
    mGPS.SetPlaying(false)
    mLUA.Stop ()
    mWIG.Reset()
    mMAP.Reset()
    mGUI.Reset()

  }

  _this.Create = function(guidiv) {

    mWIG.Create()
    mMAP.Create()
    mGUI.Create(guidiv)
    _this.listenTo(mLUA, "evt-lua-print", _this.Print)
    _this.listenTo(mLUA, "evt-lua-wig", function(method, args) {
      mWIG[method].apply(mWIG, args)
    })
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
    _this.listenTo(mWIG, "evt-wig-cartridge-complete", function() {
      mGUI.ShowCompletion()
    })
    _this.listenTo(mWIG, "evt-wig-cartridge-loaded", function(lat, lng) {
      var gwx = mRDR.getReader()
      var loc = mGPS.getPlayerLocation()

      if (gwx.getCartMetaData().locless || (lat === 360 && lng === 360) ||
          !Number.isFinite(lat) || !Number.isFinite(lng))
        mLUA.Call("JS2LUA_SetStartingLocation", loc.lat, loc.lng)
      else
        loc = { lat: lat, lng: lng }

      mMAP.Start(loc)

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

  // extends module with Backbone Events
  _.extend(_this, Backbone.Events)
  return _this
});
