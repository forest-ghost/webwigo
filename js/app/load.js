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
  "text!app/tpl/load.html",
  "lib/m_rdr",
  "lib/m_url",
  "app/app0"
], function(T, mRDR, mURL, App) {

  var _handle = undefined
  var _params = undefined
  var loadErrors = {
    ERR_GWZ_OR_GWC_OR_LUA_FILE_EXPECTED: "Choose a .gwc, .gwz, or .lua cartridge file.",
    ERR_CARTRIDGE_UNZIP: "This GWZ could not be opened as a ZIP archive.",
    ERR_LUA_SOURCE_NOT_FOUND: "This GWZ does not contain a Lua source file.",
    ERR_CARTRIDGE_NAME_NOT_FOUND: "No Wherigo cartridge was found in the Lua source.",
    ERR_MULTIPLE_CARTRIDGES: "This GWZ contains more than one cartridge source. Keep one cartridge entry point per archive.",
    ERR_BAD_SIGNATURE: "This file does not have a valid GWC header.",
    ERR_SHORT_FILE: "This GWC is incomplete or has an invalid object table.",
    ERR_LUA_CHUNK_NOT_FOUND: "This GWC does not contain a cartridge program.",
    ERR_LUA_CHUNK_FORMAT: "This GWC uses a Lua bytecode format WebWigo does not support.",
    ERR_LUA_CHUNK_INVALID: "The compiled Lua program in this GWC is incomplete or invalid.",
    ERR_UNKNOWN_ERROR: "The browser could not read the cartridge file.",
    ERR_FILE_NOT_FOUND: "The server could not find the cartridge.",
    ERR_READ_ERROR: "The server could not return the cartridge.",
    ERR_UNEXPECTED_ERROR: "The browser could not download the cartridge.",
    ERR_READ_TIMEOUT: "Downloading the cartridge took too long."
  }

  function isURI() {
    return (typeof _handle == "string")
  }

  var ViewLoad = Backbone.View.extend({
    el        : $("#id-tab-load-toaster"),
    template  : _.template(T),
    initialize: function() {
      this.render()
      var that = this
      $("#id-load-loc-inp").on("change", function() {
        that._load()
      })

      // fullpage plugin event: section leave
      this.listenTo(App, "evt-app-on-section-leave", function(srcidx, dstidx, direction) {
        this.hide()
      })

      // cartridge reader event: loaded
      this.listenTo(mRDR, "evt-gwx-loaded", function(gwx) {
        var that = this
        _.delay(function() {
          that.hide()
        }, (isURI() ? 3000 : 0))
      })
    },
    render: function() {
      this.$el.html(this.template())
      return this
    },
    load: function(uri) {
      if (uri) {
        _params = mURL.parse(uri)
        this.show(true)
        if (_params.error) {
          $("#id-load-err-msg").html(_params.error)
          $("#id-load-err"    ).show()
        } else {
          _handle = uri
          var that = this
          _.delay(function() {
            that._read()
          }, 1000)
        }
      }
    },
    reload: function() {
      $("#id-load-err").hide()
      this._read()
    },
    toggle: function() {
      if (this.$el.is(":visible"))
        this.hide()
      else
        this.show(false)
    },
    show: function(remote) {
      $("#id-load-err").hide()
      if (remote) {
        $("#id-load-msg").html("Loading cartridge from online provider")
        $("#id-load-rem").show()
        $("#id-load-loc").hide()

        if (_params.cart_provider_name == undefined)
          _params.cart_provider_name = "server"

        if (_params.cart_name == undefined)
          _params.cart_name = "cartridge"

        $("#id-load-rem-src").text(_params.cart_provider_name)
        $("#id-load-rem-nam").text(_params.cart_name)
        $("#id-load-rem-typ").text(_params.cart_type)
      } else {
        $("#id-load-msg").html("Load cartridge from your computer")
        $("#id-load-rem").hide()
        $("#id-load-loc").show()
      }
      this.$el.show("slide", { direction: "up" }, 500)
    },
    hide: function() {
      this.$el.hide("slide", { direction: "up" }, 500)
    },
    _read: function() {
      if (_handle != undefined) {
        var that = this
        mRDR.read(
          _handle,
          // onProgress
          function(val, max) {
            $("#id-load-inf-rcv").html(val)
            //if (max >= val) {
            //  $("#id-load-rem").show()
            //  $("#id-load-rem-bar").css("width", ((val * 100)/max)+"%")
            //}
          },
          // onStatus
          function(msg) {
            var $id = $("#id-load-inf-msg")
            var sep = ""
            if ($id.html())
              sep = ", "
            $id.append(sep+msg)
            $("#id-load-inf").show()
          },
          // onError
          function(msg) {
            if (isURI()) {
              $("#id-load-rem").hide()
              $("#id-load-inf").hide()
            //  $("#id-load-loc-nam").html(_handle)
            //  $("#id-load-loc"    ).show()
            }
            _handle = mRDR.getHandle()
            var code = String(msg).split("(")[0]
            $("#id-load-err-msg").text(loadErrors[code] || msg)
            $("#id-load-err"    ).show()
          }
        )
      }
    },
    _load: function() {
      $("#id-load-err").hide()
      var inputfile = $("#id-load-loc-inp")
      _handle = inputfile[0].files[0]
      inputfile.replaceWith(inputfile = inputfile.clone(true))
      this._read()
    }
  });

  // singleton
  var _instance;
  return function getViewLoad() {
    return (_instance = (_instance || new ViewLoad()))
  }
});
