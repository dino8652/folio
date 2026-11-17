import type { Envelope } from './crypto.ts'
const table = 'vault'
const keyFor = (owner?: string) => owner ? `account:${owner}` : 'ledger'
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('folio-private-vault', 1)
    let settled = false
    const timer = setTimeout(() => { settled = true; reject(new Error('Browser storage is busy. Close other Folio tabs and try again.')) }, 10000)
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(table)) request.result.createObjectStore(table) }
    request.onsuccess = () => { clearTimeout(timer); if (settled) request.result.close(); else { settled = true; resolve(request.result) } }
    request.onerror = () => { clearTimeout(timer); settled = true; reject(new Error('Browser storage is unavailable. Check your browser storage settings.')) }
  })
}
export async function readRecord(owner?: string): Promise<Envelope | undefined> {
  const db = await database()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(table)
      const request = tx.objectStore(table).get(keyFor(owner))
      tx.oncomplete = () => resolve(request.result)
      tx.onabort = () => reject(new Error('The vault could not be read. Please try again.'))
      tx.onerror = () => reject(new Error('The vault could not be read. Please try again.'))
    })
  } finally { db.close() }
}
export async function writeRecord(expected: string | undefined, next?: Envelope, owner?: string) {
  const db = await database()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(table, 'readwrite')
      const store = tx.objectStore(table)
      const request = store.get(keyFor(owner))
      let conflict = false
      request.onsuccess = () => {
        const current = request.result as Envelope | undefined
        if (current?.revision !== expected) { conflict = true; tx.abort(); return }
        if (next) store.put(next, keyFor(owner)); else store.delete(keyFor(owner))
      }
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(new Error(conflict ? 'The vault changed in another tab. Lock and unlock it to refresh.' : 'The vault could not be saved. Check available browser storage.'))
      tx.onerror = () => { /* Abort is authoritative: never report success before commit. */ }
    })
  } finally { db.close() }
}
