// IndexedDB を使った永続化
// 単一キー方式: 'app' という1レコードに全データを保存
// → 将来データが大きくなったらストア分割するが、現時点ではシンプルさ優先

import { AppData } from '../domain/types';
import { makeSeed } from '../domain/seed';

const DB_NAME = 'shisetsu-tensu';
const DB_VERSION = 1;
const STORE = 'app';
const KEY = 'data';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadData(): Promise<AppData> {
  const db = await openDb();
  return new Promise<AppData>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req = store.get(KEY);
    req.onsuccess = () => {
      const v = req.result as AppData | undefined;
      if (v) {
        resolve(v);
      } else {
        // 初回起動: ダミーデータを投入
        resolve(makeSeed());
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveData(data: AppData): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.put(data, KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// 完全リセット（設定画面から呼べる）
export async function clearAll(): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
