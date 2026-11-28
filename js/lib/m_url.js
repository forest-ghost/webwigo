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
], function() {

  var _this = {}

  _this.parse = function(uri) {
    var query = uri.slice(uri.indexOf("?") + 1).split("#")[0]
    var params = new URLSearchParams(query)
    var cartridge = params.get("cart_url")
    var type = params.get("cart_type")

    if (!cartridge)
      return { error: "ERR_CART_URL_NOT_FOUND" }
    if (!type)
      return { error: "ERR_CART_TYPE_NOT_FOUND" }

    var url
    try {
      url = new URL(cartridge, window.location.href)
    } catch (error) {
      return { error: "ERR_INVALID_CART_URL" }
    }
    if (url.protocol !== "https:" && !(url.protocol === "http:" && url.origin === window.location.origin))
      return { error: "ERR_CART_URL_MUST_USE_HTTPS" }

    type = type.toUpperCase()
    if (type !== "GWZ" && type !== "GWC" && type !== "LUA")
      return { error: "ERR_GWZ_OR_GWC_OR_LUA_FILE_EXPECTED" }

    return {
      error: false,
      cart_provider_name: params.get("cart_provider_name") || undefined,
      cart_provider_url: params.get("cart_provider_url") || undefined,
      cart_name: params.get("cart_name") || undefined,
      cart_url: url.href,
      cart_type: type === "LUA" ? "SRC" : type
    }
  }

  return _this
});
