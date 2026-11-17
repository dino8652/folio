import { readCsv, readWorkbook } from './readers.ts'
import { parseRows, type DateOrder } from './statement.ts'

self.onmessage = async ({ data }: MessageEvent<{ type: 'csv' | 'xlsx'; bytes: ArrayBuffer; order: DateOrder; flip: boolean }>) => {
  try {
    let table
    if (data.type === 'csv') {
      const bytes = new Uint8Array(data.bytes)
      const encoding = bytes[0] === 255 && bytes[1] === 254 ? 'utf-16le' : bytes[0] === 254 && bytes[1] === 255 ? 'utf-16be' : 'utf-8'
      table = readCsv(new TextDecoder(encoding, { fatal: true }).decode(bytes))
    } else {
      try {
        table = await readWorkbook(data.bytes)
      } catch {
        throw new Error('This workbook could not be read. Use an unlocked XLSX file with the transactions on its first sheet, or export to CSV.')
      }
    }
    self.postMessage({ result: parseRows(table, data.order, data.flip) })
  } catch (error) {
    self.postMessage({ error: error instanceof Error && !(error instanceof TypeError) ? error.message : 'This file could not be read. Export it as a UTF-8 CSV and try again.' })
  }
}
