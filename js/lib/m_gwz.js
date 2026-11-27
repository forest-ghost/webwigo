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
  "JSZip",
  "lib/m_src"
], function(JSZip, mSRC) {

  var _wURL = window.webkitURL || window.mozURL || window.URL
  var mimeTypes = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    gif: "image/gif", bmp: "image/bmp",
    wav: "audio/wav", mp3: "audio/mpeg", ogg: "audio/ogg"
  }

  var mGWZ = mSRC.extend({

    _zip : null,

    init: function() {
      this._mediaURLs = Object.create(null)
    },

    _read: function(blob, name, cb_onSuccess, cb_onError) {
      var that   = this
      var reader = new FileReader()

      reader.onload = function(evt) {
        var code = null
        try {
          that._zip = new JSZip(new Uint8Array(evt.target.result))
        } catch(e) {
          cb_onError("ERR_CARTRIDGE_UNZIP")
          return
        }
        $.each(that._zip.files, function(index, entry) {
          if (that.isCode(entry.name))
            code = entry.asBinary()
        })
        if (code != null) {
          var cart = that._codeCartVariableName(code)
          if (cart != null) {
            that._code = that._codeCleanup(code)
            that._name = name
            cb_onSuccess(that)
          } else {
            cb_onError("ERR_CARTRIDGE_NAME_NOT_FOUND")
          }
        } else {
          cb_onError("ERR_LUA_SOURCE_NOT_FOUND")
        }
      }
      reader.onerror = function(evt) {
        cb_onError("ERR_UNKNOWN_ERROR("+evt.target.error.code+")")
      }
      reader.readAsArrayBuffer(blob)
    },

    canSeeCode: function() {
      return true
    },

    getMediaData: function(filename, cb_onSuccess) {
      var entry = this._zip.file(filename)
      if (!entry) {
        cb_onSuccess("")
        return
      }
      if (!this._mediaURLs[filename]) {
        var extension = filename.split(".").pop().toLowerCase()
        var blob = new Blob([entry.asArrayBuffer()], {
          type: mimeTypes[extension] || "application/octet-stream"
        })
        this._mediaURLs[filename] = _wURL.createObjectURL(blob)
      }
      cb_onSuccess(this._mediaURLs[filename])
    },

    dispose: function() {
      var urls = this._mediaURLs
      Object.keys(urls).forEach(function(filename) {
        _wURL.revokeObjectURL(urls[filename])
        delete urls[filename]
      })
    },

    getMediasList: function() {
      var that = this
      var list = []
      $.each(that._zip.files, function(index, entry) {
        if (that.isCode(entry.name) || that.isImage(entry.name) || that.isSound(entry.name))
          list.push(entry.name)
      })
      return list
    },

    canSeeMedias: function() {
      return true
    },

    canSeeHiddenZones: function() {
      return true
    },

    getCartType: function() {
      return this.TYPE_GWZ
    }
  })

  return mGWZ
});
