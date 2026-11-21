// Архив дней в IndexedDB (idb) + хранилище handle корневой папки «Дневник» (File System Access).

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { DayEntry } from '../types';

interface DiaryDB extends DBSchema {
  days: { key: string; value: DayEntry; indexes: { byDate: string } };
  handles: { key: string; value: FileSystemDirectoryHandle };
}

let dbp: Promise<IDBPDatabase<DiaryDB>> | null = null;
const db = () =>
  (dbp ??= openDB<DiaryDB>('atmosphere-diary', 2, {
    upgrade(d, oldVersion) {
      if (oldVersion < 1) {
        const s = d.createObjectStore('days', { keyPath: 'id' });
        s.createIndex('byDate', 'date');
      }
      if (oldVersion < 2) d.createObjectStore('handles');
    },
  }));

export async function saveDay(e: DayEntry) { await (await db()).put('days', e); }
export async function getDay(id: string) { return (await db()).get('days', id); }
export async function deleteDay(id: string) { await (await db()).delete('days', id); }
export async function allDays(): Promise<DayEntry[]> {
  const list = await (await db()).getAll('days');
  return list.sort((a, b) => (b.date === a.date ? b.createdAt - a.createdAt : b.date.localeCompare(a.date)));
}
export async function nextPage(): Promise<number> {
  const list = await (await db()).getAll('days');
  return list.reduce((m, d) => Math.max(m, d.page ?? 0), 0) + 1;
}

export async function getRootHandle() { return (await db()).get('handles', 'root'); }
export async function setRootHandle(h: FileSystemDirectoryHandle) { await (await db()).put('handles', h, 'root'); }
