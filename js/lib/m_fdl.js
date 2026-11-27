define([], function() {
  var sampleRate = 22050
  var recordSize = 6

  function writeTag(bytes, offset, tag) {
    for (var i = 0; i < tag.length; i++)
      bytes[offset+i] = tag.charCodeAt(i)
  }

  // Groundspeak's SystemBeepRecorder writes little-endian records containing
  // the rest flag, frequency in hertz and duration in milliseconds.
  return function fdlToWav(source) {
    if (!source.length || source.length % recordSize)
      return undefined
    var records = new DataView(source.buffer, source.byteOffset, source.byteLength)
    var duration = 0
    for (var offset = 0; offset < records.byteLength; offset += recordSize) {
      if (records.getUint16(offset, true) > 1)
        return undefined
      duration += records.getUint16(offset+4, true)
    }
    if (!duration || duration > 300000)
      return undefined

    var sampleCount = Math.round(duration * sampleRate / 1000)
    var buffer = new ArrayBuffer(44 + sampleCount + sampleCount%2)
    var bytes = new Uint8Array(buffer)
    var header = new DataView(buffer)
    writeTag(bytes, 0, "RIFF")
    header.setUint32(4, buffer.byteLength - 8, true)
    writeTag(bytes, 8, "WAVEfmt ")
    header.setUint32(16, 16, true)
    header.setUint16(20, 1, true)
    header.setUint16(22, 1, true)
    header.setUint32(24, sampleRate, true)
    header.setUint32(28, sampleRate, true)
    header.setUint16(32, 1, true)
    header.setUint16(34, 8, true)
    writeTag(bytes, 36, "data")
    header.setUint32(40, sampleCount, true)

    var written = 0
    var elapsed = 0
    for (var position = 0; position < records.byteLength; position += recordSize) {
      var rest = records.getUint16(position, true) !== 0
      var frequency = records.getUint16(position+2, true)
      elapsed += records.getUint16(position+4, true)
      var end = Math.round(elapsed * sampleRate / 1000)
      var phaseStep = 2 * Math.PI * frequency / sampleRate
      for (var sample = written; sample < end; sample++) {
        var amplitude = rest || frequency >= sampleRate/2 ? 0 : Math.sin((sample-written)*phaseStep)
        bytes[44+sample] = Math.round(128 + 32*amplitude)
      }
      written = end
    }
    return new Blob([buffer], { type: "audio/wav" })
  }
})
