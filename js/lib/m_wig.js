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
  "lib/m_gps",
  "lib/m_map",
  "lib/m_lua",
  "lib/m_text"
], function(mRDR, mGPS, mMAP, mLUA, decodeByteString) {

  var _this   = {}
  var _medias = []
  var _timers = new Map()
  var _audio = new Audio()
  var _audioRequest

  /*
  function b64enc(str) {
    if (str)
      return window.btoa(unescape(encodeURIComponent(str)))
    return str
  }
  */

  function b64dec(str) {
    return decodeByteString(window.atob(str))
  }

  function parseJSON(str) {
    if (str)
      return $.parseJSON(b64dec(str))
    return str
  }

  /**
    * Creates the WIG interface.
    *
    * @public
    * @memberof module:mWIG#
    * @method   Create
    */
  _this.Create = function() {
    $("#id-webwigo-play-audio").off("click.webwigoAudio").on("click.webwigoAudio", function() {
      if (_audioRequest)
        playAudio(_audioRequest)
    })
    _this.listenTo(mLUA, "evt-luavm-error evt-luavm-info", function() {
      _this.Reset()
    })
    _this.listenTo(mGPS, "evt-gps-set-player-location", function(loc, accuracy) {
      mLUA.Call("JS2LUA_SetPlayerLocation", loc.lat , loc.lng, accuracy)
    })

    _this.listenTo(mGPS, "evt-gps-accuracy-change", function(accuracy) {
      mLUA.Call("JS2LUA_RefreshLocation", accuracy)
    })
  }

  /**
    * Resets the WIG interface.
    *
    * @public
    * @memberof module:mWIG#
    * @method   Reset
    */
  _this.Reset = function() {
    _timers.forEach(function(timeout) {
      clearTimeout(timeout)
    })
    _timers.clear()
    _this.StopAudio()
    _medias = []
  }

  /**
    * Starts a JS timer for WIG engine.
    *
    * @public
    * @memberof module:mWIG#
    * @method   TimerStart
    * @param    {number} timerid  - timer identifier (from WIGInternal.lua)
    * @param    {object} duration - in milliseconds
    */
  _this.TimerStart = function(timerid, duration) {
    _this.TimerStop(timerid)
    _timers.set(timerid, setTimeout(function() {
      _timers.delete(timerid)
      mLUA.Call("JS2LUA_TimerTick", timerid)
    }, duration))
  }

  _this.TimerStop = function(timerid) {
    clearTimeout(_timers.get(timerid))
    _timers.delete(timerid)
  }

  function playAudio(request) {
    _audio.play().then(function() {
      if (_audioRequest === request)
        $("#id-webwigo-audio-retry").prop("hidden", true)
    }).catch(function(error) {
      if (_audioRequest !== request)
        return
      if (error.name === "NotAllowedError")
        $("#id-webwigo-audio-retry").prop("hidden", false)
      else
        console.warn("Cartridge audio could not play:", error.message)
    })
  }

  _this.StopAudio = function() {
    _audioRequest = undefined
    $("#id-webwigo-audio-retry").prop("hidden", true)
    if (_audio.hasAttribute("src")) {
      _audio.pause()
      _audio.removeAttribute("src")
      _audio.load()
    }
  }

  _this.PlayAudio = function(id) {
    _this.StopAudio()
    var reader = mRDR.getReader()
    var request = {}
    _audioRequest = request
    var media = _medias[id]
    var resource = media && media.resources.find(function(file) {
      return reader.isSound(file.Filename)
    })
    var filename = reader.getCartType() === reader.TYPE_GWC ? id : resource && resource.Filename

    if (filename != null) {
      reader.getMediaData(filename, function(url) {
        if (url && _audioRequest === request) {
          _audio.src = url
          playAudio(request)
        }
      })
    }
  }

  /**
    * @public
    * @memberof module:mWIG#
    * @method   RefreshZone
    * @param    {number} id - zone identifier (from WIGInternal.lua)
    * @param    {object} obj - zone definition
    */
  _this.RefreshZone = function(obj) {
    mMAP.RefreshZone(parseJSON(obj))
  }

  /**
    * @public
    * @memberof module:mWIG#
    * @method   RefreshMedia
    * @param    {number} id - media identifier (from WIGInternal.lua)
    * @param    {object} obj - media definition
    */
  _this.RefreshMedia = function(obj) {
    var m = parseJSON(obj)
    _medias[m.idx] = m
  }

  /**
    * Retrieves an image URL given its id, as found in WIGInternal.lua
    *
    * @public
    * @memberof module:mWIG#
    * @method   getImage
    * @param    {number} id - image identifier (from WIGInternal.lua)
    * @param    {function} onSuccess - callback
    */
  _this.getImage = function(id, cb_onSuccess) {
    var gwx = mRDR.getReader()
    switch(gwx.getCartType()) {
      case gwx.TYPE_GWZ:
        var item = _medias[id]
        if (item != null) {
          var files = item.resources
          for(var i = 0 ; i < files.length ; i++) {
            gwx.getMediaData(files[i].Filename, cb_onSuccess)
            return
          }
        }
        break
      case gwx.TYPE_GWC:
        gwx.getMediaData(id, cb_onSuccess)
        return
    }
    cb_onSuccess("")
  }

  _this.getMediaName = function(id) {
    if (_medias[id])
      return _medias[id].name
    return ""
  }

  /**
    * PlayerRefreshObjects event (fired by WIGInternal.lua)
    *
    * @public
    * @memberof module:mWIG#
    * @method   PlayerRefreshObjects
    * @param    {object} objects
    */
  _this.RefreshObjects = function(obj) {
    _this.trigger("evt-wig-refresh-objects", parseJSON(obj))
  }

  _this.CartridgeLoaded = function(lat, lng) {
    _this.trigger("evt-wig-cartridge-loaded", lat, lng)
  }

  _this.CartridgeEvent = function(evt) {
    console.log("CartridgeEvent = ", evt)
    _this.trigger("evt-wig-cartridge-"+evt)
  }

  _this.GetInput = function(obj) {
    var m = parseJSON(obj)
    _this.trigger("evt-wig-getinput", m.txt, m.media, m.type, m.choices)
  }

  _this.MessageBox = function(obj) {
    var m = parseJSON(obj)
    _this.trigger("evt-wig-messagebox", m.txt, m.media, m.btn1, m.btn2)
  }

  _this.ShowScreen = function(idxScreen, idxObject) {
    _this.trigger("evt-wig-showscreen", idxScreen, idxObject)
  }

  //
  // Adds the mWIG instance to the global object so that it can be called
  // from Lua
  //
  window.mWIG = _this

  // extends module with Backbone Events
  _.extend(_this, Backbone.Events)
  return _this
});
