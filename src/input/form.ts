// Форма дня: дата, текст, фото (перетаскивание или выбор), песня.

import { createDay, type SongInput } from '../day';
import { searchItunes, type ItunesHit } from '../analysis/song-meta';
import { llmReady, loadLlmConfig } from '../analysis/text-llm';
import { el, esc } from '../ui/dom';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function renderForm(root: HTMLElement) {
  let photos: File[] = [];
  const form = el('form', { class: 'day-form' });
  form.innerHTML = `
    <h1>Каким был день?</h1>
    <label class="field"><span>Дата</span><input type="date" name="date" required value="${today()}"></label>
    <label class="field"><span>О дне — как написали бы в дневник</span>
      <textarea name="text" rows="7" placeholder="Например: вечером гуляли с подругой по осеннему парку, листья шуршали, пили какао из бумажных стаканчиков…"></textarea></label>
    <div class="field"><span>Фото дня</span>
      <label class="drop" tabindex="0">
        <input type="file" name="photos" accept="image/*" multiple hidden>
        <span class="drop-hint">Перетащите фото сюда или нажмите, чтобы выбрать</span>
        <div class="thumbs"></div>
      </label>
    </div>
    <fieldset class="song"><legend>Песня дня</legend>
      <input name="artist" placeholder="Исполнитель">
      <input name="title" placeholder="Название">
      <div class="song-actions">
        <button type="button" class="ghost find">Найти фрагмент</button>
        <label class="ghost file-btn">Свой файл<input type="file" name="audio" accept="audio/*" hidden></label>
        <span class="song-chosen"></span>
      </div>
      <ul class="hits"></ul>
      <input name="link" placeholder="Ссылка (необязательно)">
      <p class="hint">Свой файл анализируется целиком. Без файла берём официальный 30-секундный фрагмент из iTunes. Если его нет, признаки оцениваются по жанру, и это будет отмечено.</p>
    </fieldset>
    <p class="hint mode-line">${llmReady(loadLlmConfig()) ? `Текст разберёт модель <b>${esc(loadLlmConfig().model)}</b>, правила — запасной вариант.` : 'Текст разберёт словарь правил (офлайн).'} <a href="#/settings">Настройки</a></p>
    <button type="submit" class="primary">Создать воспоминание</button>
    <ol class="progress" aria-live="polite"></ol>
    <p class="err" role="alert"></p>`;
  root.append(form);

  const fileInput = form.querySelector<HTMLInputElement>('input[type=file]')!;
  const drop = form.querySelector<HTMLLabelElement>('.drop')!;
  const thumbs = form.querySelector<HTMLDivElement>('.thumbs')!;
  const showThumbs = () => {
    thumbs.innerHTML = '';
    photos.forEach((f, i) => {
      const t = el('div', { class: 'thumb' });
      const img = el('img', { src: URL.createObjectURL(f), alt: '' });
      const x = el('button', { type: 'button', class: 'x', 'aria-label': 'Убрать фото' }, '×');
      x.onclick = e => { e.preventDefault(); photos.splice(i, 1); showThumbs(); };
      t.append(img, x);
      thumbs.append(t);
    });
    drop.classList.toggle('has', photos.length > 0);
  };
  const add = (list: FileList | null) => {
    if (!list) return;
    photos = photos.concat([...list].filter(f => f.type.startsWith('image/'))).slice(0, 12);
    showThumbs();
  };
  fileInput.onchange = () => { add(fileInput.files); fileInput.value = ''; };
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); add(e.dataTransfer?.files ?? null); };

  // — песня: свой файл или найденный фрагмент
  let audioFile: File | null = null;
  let hit: ItunesHit | null = null;
  let previewAudio: HTMLAudioElement | null = null;
  const chosen = form.querySelector<HTMLSpanElement>('.song-chosen')!;
  const hitsUl = form.querySelector<HTMLUListElement>('.hits')!;
  const audioInput = form.querySelector<HTMLInputElement>('input[name=audio]')!;
  const showChosen = () => {
    chosen.textContent = audioFile ? `♪ файл: ${audioFile.name}` : hit ? `♪ ${hit.artistName} — ${hit.trackName}` : '';
  };
  audioInput.onchange = () => {
    audioFile = audioInput.files?.[0] ?? null;
    if (audioFile) { hit = null; hitsUl.innerHTML = ''; }
    showChosen();
  };
  form.querySelector<HTMLButtonElement>('.find')!.onclick = async () => {
    const q = `${(form.elements.namedItem('artist') as HTMLInputElement).value} ${(form.elements.namedItem('title') as HTMLInputElement).value}`.trim();
    if (!q) { chosen.textContent = 'Введите исполнителя или название'; return; }
    hitsUl.innerHTML = '<li class="muted">Ищу…</li>';
    try {
      const res = await searchItunes(q, 5);
      hitsUl.innerHTML = '';
      if (!res.length) { hitsUl.innerHTML = '<li class="muted">Ничего не нашлось. Можно оставить название, тогда музыка не повлияет на форму.</li>'; return; }
      for (const h of res) {
        const li = el('li', { class: 'hit' });
        li.innerHTML = `${h.artworkUrl100 ? `<img src="${h.artworkUrl100}" alt="">` : ''}<span><b>${esc(h.trackName)}</b><br>${esc(h.artistName)}${h.releaseDate ? ` · ${h.releaseDate.slice(0, 4)}` : ''}${h.primaryGenreName ? ` · ${esc(h.primaryGenreName)}` : ''}</span>`;
        const play = el('button', { type: 'button', class: 'ghost small', 'aria-label': 'Послушать фрагмент' }, '▶');
        if (!h.previewUrl) play.setAttribute('disabled', '');
        play.onclick = () => {
          if (previewAudio && previewAudio.src === h.previewUrl && !previewAudio.paused) { previewAudio.pause(); return; }
          previewAudio?.pause();
          previewAudio = new Audio(h.previewUrl);
          previewAudio.play();
        };
        const pick = el('button', { type: 'button', class: 'ghost small' }, 'Выбрать');
        pick.onclick = () => {
          hit = h; audioFile = null; audioInput.value = '';
          hitsUl.querySelectorAll('.hit').forEach(x => x.classList.remove('on'));
          li.classList.add('on');
          showChosen();
        };
        li.append(play, pick);
        hitsUl.append(li);
      }
    } catch {
      hitsUl.innerHTML = '<li class="muted">Нет сети. Песня сохранится по названию, а музыка не повлияет на форму.</li>';
    }
  };

  const prog = form.querySelector<HTMLOListElement>('.progress')!;
  const err = form.querySelector<HTMLParagraphElement>('.err')!;
  form.onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(form);
    const text = String(fd.get('text') ?? '').trim();
    if (!text && !photos.length) { err.textContent = 'Напишите пару слов о дне или добавьте фото.'; return; }
    err.textContent = '';
    const btn = form.querySelector<HTMLButtonElement>('button.primary')!;
    btn.disabled = true;
    prog.innerHTML = '';
    const artist = String(fd.get('artist') ?? '').trim(), title = String(fd.get('title') ?? '').trim(), link = String(fd.get('link') ?? '').trim();
    previewAudio?.pause();
    const song: SongInput | null = artist || title || link || audioFile || hit ? { artist, title, link: link || undefined, file: audioFile ?? undefined, hit: hit ?? undefined } : null;
    try {
      const entry = await createDay({ date: String(fd.get('date')), text, photos, song }, step => {
        prog.querySelectorAll('li').forEach(li => li.classList.add('done'));
        prog.append(el('li', {}, step));
      });
      location.hash = `#/day/${encodeURIComponent(entry.id)}`;
    } catch (ex) {
      console.error(ex);
      err.textContent = 'Не получилось: ' + (ex instanceof Error ? ex.message : String(ex));
      btn.disabled = false;
    }
  };
}
