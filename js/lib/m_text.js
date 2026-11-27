define([], function() {
  var utf8 = new TextDecoder("utf-8", { fatal: true })
  var legacy = new TextDecoder("windows-1252")

  return function decodeByteString(text) {
    var bytes = Uint8Array.from(text, function(character) {
      return character.charCodeAt(0)
    })
    try {
      return utf8.decode(bytes)
    } catch (error) {
      return legacy.decode(bytes)
    }
  }
})
