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
  "lib/m_map"
], function(mMAP) {

  var _this        = {}

  // constants
  var gpstimer_dly = 1000
  var accuracy_min = 2
  var accuracy_max = 32
  var playing      = false

  // variables
  var gpstimer_tid = undefined
  var isrunning    = false
  var accuracy     = accuracy_max
  var currloc      = {
    lat: 360.0000,
    lng: 360.0000
  }

  function gpsTimerUpdate() {
    accuracy = Math.max(accuracy_min, Math.floor(accuracy / 2))
    _this.trigger("evt-gps-accuracy-change", accuracy)
    if (accuracy === accuracy_min)
      clearInterval(gpstimer_tid)
  }

  _this.setPlayerLocation = function(loc) {
    currloc.lat = loc.lat
    currloc.lng = loc.lng
    if (isrunning)
      _this.trigger("evt-gps-set-player-location", currloc, accuracy)
  }

  _this.getPlayerLocation = function() {
    return currloc
  }

  _this.Start = function() {
    // notify listeners
    isrunning = true
    _this.trigger("evt-gps-on-off-status", isrunning)
    // start timer and update location/accuracy
    _this.SetPlaying(playing)
    _this.setPlayerLocation(currloc)
  }

  _this.Stop = function() {
    // notify listeners
    isrunning = false
    _this.trigger("evt-gps-on-off-status", isrunning)
    // stop timer and update accuracy
    clearInterval(gpstimer_tid)
    accuracy  = accuracy_max
    _this.trigger("evt-gps-accuracy-change", undefined)
  }

  _this.SetPlaying = function(enabled) {
    playing = enabled
    clearInterval(gpstimer_tid)
    accuracy = accuracy_max
    _this.trigger("evt-gps-accuracy-change", enabled && isrunning ? accuracy : undefined)
    if (enabled && isrunning)
      gpstimer_tid = setInterval(gpsTimerUpdate, gpstimer_dly)
  }

  _this.OnOff = function() {
    if (isrunning)
      _this.Stop()
    else
      _this.Start()
  }

  _this.Create = function() {
    _this.listenTo(mMAP, "evt-map-set-player-location", function(loc) {
      _this.setPlayerLocation(loc)
    })
    //_this.Stop()
  }

  // extends module with Backbone Events
  _.extend(_this, Backbone.Events)
  return _this
});
