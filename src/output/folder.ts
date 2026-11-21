// Папка дня. File System Access API: пользователь один раз выбирает корневую папку «Дневник»
// (handle хранится в IndexedDB), каждый день пишется в «2026-11-21 — Осенний парк и какао/».
// Аудиофайл кладётся только если его загрузил сам пользователь (фрагменты iTunes — нет).
// Fallback для браузеров без FS Access — ZIP с той же структурой.

import JSZip from 'jszip';
import type { DayEntry } from '../types';
import { getRootHandle, setRootHandle } from '../archive/db';
import { dateLine } from '../style/typography';

type Picker = (o?: { id?: string; mode?: 'read' | 'readwrite'; startIn?: string }) => Promise<FileSystemDirectoryHandle>;
type PermHandle = FileSystemDirectoryHandle & {
  queryPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
};

export const fsAccessAvailable = () => typeof (window as unknown as { showDirectoryPicker?: Picker }).showDirectoryPicker === 'function';

/** имя папки дня: дата — название, без символов, запрещённых в Windows/macOS */
export function dayFolderName(e: DayEntry) {
  const t = e.title.replace(/[\\/:*?"<>|]/g, '').replace(/[. ]+$/, '').trim();
  return `${e.date} — ${t}`;
}

const ext = (b: Blob, fallback: string) => {
  const m = b.type.split('/')[1]?.split(';')[0];
  return m === 'jpeg' ? 'jpg' : m === 'mpeg' ? 'mp3' : m === 'x-wav' || m === 'wave' ? 'wav' : m || fallback;
};

/** список файлов дня: путь → содержимое */
export function dayFiles(e: DayEntry): { path: string; data: Blob | string }[] {
  const files: { path: string; data: Blob | string }[] = [];
  const head = `${e.title}\n${dateLine(e.date, e.mood.timeOfDay)} · страница ${e.page}\n${e.caption ? `«${e.caption}»\n` : ''}\n`;
  files.push({ path: 'запись.txt', data: head + e.text + '\n' });
  e.photos.forEach((p, i) => files.push({ path: `photos/${String(i + 1).padStart(2, '0')}${i === e.heroIndex ? '-главное' : ''}.${ext(p, 'jpg')}`, data: p }));
  files.push({ path: 'poster.png', data: e.outputs.poster });
  if (e.outputs.video) files.push({ path: `memory.${ext(e.outputs.video, 'webm')}`, data: e.outputs.video });
  if (e.outputs.voice) files.push({ path: `voice.${ext(e.outputs.voice, 'webm')}`, data: e.outputs.voice });
  if (e.song) {
    const s = e.song;
    const lines = [
      `Название: ${s.title || '—'}`, `Исполнитель: ${s.artist || '—'}`, s.year ? `Год: ${s.year}` : '', s.link ? `Ссылка: ${s.link}` : '',
      s.features ? `Темп: ${Math.round(s.features.bpm)} BPM · ${s.features.key !== '—' ? s.features.key + ' ' : ''}${s.features.scale === 'minor' ? 'минор' : 'мажор'} · энергия ${s.features.energy.toFixed(2)}` : '',
      `Признаки: ${s.featuresFrom === 'audio' ? (s.source === 'file' ? 'анализ своего файла' : 'анализ официального фрагмента') : s.featuresFrom === 'description' ? 'оценка по описанию, не по звуку' : 'не анализировались'}`,
    ].filter(Boolean);
    files.push({ path: 'песня.txt', data: lines.join('\n') + '\n' });
    // аудио — только если пользователь загрузил его сам
    if (s.source === 'file' && s.blob) files.push({ path: `песня.${ext(s.blob, 'audio')}`, data: s.blob });
  }
  const json = {
    date: e.date, page: e.page, title: e.title, caption: e.caption, seed: e.seed,
    mood: e.mood, style: e.style, decisions: e.decisions,
    song: e.song ? { ...e.song, blob: undefined, previewBlob: undefined, features: e.song.features ? { ...e.song.features, beats: e.song.features.beats.map(b => Math.round(b * 1000) / 1000) } : undefined } : null,
  };
  files.push({ path: 'day.json', data: JSON.stringify(json, null, 2) });
  return files;
}

async function writeFile(dir: FileSystemDirectoryHandle, path: string, data: Blob | string) {
  const parts = path.split('/');
  let d = dir;
  for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
  const fh = await d.getFileHandle(parts[parts.length - 1], { create: true });
  const w = await fh.createWritable();
  await w.write(data);
  await w.close();
}

/** запись дня в корневую папку (любой FileSystemDirectoryHandle — в том числе OPFS для проверки) */
export async function writeDayFolder(root: FileSystemDirectoryHandle, e: DayEntry): Promise<string> {
  const name = dayFolderName(e);
  const dir = await root.getDirectoryHandle(name, { create: true });
  for (const f of dayFiles(e)) await writeFile(dir, f.path, f.data);
  return name;
}

/** корневая папка: сохранённый handle (с проверкой разрешения) или выбор новой — только по жесту пользователя */
export async function ensureRoot(interactive: boolean): Promise<FileSystemDirectoryHandle | null> {
  let h = (await getRootHandle()) as PermHandle | undefined;
  if (h) {
    const q = (await h.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
    if (q === 'granted') return h;
    if (interactive && (await h.requestPermission?.({ mode: 'readwrite' })) === 'granted') return h;
    if (!interactive) return null;
  }
  if (!interactive || !fsAccessAvailable()) return null;
  h = await (window as unknown as { showDirectoryPicker: Picker }).showDirectoryPicker({ id: 'diary-root', mode: 'readwrite', startIn: 'documents' });
  await setRootHandle(h);
  return h;
}

export async function rootName(): Promise<string | null> { return (await getRootHandle())?.name ?? null; }

export async function dayZip(e: DayEntry): Promise<Blob> {
  const zip = new JSZip();
  const dir = zip.folder(dayFolderName(e))!;
  for (const f of dayFiles(e)) dir.file(f.path, f.data);
  return zip.generateAsync({ type: 'blob' });
}

export function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
