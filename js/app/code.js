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
  "text!app/tpl/code.html",
  "lib/m_rdr",
  "app/app0"
], function(require, T, mRDR, App) {

  var ViewCode = Backbone.View.extend({
    el        : $("#id-code"),
    template  : _.template(T),
    initialize: function() {
      var view = this
      var button = $("#id-tab-btn-code")
      button.on("click", function() {
        $.fn.fullpage.moveTo(SECTION_CODE)
      })
      this.listenTo(mRDR, "evt-gwx-loaded", function(gwx) {
        this.$el.empty()
        this.reader = gwx.canSeeCode() ? gwx : null
        this.rendered = false
        button.toggleClass("disabled", !this.reader).prop("disabled", !this.reader)
      })
      this.listenTo(App, "evt-app-on-section-loaded", function(anchor, index) {
        if (index !== SECTION_CODE)
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
      this.$el.html(this.template({
        code: gwx.getCode()
      }))
      if (!document.getElementById("id-prism-style"))
        $("<link>", { id: "id-prism-style", rel: "stylesheet", href: window.webwigoAsset("lib/prism.css") }).appendTo("head")
      require(["prism"], function(Prism) {
        var source = document.querySelector("#id-code code")
        if (source)
          Prism.highlightElement(source)
      })
      // force a rebuild to get the scrollbar
      $.fn.fullpage.reBuild();
      return this
    }
  });

  // singleton
  var _instance;
  return function getViewCode() {
    return (_instance = (_instance || new ViewCode()))
  }
});
