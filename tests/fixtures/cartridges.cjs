const fs = require("node:fs")
const path = require("node:path")
const JSZip = require("../../lib/jszip.min.js")

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, name))
}

function beep() {
  const sampleRate = 8000
  const sampleCount = sampleRate
  const wave = Buffer.alloc(44 + sampleCount)
  wave.write("RIFF", 0)
  wave.writeUInt32LE(36 + sampleCount, 4)
  wave.write("WAVEfmt ", 8)
  wave.writeUInt32LE(16, 16)
  wave.writeUInt16LE(1, 20)
  wave.writeUInt16LE(1, 22)
  wave.writeUInt32LE(sampleRate, 24)
  wave.writeUInt32LE(sampleRate, 28)
  wave.writeUInt16LE(1, 32)
  wave.writeUInt16LE(8, 34)
  wave.write("data", 36)
  wave.writeUInt32LE(sampleCount, 40)
  for (let i = 0; i < sampleCount; i++) {
    wave[44 + i] = Math.round(128 + 24 * Math.sin(2 * Math.PI * 440 * i / sampleRate))
  }
  return wave
}

function integer(bytes, value) {
  const result = Buffer.alloc(bytes)
  result.writeUIntLE(value, 0, bytes)
  return result
}

function terminated(text) {
  return Buffer.from(text + "\0", "utf8")
}

function archive(entries = { "cartridge.lua": fixture("media.lua"), "beep.wav": beep() }) {
  const zip = new JSZip()
  for (const [name, contents] of Object.entries(entries)) {
    zip.file(name, new Uint8Array(Buffer.from(contents)))
  }
  return zip.generateAsync({ type: "nodebuffer" })
}

function compiled(bytecode = fixture("media.luac"), sound = { type: 17, bytes: beep() }) {
  const u16 = value => integer(2, value)
  const u32 = value => integer(4, value)
  const start = Buffer.alloc(32)
  start.writeDoubleLE(0.05, 0)
  start.writeDoubleLE(0.04, 8)

  const header = Buffer.concat([
    start, u16(65535), u16(65535), terminated("Geocache"),
    terminated("Fixture player"), Buffer.alloc(8),
    ...[
      "Synthetic compiled fixture", "fixture", "Test description",
      "Départ près du test", "1", "Fixture author", "", "",
    ].map(terminated),
    u32(0), terminated(""),
  ])
  const program = Buffer.concat([u32(bytecode.length), bytecode])
  const audioObject = Buffer.concat([Buffer.from([1]), u32(sound.type), u32(sound.bytes.length), sound.bytes])
  const unknownObject = Buffer.concat([Buffer.from([1]), u32(255), u32(1), Buffer.from([42])])
  const objects = [program, audioObject, unknownObject]
  let offset = 7 + 2 + 6 * objects.length + 4 + header.length
  const objectTable = objects.map((object, index) => {
    const entry = Buffer.concat([u16(index), u32(offset)])
    offset += object.length
    return entry
  })

  return Buffer.concat([
    Buffer.from([2, 10, 67, 65, 82, 84, 0]), u16(objects.length),
    ...objectTable, u32(header.length), header, ...objects,
  ])
}

module.exports = { fixture, archive, compiled }
