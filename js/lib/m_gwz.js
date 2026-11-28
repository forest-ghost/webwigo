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
  "require",
  "lib/m_src",
  "lib/m_fdl"
], function(require, mSRC, fdlToWav) {

  var _wURL = window.webkitURL || window.mozURL || window.URL
  var mimeTypes = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    gif: "image/gif", bmp: "image/bmp",
    wav: "audio/wav", mp3: "audio/mpeg", ogg: "audio/ogg"
  }

  var maxEntries = 5000
  var maxExpandedBytes = 128 * 1024 * 1024
  var maxEntryBytes = 32 * 1024 * 1024

  function readEntry(entry) {
    // JSZip enforces the declared length at the end of decompression. The
    // streaming count also bounds output if that declaration is incorrect.
    return new Promise(function(resolve, reject) {
      var chunks = []
      var total = 0
      var stream = entry.internalStream("uint8array")
      stream.on("data", function(chunk) {
        total += chunk.length
        if (total > maxEntryBytes) {
          stream.pause()
          reject(new Error("ERR_CARTRIDGE_TOO_LARGE"))
        } else {
          chunks.push(chunk)
        }
      }).on("error", reject).on("end", function() {
        var bytes = new Uint8Array(total)
        var offset = 0
        chunks.forEach(function(chunk) {
          bytes.set(chunk, offset)
          offset += chunk.length
        })
        resolve(bytes)
      }).resume()
    })
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
      var that = this
      var cancelled = false
      this.cancelRead = function() { cancelled = true }

      require(["JSZip"], function(JSZip) {
        blob.arrayBuffer().then(function(bytes) {
          return JSZip.loadAsync(bytes)
        }).then(async function(zip) {
          that._zip = zip
          var files = Object.values(zip.files)
          var expanded = 0
          if (files.length > maxEntries)
            throw new Error("ERR_CARTRIDGE_TOO_LARGE")
          files.forEach(function(entry) {
            if (entry.dir)
              return
            // This size field is provided by the pinned JSZip release.
            var size = entry._data.uncompressedSize
            if (!Number.isSafeInteger(size) || size < 0 || size > maxEntryBytes)
              throw new Error("ERR_CARTRIDGE_TOO_LARGE")
            expanded += size
          })
          if (expanded > maxExpandedBytes)
            throw new Error("ERR_CARTRIDGE_TOO_LARGE")

          var entries = zip.file(/\.lua$/i).filter(function(entry) {
            return !/^__MACOSX\//.test(entry.name) && !/(^|\/)\._/.test(entry.name)
          }).sort(function(a, b) { return entryPriority(a) - entryPriority(b) })
          if (!entries.length)
            throw new Error("ERR_LUA_SOURCE_NOT_FOUND")

          var candidates = []
          for (var index = 0; index < entries.length; index++) {
            if (cancelled)
              return
            var entry = entries[index]
            if (candidates.length && entryPriority(entry) > entryPriority(candidates[0].entry))
              break
            var source = that._source(await readEntry(entry), name)
            if (source)
              candidates.push({ entry: entry, source: source })
          }
          if (candidates.length !== 1)
            throw new Error(candidates.length ? "ERR_MULTIPLE_CARTRIDGES" : "ERR_CARTRIDGE_NAME_NOT_FOUND")
          if (cancelled)
            return
          var candidate = candidates[0]
          that._modules = entries.filter(function(entry) { return entry.name !== candidate.entry.name })
          that._directory = candidate.entry.name.slice(0, candidate.entry.name.lastIndexOf("/")+1)
          that._setSource(candidate.source, name)
          cb_onSuccess(that)
        }).catch(function(error) {
          if (!cancelled)
            cb_onError(/^ERR_/.test(error.message) ? error.message : "ERR_CARTRIDGE_UNZIP")
        })
      }, function() {
        if (!cancelled)
          cb_onError("ERR_CARTRIDGE_UNZIP")
      })
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
      var inflated = new Map()
      return Promise.all(Array.from(modules, function(pair) {
        if (!inflated.has(pair[1]))
          inflated.set(pair[1], readEntry(pair[1]))
        return inflated.get(pair[1]).then(function(bytes) {
          return { path: pair[0], bytes: bytes }
        })
      }))
    },

    getMediaData: function(filename, cb_onSuccess) {
      var entry = this._zip.file(this._directory + filename) || this._zip.file(filename)
      if (!entry) {
        cb_onSuccess("")
        return
      }
      if (!this._mediaURLs[filename]) {
        var extension = filename.split(".").pop().toLowerCase()
        var that = this
        this._mediaURLs[filename] = readEntry(entry).then(function(bytes) {
          var blob = extension === "fdl" ? fdlToWav(bytes) :
            new Blob([bytes], { type: mimeTypes[extension] || "application/octet-stream" })
          return !that._disposed && blob ? _wURL.createObjectURL(blob) : ""
        }).catch(function() { return "" })
      }
      this._mediaURLs[filename].then(function(url) {
        cb_onSuccess(this._disposed ? "" : url)
      }.bind(this))
    },

    dispose: function() {
      this._disposed = true
      var urls = this._mediaURLs
      Object.keys(urls).forEach(function(filename) {
        urls[filename].then(function(url) {
          if (url)
            _wURL.revokeObjectURL(url)
        })
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
