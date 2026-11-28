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
  "text!app/tpl/gpsr.html",
  "lib/m_gps",
  "lib/m_map",
  "lib/m_rdr",
  "lib/m_emu",
  "app/app0",
], function(T, mGPS, mMAP, mRDR, mEMU, App) {

  var _gpsdata = {
    run: mGPS.IsEnabled(),
    lat: undefined,
    lng: undefined,
    acc: undefined
  }

  function formatCoordinate(value, positive, negative, degreeWidth) {
    if (!Number.isFinite(value))
      return "..."

    var thousandthsOfMinute = Math.round(Math.abs(value) * 60000)
    var degrees = Math.floor(thousandthsOfMinute / 60000)
    var minutes = (thousandthsOfMinute % 60000) / 1000
    return (value < 0 ? negative : positive) +
      String(degrees).padStart(degreeWidth, "0") + "° " +
      minutes.toFixed(3).padStart(6, "0")
  }

  function _acc(acc) {
    if (acc && (acc < 1000))
      return acc + "m"
    return "..."
  }

  var ViewGpsr = Backbone.View.extend({
    el        : $("#id-tab-gpsr-toaster"),
    events    : {
      "click #id-gpsr-toggle-onoff": function() {
        mGPS.OnOff()
      }
    },
    template  : _.template(T),
    initialize: function() {
      mGPS.Create()
      this.render()

      // show the view on initialization if the active section is the map
      if ($("#section-emap").hasClass("active"))
        this.show()

      // fullpage plugin event: section leave
      this.listenTo(App, "evt-app-on-section-leave", function(srcidx, dstidx, direction) {
        if (srcidx == SECTION_HOME)
          this.hide()
        if (dstidx == SECTION_HOME)
          this.show()
      })

      this.listenTo(mMAP, "evt-map-set-player-location", function(loc) {
        _gpsdata.lat = loc.lat
        _gpsdata.lng = loc.lng
        this.render()
      })

      this.listenTo(mGPS, "evt-gps-on-off-status", function(status) {
        _gpsdata.run = status
        this.render()
      })

      this.listenTo(mGPS, "evt-gps-accuracy-change", function(acc) {
        _gpsdata.acc = acc
        $("#id-accuracy").html(_acc(_gpsdata.acc))
      })

      this.listenTo(mRDR, "evt-gwx-loaded", function(gwx) {
        _gpsdata.acc = undefined
        this.render()
      })

      this.listenTo(mEMU, "evt-emu-stopped", function() {
        _gpsdata.acc = undefined
        this.render()
      })
    },

    render: function() {
      var focused = document.activeElement.id
      this.$el.html(this.template({
        running  :      _gpsdata.run ,
        latitude : formatCoordinate(_gpsdata.lat, "N", "S", 2),
        longitude: formatCoordinate(_gpsdata.lng, "E", "W", 3),
        accuracy : _acc(_gpsdata.acc)
      }))
      if (focused === "id-gpsr-toggle-onoff")
        $("#id-gpsr-toggle-onoff").focus()
      return this
    },

    show: function() {
        this.$el.show("slide", { direction: "up" }, 500)
    },

    hide: function() {
        this.$el.hide("slide", { direction: "up" }, 500)
    }
  });

  // singleton
  var _instance;
  return function getViewGpsr() {
    return (_instance = (_instance || new ViewGpsr()))
  }
});
