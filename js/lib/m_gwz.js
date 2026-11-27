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
  "lib/m_src",
  "lib/m_fdl"
], function(JSZip, mSRC, fdlToWav) {

  var _wURL = window.webkitURL || window.mozURL || window.URL
  var mimeTypes = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    gif: "image/gif", bmp: "image/bmp",
    wav: "audio/wav", mp3: "audio/mpeg", ogg: "audio/ogg"
  }

  function entryPriority(entry) {
    if (/^_?cartridge\.lua$/i.test(entry.name))
      return 0
    if (/(^|\/)_?cartridge\.lua$/i.test(entry.name))
      return 1
    return 2
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
        try {
          that._zip = new JSZip(new Uint8Array(evt.target.result))
          var entries = that._zip.file(/\.lua$/i).filter(function(entry) {
            return !/^__MACOSX\//.test(entry.name) && !/(^|\/)\._/.test(entry.name)
          })
          if (!entries.length) {
            cb_onError("ERR_LUA_SOURCE_NOT_FOUND")
            return
          }

          var priority = Infinity
          var candidates = []
          entries.forEach(function(entry) {
            var rank = entryPriority(entry)
            if (rank > priority)
              return
            var source = that._source(entry.asBinary(), name)
            if (!source)
              return
            if (rank < priority) {
              candidates = []
              priority = rank
            }
            candidates.push({ entry: entry, source: source })
          })
          if (candidates.length !== 1) {
            cb_onError(candidates.length ? "ERR_MULTIPLE_CARTRIDGES" : "ERR_CARTRIDGE_NAME_NOT_FOUND")
            return
          }
          var candidate = candidates[0]
          that._modules = entries.filter(function(entry) { return entry.name !== candidate.entry.name })
          that._directory = candidate.entry.name.slice(0, candidate.entry.name.lastIndexOf("/")+1)
          that._setSource(candidate.source, name)
        } catch(e) {
          cb_onError("ERR_CARTRIDGE_UNZIP")
          return
        }
        cb_onSuccess(that)
      }
      reader.onerror = function(evt) {
        cb_onError("ERR_UNKNOWN_ERROR("+evt.target.error.code+")")
      }
      reader.readAsArrayBuffer(blob)
    },

    canSeeCode: function() {
      return true
    },

    getSourceModules: function() {
      var directory = this._directory
      var modules = new Map()
      this._modules.forEach(function(entry) {
        if (!entry.name.split("/").every(function(part) {
          return part && part !== "." && part !== ".." && !/[\\\x00]/.test(part)
        }))
          return
        modules.set(entry.name, entry)
      })
      if (directory) {
        this._modules.forEach(function(entry) {
          if (modules.has(entry.name) && entry.name.startsWith(directory))
            modules.set(entry.name.slice(directory.length), entry)
        })
      }
      return Array.from(modules, function(pair) {
        return { path: pair[0], bytes: new Uint8Array(pair[1].asArrayBuffer()) }
      })
    },

    getMediaData: function(filename, cb_onSuccess) {
      var entry = this._zip.file(this._directory + filename) || this._zip.file(filename)
      if (!entry) {
        cb_onSuccess("")
        return
      }
      if (!this._mediaURLs[filename]) {
        var extension = filename.split(".").pop().toLowerCase()
        var data = entry.asArrayBuffer()
        var blob = extension === "fdl" ? fdlToWav(new Uint8Array(data)) :
          new Blob([data], { type: mimeTypes[extension] || "application/octet-stream" })
        if (!blob) {
          cb_onSuccess("")
          return
        }
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
