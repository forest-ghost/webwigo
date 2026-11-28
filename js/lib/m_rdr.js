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
  "lib/m_gwz" ,
  "lib/m_gwc" ,
  "lib/m_src" ,
  "lib/m_url"
], function(mGWZ, mGWC, mSRC, mURL) {

  var _this = {}
  var _hdle = undefined
  var _vobj = undefined
  var _request = 0
  var pendingReader

  _this.read = function(hdle, cb_onProgress, cb_onStatus, cb_onError) {
    var file = undefined
    var type = undefined

    var request = ++_request
    if (pendingReader && pendingReader.cancelRead)
      pendingReader.cancelRead()
    pendingReader = undefined
    var reader

    // check if handle is an URI or not (= File object)
    if (typeof hdle == "string") {
      var uri = mURL.parse(hdle)
      if (! uri.error) {
        file = uri.cart_url
        type = uri.cart_type
      } else {
        cb_onError(uri.error)
        return
      }
    } else {
      function _type(filename) {
        if (filename.search(/\.gwz$/i) != -1)
          return "GWZ"
        if (filename.search(/\.gwc$/i) != -1)
          return "GWC"
        if (filename.search(/\.lua$/i) != -1)
          return "SRC"
        return null
      }
      file = hdle
      type = _type(file.name)
    }
    switch(type) {
      case "GWZ":
        reader = new mGWZ()
        break
      case "GWC":
        reader = new mGWC()
        break
      case "SRC":
        reader = new mSRC()
        break
      default:
        cb_onError("ERR_GWZ_OR_GWC_OR_LUA_FILE_EXPECTED")
        return
    }
    pendingReader = reader
    reader.read(file, function(gwx) {
      if (request !== _request) {
        gwx.dispose()
        return
      }
      pendingReader = undefined
      var previous = _vobj
      _hdle = hdle
      _vobj = gwx
      try {
        _this.trigger("evt-gwx-loaded", gwx)
      } finally {
        if (previous)
          previous.dispose()
      }
    }, function(received, total) {
      if (request === _request)
        cb_onProgress(received, total)
    }, function(status) {
      if (request === _request)
        cb_onStatus(status)
    }, function(error) {
      reader.dispose()
      if (request === _request) {
        pendingReader = undefined
        cb_onError(error)
      }
    })
  }

  _this.getReader = function() {
    return _vobj
  }

  _this.getHandle = function() {
    return _hdle
  }

  _this.isRemote = function() {
    if (_hdle == undefined)
      throw "routine must be called after cartridge loaded event"
    return (typeof _hdle == "string")
  }

  _this.isLocal = function() {
    if (_hdle == undefined)
      throw "routine must be called after cartridge loaded event"
    return (! _this.isRemote())
  }

  // extends module with Backbone Events
  _.extend(_this, Backbone.Events)
  return _this
});
