import Papa from 'papaparse'

export function readCsv(text: string) {
  if (text.includes('\0')) throw new Error('This file does not appear to be a text CSV.')
  const output = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy', delimitersToGuess: [',', ';', '\t', '|'] })
  if (output.errors.some(error => error.type === 'Quotes')) throw new Error('The CSV contains a malformed quoted field.')
  if (output.data.length > 20_100 || output.data.some(row => row.length > 100)) throw new Error('This CSV exceeds the supported row or column limit.')
  return output.data
}

export function validateZip(bytes: ArrayBuffer) {
  const data = new DataView(bytes)
  const bad = () => new Error('The Excel archive is invalid, encrypted, or exceeds the safe size limit.')
  let end = bytes.byteLength - 22
  while (end >= Math.max(0, bytes.byteLength - 65_557) && data.getUint32(end, true) !== 0x06054b50) end--
  if (end < Math.max(0, bytes.byteLength - 65_557)) throw bad()
  const entries = data.getUint16(end + 10, true)
  const centralSize = data.getUint32(end + 12, true)
  let pos = data.getUint32(end + 16, true)
  if (entries < 1 || entries > 500 || pos + centralSize !== end || data.getUint16(end + 4, true) || data.getUint16(end + 6, true)
    || data.getUint16(end + 8, true) !== entries || (end >= 20 && data.getUint32(end - 20, true) === 0x07064b50)) throw bad()
  const files: { name: string; start: number; length: number; size: number; method: number }[] = []
  const names = new Set<string>()
  const decoder = new TextDecoder()
  let expanded = 0
  for (let i = 0; i < entries; i++) {
    if (pos + 46 > end || data.getUint32(pos, true) !== 0x02014b50 || data.getUint16(pos + 8, true) & 1) throw bad()
    const size = data.getUint32(pos + 24, true)
    const length = data.getUint32(pos + 20, true)
    const nameLength = data.getUint16(pos + 28, true)
    const nextPos = pos + 46 + nameLength + data.getUint16(pos + 30, true) + data.getUint16(pos + 32, true)
    if (nextPos > end || data.getUint16(pos + 34, true)) throw bad()
    const name = decoder.decode(bytes.slice(pos + 46, pos + 46 + nameLength))
    if (!name || names.has(name) || name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')) throw bad()
    names.add(name)
    expanded += size
    if (expanded > 48 * 1024 * 1024) throw bad()
    const method = data.getUint16(pos + 10, true)
    if (![0, 8].includes(method) || (method === 0 && size !== length)) throw bad()
    const local = data.getUint32(pos + 42, true)
    if (local + 30 > end || data.getUint32(local, true) !== 0x04034b50) throw bad()
    const start = local + 30 + data.getUint16(local + 26, true) + data.getUint16(local + 28, true)
    if (start + length > data.getUint32(end + 16, true)) throw bad()
    files.push({ name, start, length, size, method })
    pos = nextPos
  }
  if (pos !== end) throw bad()
  return files
}

function checkXml(xml: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Document type declarations are not allowed in workbooks.')
  if (!/<(?:[\w.-]+:)?worksheet[\s>]/.test(xml)) return
  let rows = 0
  for (const tag of xml.matchAll(/<(?:[\w.-]+:)?(row|c|dimension)\b[^>]*>/g)) {
    const [, kind] = tag
    const coordinate = tag[0].match(/\s(?:r|ref)\s*=\s*(['"])(.*?)\1/)?.[2]
    if (kind === 'row') {
      rows++
      if (rows > 20_100 || (coordinate && (!/^\d{1,5}$/.test(coordinate) || Number(coordinate) > 20_100))) throw new Error('Worksheet exceeds the row limit.')
    } else if (coordinate) {
      for (const part of coordinate.split(':')) {
        const cell = part.match(/^([A-Z]{1,2})([1-9]\d{0,4})$/)
        if (!cell || Number(cell[2]) > 20_100) throw new Error('Worksheet exceeds the supported size.')
        let column = 0
        for (const letter of cell[1]) column = column * 26 + letter.charCodeAt(0) - 64
        if (column > 100) throw new Error('Worksheet exceeds 100 columns.')
      }
    }
  }
}

async function verifyEntries(bytes: ArrayBuffer, files: ReturnType<typeof validateZip>) {
  for (const file of files) {
    if (!/\.(?:xml|rels)$/i.test(file.name)) continue
    const source = new Uint8Array(bytes, file.start, file.length)
    if (file.method === 0) {
      checkXml(new TextDecoder('utf-8', { fatal: true }).decode(source))
      continue
    }
    const reader = new Blob([source]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader()
    const decoder = new TextDecoder('utf-8', { fatal: true })
    let total = 0
    let xml = ''
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > file.size) throw new Error('Excel archive size does not match its contents.')
        xml += decoder.decode(value, { stream: true })
      }
      if (total !== file.size) throw new Error('Excel archive size does not match its contents.')
      checkXml(xml + decoder.decode())
    } finally {
      await reader.cancel().catch(() => {})
    }
  }
}

export async function readWorkbook(bytes: ArrayBuffer) {
  await verifyEntries(bytes, validateZip(bytes))
  const { readSheet } = await import('read-excel-file/universal')
  const rows = await readSheet(new Blob([bytes]), 1)
  return rows.map(row => row.map(cell => typeof cell === 'function' ? null : cell))
}
