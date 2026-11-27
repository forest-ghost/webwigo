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
  "lib/m_gwx",
  "lib/m_text"
], function(mGWX, decodeByteString) {

  // Read literal metadata without executing the cartridge. Keeping strings and
  // comments as tokens prevents examples in them from looking like code.
  var luaTokens = /--\[(=*)\[[\s\S]*?\]\1\]|--[^\r\n]*|\[(=*)\[[\s\S]*?\]\2\]|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|[A-Za-z_]\w*|0[xX][\da-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|\.\.|\S/g
  var metadataFields = {
    Name: "name", Activity: "activity", Version: "version", Author: "author",
    Company: "company", Description: "desc", StartingLocationDescription: "locdesc"
  }

  function stringValue(token) {
    var long = token && /^\[(=*)\[/.exec(token)
    if (long)
      return token.slice(long[0].length, -long[0].length).replace(/^(?:\r\n|\n\r|\r|\n)/, "")
    if (!token || !/^["']/.test(token) || token.length < 2)
      return undefined
    var escapes = { a: "\x07", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v" }
    return token.slice(1, -1).replace(/(?:\\\d{1,3})+|\\(\r\n|[\s\S])/g, function(sequence, char) {
      if (char !== undefined)
        return char === "\r\n" || char === "\r" ? "\n" : escapes[char] || char
      return decodeByteString(sequence.replace(/\\(\d{1,3})/g, function(_, value) {
        return String.fromCharCode(Number(value))
      }))
    })
  }

  function member(tokens, index) {
    if (tokens[index] === ".")
      return { name: tokens[index+1], end: index+2 }
    if (tokens[index] === "[" && tokens[index+2] === "]")
      return { name: stringValue(tokens[index+1]), end: index+3 }
    return { name: undefined, end: index }
  }

  function coordinate(tokens, index) {
    var negative = tokens[index] === "-"
    if (negative)
      index++
    var token = tokens[index]
    var value = token && /^\.?\d/.test(token) ? Number(token) : NaN
    return { value: negative ? -value : value, end: index+1 }
  }

  function sourceMetadata(code, filename) {
    var tokens = (code.match(luaTokens) || []).filter(function(token) { return !token.startsWith("--") })
    var metadata = { name: filename, locless: false }
    var cart
    for (var i = 1; i < tokens.length; i++) {
      var constructor = member(tokens, i)
      if (constructor.name === "ZCartridge" && /^[A-Za-z_]\w*$/.test(tokens[i-1]) &&
          (tokens[constructor.end] === "(" || tokens[constructor.end] === "{")) {
        if (tokens[i-2] === "=" && /^[A-Za-z_]\w*$/.test(tokens[i-3])) {
          cart = tokens[i-3]
          break
        }
        if (tokens[i-2] === "return")
          return metadata
      }
    }
    if (!cart)
      return undefined

    for (var index = i+1; index < tokens.length; index++) {
      if (tokens[index] !== cart)
        continue
      var property = member(tokens, index+1)
      if (tokens[property.end] !== "=")
        continue
      var valueIndex = property.end+1
      if (Object.prototype.hasOwnProperty.call(metadataFields, property.name)) {
        var value = stringValue(tokens[valueIndex])
        if (value !== undefined && tokens[valueIndex+1] !== ".." &&
            (metadata[metadataFields[property.name]] === undefined ||
             (property.name === "Name" && metadata.name === filename)))
          metadata[metadataFields[property.name]] = value
      } else if (property.name === "StartingLocation" && !metadata.location && !metadata.locless) {
        var qualified = member(tokens, valueIndex+1)
        var type = qualified.name || tokens[valueIndex]
        var args = qualified.name ? qualified.end : valueIndex+1
        if (type === "INVALID_ZONEPOINT")
          metadata.locless = true
        if (type === "ZonePoint" && tokens[args] === "(") {
          var lat = coordinate(tokens, args+1)
          var lng = coordinate(tokens, lat.end+1)
          if (tokens[lat.end] === "," && (tokens[lng.end] === "," || tokens[lng.end] === ")") &&
              Number.isFinite(lat.value) && Number.isFinite(lng.value)) {
            metadata.locless = lat.value === 360 && lng.value === 360
            if (!metadata.locless && Math.abs(lat.value) <= 90 && Math.abs(lng.value) <= 180)
              metadata.location = { lat: lat.value, lng: lng.value }
          }
        }
      }
    }
    return metadata
  }

  var mSRC = mGWX.extend({

    init: function() {
    },

    _source: function(bytes, name) {
      var code = decodeByteString(bytes)
      var metadata = sourceMetadata(code, name)
      if (metadata)
        return { code: code, metadata: metadata }
      return undefined
    },

    _setSource: function(source, name) {
      this._code = source.code
      this._metadata = source.metadata
      this._name = name
    },

    _read: function(blob, name, cb_onSuccess, cb_onError) {
      var that = this
      var reader = new FileReader()

      reader.onload = function(evt) {
        var source = that._source(evt.target.result, name)
        if (!source) {
          cb_onError("ERR_CARTRIDGE_NAME_NOT_FOUND")
          return
        }
        that._setSource(source, name)
        cb_onSuccess(that)
      }
      reader.onerror = function(evt) {
        cb_onError("ERR_UNKNOWN_ERROR("+evt.target.error.code+")")
      }
      reader.readAsBinaryString(blob)
    },

    canSeeCode: function() {
      return true
    },

    getMediaData: function(filename, cb_onSuccess) {
      cb_onSuccess("")
    },

    getMediasList: function() {
      return [this._name]
    },

    canSeeMedias: function() {
      return false
    },

    canSeeHiddenZones: function() {
      return true
    },

    getCartMetaData: function() {
      return this._metadata
    },

    getCartType: function() {
      return this.TYPE_SRC
    }
  })

  return mSRC
});
