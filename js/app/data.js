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
  "text!app/tpl/data.html",
  "lib/m_rdr",
  "app/app0"
], function(T, mRDR, App) {

  var ViewData = Backbone.View.extend({
    el        : $("#id-data"),
    template  : _.template(T),
    initialize: function() {
      var view = this
      var button = $("#id-tab-btn-data")
      button.on("click", function() {
        $.fn.fullpage.moveTo(SECTION_DATA)
      })
      this.listenTo(mRDR, "evt-gwx-loaded", function(gwx) {
        this.$el.empty()
        this.reader = gwx.canSeeMedias() ? gwx : null
        this.rendered = false
        button.toggleClass("disabled", !this.reader).prop("disabled", !this.reader)
      })
      this.listenTo(App, "evt-app-on-section-loaded", function(anchor, index) {
        if (index !== SECTION_DATA)
          return
        if (!view.reader) {
          $.fn.fullpage.silentMoveTo(SECTION_HOME)
          return
        }
        if (!view.rendered) {
          view.rendered = true
          view.render(view.reader)
        }
      })
    },
    render: function(gwx) {
      var rows = 0
      var cols = 0
      var that = this

      $.each(gwx.getMediasList(), function(idx, filename) {
        if (cols == 0) {
          rows++
          that.$el.append(that.template({
            add: "row",
            id : "id-data-row-"+rows
          }))
        }
        var row = $("#id-data-row-"+rows)
        if (gwx.isCode(filename)) {
          row.append(that.template({
            add     : "code",
            imagesrc: "img/code.png",
            filename: filename
          }))
        }
        else
        if (gwx.isImage(filename)) {
          gwx.getMediaData(filename, function(src) {
            row.append(that.template({
              add     : "image",
              imagesrc: src,
              filename: filename
            }))
          })
        }
        else
        if (gwx.isSound(filename)) {
          row.append(that.template({
            add     : "sound",
            imagesrc: "img/sound.png",
            filename: filename
          }))
        }
        cols++
        if (cols == 6)
          cols = 0
      })
      _.delay(function() {
        // data will be displayed: force a rebuild to get the scrollbar
        $.fn.fullpage.reBuild()
      }, 250)
      return this
    }
  });

  // singleton
  var _instance;
  return function getViewData() {
    return (_instance = (_instance || new ViewData()))
  }
});
