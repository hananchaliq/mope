'use client';

import type { TransactionRecord } from './schemas';

const DB_NAME = 'moneyscope_offline_db';
const DB_VERSION = 1;
const STORE_QUEUE = 'offline_tx_queue';

function openQueueDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_QUEUE)) {
          db.createObjectStore(STORE_QUEUE, { keyPath: 'clientId' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function enqueueOfflineTransaction(tx: TransactionRecord): Promise<boolean> {
  const db = await openQueueDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(STORE_QUEUE, 'readwrite');
      const store = transaction.objectStore(STORE_QUEUE);
      store.put({ ...tx, syncStatus: 'pending_sync' });
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function getOfflineQueuedTransactions(userId: string): Promise<TransactionRecord[]> {
  const db = await openQueueDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(STORE_QUEUE, 'readonly');
      const store = transaction.objectStore(STORE_QUEUE);
      const req = store.getAll();
      req.onsuccess = () => {
        const all = (req.result as TransactionRecord[]) ?? [];
        resolve(all.filter((item) => item.userId === userId));
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function removeOfflineQueuedTransaction(clientId: string): Promise<void> {
  const db = await openQueueDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(STORE_QUEUE, 'readwrite');
      const store = transaction.objectStore(STORE_QUEUE);
      store.delete(clientId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function clearAllOfflineData(): Promise<void> {
  const db = await openQueueDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(STORE_QUEUE, 'readwrite');
      const store = transaction.objectStore(STORE_QUEUE);
      store.clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
