export function fakeZip(expanded: number) {
  const buffer = new ArrayBuffer(68)
  const data = new DataView(buffer)
  data.setUint32(0, 0x02014b50, true)
  data.setUint32(24, expanded, true)
  data.setUint32(46, 0x06054b50, true)
  data.setUint16(54, 1, true)
  data.setUint16(56, 1, true)
  data.setUint32(58, 46, true)
  return buffer
}
