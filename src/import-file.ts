import { verifyExtraction } from './domain/imports.ts'
import { findPdfStatementPeriod, parsePdfPage, reconcilePdfBalance, type PdfAliases, type PdfBalanceTrace, type PdfFragment, type DateOrder, type Extraction } from './statement.ts'

export const limitBytes = 8 * 1024 * 1024
export const extensions = ['pdf', 'csv', 'xlsx'] as const
export type FileType = typeof extensions[number]

export async function inspectFile(file: File, order: DateOrder, flip: boolean, aliases?: PdfAliases) {
  const type = file.name.split('.').pop()?.toLowerCase() as FileType
  if (!extensions.includes(type)) throw new Error('Choose a PDF, CSV, or Excel (.xlsx) statement.')
  if (!file.size || file.size > limitBytes) throw new Error('Choose a non-empty statement smaller than 8 MB.')
  const bytes = await file.arrayBuffer()
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(value => value.toString(16).padStart(2, '0')).join('')
  const extraction = type === 'pdf' ? await readPdf(bytes, order, flip, aliases) : await readTable(type, bytes, order, flip)
  verifyExtraction(extraction.rows, extraction.balance)
  return { ...extraction, hash, type }
}

function readTable(type: 'csv' | 'xlsx', bytes: ArrayBuffer, order: DateOrder, flip: boolean) {
  return new Promise<Extraction>((resolve, reject) => {
    const worker = new Worker(new URL('./table-worker.ts', import.meta.url), { type: 'module' })
    const finish = () => { clearTimeout(timeout); worker.terminate() }
    const timeout = setTimeout(() => {
      finish()
      reject(new Error('Reading took too long. Split the statement into smaller files.'))
    }, 20_000)
    worker.onmessage = ({ data }: MessageEvent<{ error?: string; result?: Extraction }>) => {
      finish()
      if (data.result) resolve(data.result)
      else reject(new Error(data.error ?? 'The file could not be read.'))
    }
    worker.onerror = () => {
      finish()
      reject(new Error('The file could not be read.'))
    }
    worker.postMessage({ type, bytes, order, flip }, [bytes])
  })
}

async function readPdf(bytes: ArrayBuffer, order: DateOrder, flip: boolean, aliases?: PdfAliases) {
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error('The file does not have a valid PDF header.')
  const [{ GlobalWorkerOptions, getDocument }, { default: worker }] = await Promise.all([
    import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  GlobalWorkerOptions.workerSrc = worker
  const task = getDocument({ data: new Uint8Array(bytes), disableFontFace: true,
    useSystemFonts: false, useWasm: false, useWorkerFetch: false, verbosity: 0, stopAtErrors: true })
  const timeout = setTimeout(() => { void task.destroy().catch(() => {}) }, 20_000)
  try {
    const pdf = await task.promise
    if (pdf.numPages > 100) throw new Error('limit')
    const extraction: Extraction = { rows: [], issues: [] }
    const trace: PdfBalanceTrace = { entries: [], currencies: new Set() }
    let lineCount = 0
    let period: ReturnType<typeof findPdfStatementPeriod>
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n)
      const { items } = await page.getTextContent()
      const groups = new Map<number, PdfFragment[]>()
      for (const item of items) {
        if (!('str' in item) || !item.str.trim()) continue
        const y = Math.round(item.transform[5] / 2)
        const line = groups.get(y) ?? []
        line.push({ x: item.transform[4], width: item.width, y: item.transform[5], text: item.str.trim() })
        groups.set(y, line)
      }
      const lines = [...groups.entries()].sort((a, b) => b[0] - a[0])
        .map(([, line]) => line.sort((a, b) => a.x - b.x))
      period ??= findPdfStatementPeriod(lines, order)
      const parsed = parsePdfPage(lines, order, flip, period, trace, aliases)
      for (const issue of parsed.issues) extraction.issues.push({ ...issue, line: issue.line + lineCount })
      for (const row of parsed.rows) extraction.rows.push(row)
      lineCount += lines.length
      page.cleanup()
      if (lineCount > 20_000) throw new Error('limit')
    }
    if (!lineCount) throw new Error('scan')
    extraction.balance = reconcilePdfBalance(period, trace, extraction)
    return extraction
  } catch (error) {
    const reason = error instanceof Error ? error.message : ''
    if (reason === 'limit') throw new Error('This PDF exceeds the page or row limit. Split it into files of up to 100 pages.')
    if (reason === 'scan') throw new Error('This PDF has no readable text. Export a CSV or XLSX from your bank.')
    throw new Error('The PDF could not be read. Try an unlocked, text-based PDF or export to CSV.')
  } finally {
    clearTimeout(timeout)
    await task.destroy().catch(() => {})
  }
}
