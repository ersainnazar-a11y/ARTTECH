// Форма дня: дата, текст, фото (перетаскивание или выбор), песня.

import { createDay } from '../day';
import type { Song } from '../types';
import { el } from '../ui/dom';

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
      <input name="link" placeholder="Ссылка (необязательно)">
    </fieldset>
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
    const song: Song | null = artist || title || link ? { source: 'link', artist, title, link: link || undefined, featuresFrom: 'none' } : null;
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
