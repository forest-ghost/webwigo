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

define([], function() {
  var runtime = {}
  var worker
  var running = false
  var sourceDownload
  var session = 0
  var nextRequest = 0
  var requests = new Map()
  var bridgeMethods = new Set([
    "CartridgeLoaded", "CartridgeEvent", "GetInput", "MessageBox", "PlayAudio",
    "RefreshMedia", "RefreshObjects", "RefreshZone", "ShowScreen",
    "StatusText", "StopAudio", "TimerStart", "TimerStop"
  ])

  function terminate() {
    if (worker)
      worker.terminate()
    worker = undefined
    running = false
    requests.forEach(function(request) {
      clearTimeout(request.timeout)
      request.resolve(false)
    })
    requests.clear()
  }

  function receive(event) {
    var message = event.data
    if (event.currentTarget !== worker || !message || message.session !== session)
      return
    if (message.type === "wig" && bridgeMethods.has(message.method)) {
      runtime.trigger("evt-lua-wig", message.method, message.args)
    } else if (message.type === "print") {
      runtime.trigger("evt-lua-print", message.text)
    } else if (message.type === "exit") {
      runtime.Stop()
      runtime.trigger("evt-luavm-info", "Cartridge stopped itself.")
    } else if (message.type === "result") {
      var request = requests.get(message.id)
      if (!request)
        return
      clearTimeout(request.timeout)
      requests.delete(message.id)
      if (message.error && request.fatal) {
        request.resolve(false)
        runtime.Stop()
        runtime.trigger("evt-luavm-error", message.error)
      } else if (message.error && message.initializing) {
        request.reject(new Error(message.error))
        terminate()
      } else {
        if (message.error)
          runtime.trigger("evt-lua-print", message.error)
        request.resolve(!message.error)
      }
    }
  }

  function send(type, data, fatal) {
    var id = ++nextRequest
    return new Promise(function(resolve, reject) {
      var timeout = setTimeout(function() {
        terminate()
        runtime.trigger("evt-luavm-error", "The cartridge did not respond and has been stopped.")
      }, 10000)
      requests.set(id, { resolve: resolve, reject: reject, timeout: timeout, fatal: fatal })
      worker.postMessage({ type: type, session: session, id: id, data: data })
    })
  }

  runtime.Load = function() {
    if (!sourceDownload) {
      sourceDownload = fetch(window.webwigoAsset("js/lib/lua.vm.js")).then(function(response) {
        if (!response.ok)
          throw new Error("Could not load lua.vm.js. Try Play again.")
        return response.text()
      }).catch(function(error) {
        sourceDownload = undefined
        throw error
      })
    }
    return sourceDownload
  }

  runtime.Start = function(data) {
    session++
    if (!worker) {
      worker = new Worker(window.webwigoAsset("js/lib/lua-worker.js"))
      worker.addEventListener("message", receive)
      worker.addEventListener("error", function(event) {
        if (event.currentTarget !== worker)
          return
        terminate()
        runtime.trigger("evt-luavm-error", "The Lua worker could not run the cartridge.")
      })
    }
    running = true
    return send("start", data, false)
  }

  runtime.Stop = function() {
    session++
    running = false
    if (requests.size)
      terminate()
    else if (worker)
      worker.postMessage({ type: "stop" })
  }

  runtime.Exec = function(source, fatal) {
    return running ? send("exec", source, fatal) : Promise.resolve(false)
  }

  runtime.Call = function(name) {
    if (!running)
      return Promise.resolve(false)
    var args = Array.prototype.slice.call(arguments, 1)
    for (var i = 0; i < args.length; i++) {
      if (typeof args[i] === "string") {
        args[i] = '"' + args[i].replace(/["\\\x00-\x1f\x7f]/g, function(character) {
          return "\\" + String(character.charCodeAt(0)).padStart(3, "0")
        }) + '"'
      } else if (args[i] === undefined || args[i] === null) {
        args[i] = "nil"
      }
    }
    return runtime.Exec(name + "(" + args.join(",") + ")", true)
  }

  return _.extend(runtime, Backbone.Events)
})
