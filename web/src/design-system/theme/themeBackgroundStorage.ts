const DATABASE_NAME = 'career-decision-appearance'
const STORE_NAME = 'backgrounds'
const DATABASE_VERSION = 1

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前环境不支持本地背景存储'))
      return
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('无法打开背景存储'))
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
) {
  const database = await openDatabase()
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode)
    const request = operation(transaction.objectStore(STORE_NAME))
    let result!: T
    request.onsuccess = () => { result = request.result }
    request.onerror = () => reject(request.error || new Error('背景存储操作失败'))
    transaction.oncomplete = () => {
      database.close()
      resolve(result)
    }
    transaction.onerror = () => {
      database.close()
      reject(transaction.error || new Error('背景存储事务失败'))
    }
  })
}

export const saveBackgroundBlob = (id: string, blob: Blob) =>
  withStore('readwrite', (store) => store.put(blob, id))

export const loadBackgroundBlob = (id: string) =>
  withStore<Blob | undefined>('readonly', (store) => store.get(id))

export const deleteBackgroundBlob = (id: string) =>
  withStore('readwrite', (store) => store.delete(id))
