/**
 * The IndexedDB plumbing every browser store repeats, so each store says what it keeps and not how a request
 * becomes a promise. Opening lives in openIndexedDb.ts (best effort) and workbenchOpen.ts (versioned).
 */

/** Resolves true when the transaction commits and false when it errors or aborts. Never rejects. */
export function committed(transaction: IDBTransaction): Promise<boolean> {
  return new Promise((resolve) => {
    transaction.oncomplete = () => resolve(true)
    transaction.onerror = () => resolve(false)
    transaction.onabort = () => resolve(false)
  })
}

/** The request's result, or undefined when it fails. Never rejects. */
export function resultOrUndefined<T>(request: IDBRequest<T>): Promise<T | undefined> {
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(undefined)
  })
}

/** The request's result; rejects with its error, or `${label} failed`, when it fails. */
export function requestResult<T>(request: IDBRequest<T>, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error(`${label} failed`))
  })
}

/** Resolves when the transaction commits; rejects with its error, or `${label} failed` or `${label} aborted`. */
export function commitOrThrow(transaction: IDBTransaction, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error(`${label} failed`))
    transaction.onabort = () => reject(transaction.error ?? new Error(`${label} aborted`))
  })
}

/**
 * Lets another tab upgrade or delete the database: this connection closes and `forget` drops whatever cached it.
 * With `alsoOnClose`, a close by the browser drops it too.
 */
export function yieldToOtherTabs(db: IDBDatabase, forget: () => void, alsoOnClose = false): void {
  db.onversionchange = () => {
    db.close()
    forget()
  }
  if (alsoOnClose) db.onclose = forget
}
