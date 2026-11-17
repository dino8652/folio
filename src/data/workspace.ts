import { createEnvelope, openEnvelope, seal, type Envelope } from '../crypto.ts'
import { correctImportedIncome, emptyLedger, prune, type Currency, type Ledger } from '../ledger.ts'
import { loadLedger, validateLedger } from '../domain/ledger-schema.ts'
import { readPasskey, registerPasskey } from '../passkey.ts'
import { readRecord, writeRecord } from '../storage.ts'
import { SerialQueue } from './serial-queue.ts'
interface ActiveWorkspace { ledger: Ledger; key: CryptoKey; record: Envelope; owner?: string; secret?: string }
export class WorkspaceRepository {
  private active: ActiveWorkspace | null = null
  private generation = 0
  private queue = new SerialQueue()
  get current() { return this.active }
  close() { this.generation++; this.active = null }
  private check(attempt: number) { if (attempt !== this.generation) throw new Error('The workspace was locked before this operation finished.') }
  open(password: string, currency: Currency, owner?: string, email?: string, allowCreate = false) {
    const attempt = this.generation
    return this.queue.run(async () => {
      this.check(attempt)
      const record = await readRecord(owner)
      let opened: ActiveWorkspace
      if (!record) {
        if (!allowCreate && !owner) throw new Error('This browser no longer has a vault.')
        const ledger = loadLedger({ ...emptyLedger(currency), ...(email ? { profileEmail: email } : {}) })
        const created = await createEnvelope(password, ledger)
        this.check(attempt)
        await writeRecord(undefined, created.record, owner)
        opened = { ...created, ledger, owner, secret: owner ? password : undefined }
      } else {
        const factor = record.passkey ? await readPasskey(record.passkey) : undefined
        const decrypted = await openEnvelope<unknown>(password, record, factor).catch(() => { throw new Error(owner ? 'Your workspace could not be decrypted. Your saved data has not been changed.' : 'Unable to unlock this vault. Check your passphrase.') })
        const ledger = prune(correctImportedIncome(loadLedger(decrypted.data)))
        validateLedger(ledger)
        this.check(attempt)
        // Loading never rewrites the existing record; migrations persist on the next save.
        opened = { ledger, key: decrypted.key, record, owner, secret: owner ? password : undefined }
      }
      this.check(attempt)
      const latest = await readRecord(owner)
      if (latest?.revision !== opened.record.revision) throw new Error('The vault changed while unlocking. Try again.')
      this.check(attempt)
      this.active = opened
      return opened
    })
  }
  update(transform: (ledger: Ledger) => Ledger) {
    const attempt = this.generation
    return this.queue.run(async () => {
      this.check(attempt)
      const active = this.active
      if (!active) throw new Error('Unlock your vault first.')
      // Protect the active snapshot even if a caller accidentally mutates its input.
      const next = prune(transform(structuredClone(active.ledger)))
      validateLedger(next)
      const ledger = { ...next, schemaVersion: 2 as const }
      const record = await seal(active.key, active.record.salt, ledger, active.record.passkey)
      this.check(attempt)
      await writeRecord(active.record.revision, record, active.owner)
      this.check(attempt)
      this.active = { ...active, ledger, record }
      return this.active
    })
  }
  protect(password: string) {
    const attempt = this.generation
    return this.queue.run(async () => {
      this.check(attempt)
      const active = this.active
      if (!active || active.record.passkey) throw new Error('Open an unprotected vault first.')
      const secret = active.secret ?? password
      await openEnvelope(secret, active.record)
      const factor = await registerPasskey()
      const created = await createEnvelope(secret, active.ledger, factor)
      this.check(attempt)
      await writeRecord(active.record.revision, created.record, active.owner)
      this.check(attempt)
      this.active = { ...active, ...created }
      return this.active
    })
  }
  erase() {
    const attempt = this.generation
    return this.queue.run(async () => {
      this.check(attempt)
      const active = this.active
      if (!active) throw new Error('Unlock your vault first.')
      await writeRecord(active.record.revision, undefined, active.owner)
      this.close()
    })
  }
}
