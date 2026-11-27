define([], function() {
  // Lua 5.1.5 ldump.c and lundump.c define the chunk layout. WebWigo's
  // VM uses 32-bit lengths, even in a 64-bit browser.
  var vmHeader = [27, 76, 117, 97, 81, 0, 1, 4, 4, 4, 8, 0]

  function convertStringLengths(chunk) {
    var data = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength)
    var result = new Uint8Array(chunk.length)
    result.set(vmHeader)
    var readOffset = vmHeader.length
    var writeOffset = vmHeader.length

    function copy(size) {
      if (size > chunk.length - readOffset)
        throw new RangeError("Incomplete Lua chunk")
      result.set(chunk.subarray(readOffset, readOffset+size), writeOffset)
      readOffset += size
      writeOffset += size
    }

    function count() {
      var value = data.getInt32(readOffset, true)
      if (value < 0)
        throw new RangeError("Invalid Lua chunk count")
      copy(4)
      return value
    }

    function string() {
      var size = data.getUint32(readOffset, true)
      if (data.getUint32(readOffset+4, true) !== 0)
        throw new RangeError("Invalid Lua string length")
      copy(4)
      readOffset += 4
      copy(size)
      if (size && chunk[readOffset-1] !== 0)
        throw new RangeError("Invalid Lua string")
    }

    function prototype(depth) {
      if (depth >= 200)
        throw new RangeError("Too many nested Lua functions")
      string()
      copy(12) // function line range, arguments and stack size
      copy(count()*4) // instructions
      var constants = count()
      for (var i = 0; i < constants; i++) {
        var type = chunk[readOffset]
        copy(1)
        switch (type) {
          case 0: break // nil
          case 1: copy(1); break // boolean
          case 3: copy(8); break // number
          case 4: string(); break
          default: throw new RangeError("Invalid Lua constant")
        }
      }
      var functions = count()
      for (var j = 0; j < functions; j++)
        prototype(depth+1)
      copy(count()*4) // debug line numbers
      var locals = count()
      for (var k = 0; k < locals; k++) {
        string()
        copy(8) // local variable start and end instructions
      }
      var upvalues = count()
      for (var l = 0; l < upvalues; l++)
        string()
    }

    prototype(0)
    if (readOffset !== chunk.length)
      throw new RangeError("Unexpected data after Lua chunk")
    return result.subarray(0, writeOffset)
  }

  return function normalizeChunk(chunk) {
    if (!chunk.length)
      throw new Error("ERR_LUA_CHUNK_NOT_FOUND")
    if (chunk[0] !== vmHeader[0])
      return chunk // Some GWC exporters store Lua source.
    if (!vmHeader.every(function(value, index) {
      return chunk[index] === value || (index === 8 && chunk[index] === 8)
    }))
      throw new Error("ERR_LUA_CHUNK_FORMAT")
    if (chunk[8] === 4)
      return chunk
    try {
      return convertStringLengths(chunk)
    } catch (error) {
      throw new Error("ERR_LUA_CHUNK_INVALID")
    }
  }
})
