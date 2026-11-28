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

/* global Lua, FS, MEMFS, Pointer_stringify */
var currentSession
var initialized = false
var mounted = false
var madeModuleDirectory = false
var vmLoaded = false
var moduleRoot = "/cartridge-modules"
var Module = {
  print: function(text) { report("print", { text: text }) },
  preRun: function() { FS.init() },
  noImageDecoding: true,
  noAudioDecoding: true,
}

function report(type, details) {
  self.postMessage(Object.assign({ type: type, session: currentSession }, details))
}

var mWIG = {}
;[
  "CartridgeLoaded", "CartridgeEvent", "GetInput", "MessageBox", "PlayAudio",
  "RefreshMedia", "RefreshObjects", "RefreshZone", "ShowScreen",
  "StatusText", "StopAudio", "TimerStart", "TimerStop"
].forEach(function(method) {
  mWIG[method] = function() {
    report("wig", { method: method, args: Array.from(arguments) })
  }
})
var mLUA = {
  Exit: function() { report("exit") }
}

function reset() {
  if (initialized) {
    Lua.stop()
    initialized = false
  }
  if (mounted) {
    FS.unmount(moduleRoot)
    mounted = false
  }
}

function start(data) {
  reset()
  if (!vmLoaded) {
    // This source is the same-origin lua.vm.js shipped as part of WebWigo.
    // A global evaluation preserves the Emscripten build's globals in the worker.
    ;(0, eval)(data.vm)
    vmLoaded = true
  }
  data.files.forEach(function(file) {
    FS.writeFile("/" + file.name, file.bytes, { encoding: "binary" })
  })
  if (data.modules.length) {
    if (!madeModuleDirectory) {
      FS.mkdir(moduleRoot)
      madeModuleDirectory = true
    }
    FS.mount(MEMFS, {}, moduleRoot)
    mounted = true
    var directories = new Set()
    data.modules.forEach(function(module) {
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
  FS.writeFile("/cartridge.lua", data.code, { encoding: data.encoding })
  Lua.init()
  initialized = true
}

self.onmessage = function(event) {
  var message = event.data
  if (message.type === "stop") {
    reset()
    return
  }
  currentSession = message.session
  var error
  try {
    if (message.type === "start") {
      start(message.data)
    } else if (message.type === "exec" && initialized) {
      error = Pointer_stringify(Lua.exec(message.data)) || undefined
    }
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause)
  }
  report("result", { id: message.id, error: error, initializing: message.type === "start" })
}
