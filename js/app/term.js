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
  "lib/m_rdr",
  "lib/m_emu",
  "lib/m_lua",
  "app/app0"
], function(require, mRDR, mEMU, mLUA, App) {
  var terminal
  var TinyTerm
  var running = false
  var logs = []
  var consolePanel = $("#id-term")

  function log(message) {
    var time = new Date().toISOString().slice(11, 19)
    var line = time + " " + message
    logs.push(line)
    if (logs.length > 200)
      logs.shift()
    if (terminal)
      terminal.print(line)
  }

  function renderConsole() {
    consolePanel.empty()
    terminal = new TinyTerm(consolePanel[0])
    terminal.autocomplete = function() {}
    terminal.process = function(command) {
      if (!command)
        return
      if (running)
        mLUA.Exec(command, false)
      else
        log("Play the cartridge before running Lua commands.")
    }
    logs.forEach(function(line) { terminal.print(line) })
  }

  var ViewTerm = Backbone.View.extend({
    initialize: function() {
      var button = $("#id-tab-btn-debug").prop("disabled", true)
      button.on("click", function() {
        $.fn.fullpage.moveTo(SECTION_HOME)
        if (terminal) {
          if (consolePanel.dialog("isOpen"))
            consolePanel.dialog("close")
          else
            consolePanel.dialog("open").dialog("moveToTop")
          return
        }
        button.prop("disabled", true)
        require(["tinyterm"], function(Constructor) {
          TinyTerm = Constructor
          ["lib/tinyterm.min.css", "lib/themes/solarized.css"].forEach(function(href) {
            $("<link>", { rel: "stylesheet", href: window.webwigoAsset(href) }).appendTo("head")
          })
          renderConsole()
          consolePanel.dialog({
            classes: { "ui-dialog": "vdlg-margin-top" },
            position: { at: "left bottom" },
            minWidth: 0,
            width: Math.min(800, Math.max(0, window.innerWidth - 24)),
            maxHeight: Math.max(120, window.innerHeight - 60),
            title: "Lua console"
          })
          button.prop("disabled", false)
        }, function() {
          button.prop("disabled", false).text("Retry debug console")
        })
      })

      this.listenTo(App, "evt-app-on-section-leave", function(srcidx) {
        if (terminal && srcidx === SECTION_HOME)
          consolePanel.dialog("close")
      })

      this.listenTo(mRDR, "evt-gwx-loaded", function() {
        logs = []
        if (terminal)
          renderConsole()
        log("Cartridge loaded")
        button.prop("disabled", false)
      })

      this.listenTo(mEMU, "evt-emu-println", log)
      this.listenTo(mEMU, "evt-emu-cartridge-playing", function() {
        running = true
      })
      this.listenTo(mEMU, "evt-emu-stopped evt-emu-started", function() {
        running = false
      })
    }
  })

  var instance
  return function getViewTerm() {
    return instance || (instance = new ViewTerm())
  }
})
