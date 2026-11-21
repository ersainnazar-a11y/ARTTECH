// Страница дня: постер, текст, фото, «Почему день выглядит так», полная цепочка решений.

import { deleteDay, getDay } from './db';
import { el, esc } from '../ui/dom';
import { humanDate } from './feed';
import { rgbHex } from '../analysis/photo';
import { MODE_NAMES } from '../style/modes';
import type { ModeId } from '../types';

export async function renderDay(root: HTMLElement, id: string) {
  const d = await getDay(id);
  if (!d) { root.append(el('p', { class: 'empty' }, 'Такого дня нет в архиве.')); return; }
  const posterUrl = URL.createObjectURL(d.outputs.poster);
  const keys = d.decisions.filter(x => x.key).slice(0, 5);
  const why = (keys.length >= 3 ? keys : d.decisions.slice(0, 5));
  const modes = (Object.entries(d.style.modes) as [ModeId, number][]).sort((a, b) => b[1] - a[1]);

  const page = el('article', { class: 'day' });
  page.innerHTML = `
    <div class="poster"><img src="${posterUrl}" alt="Воспоминание: ${esc(d.title)}"></div>
    <div class="side">
      <p class="date">${humanDate(d.date)} · ${d.mood.timeOfDay}</p>
      <h1>${esc(d.title)}</h1>
      ${d.caption ? `<p class="caption">${esc(d.caption)}</p>` : ''}
      <div class="modes">${modes.map(([m, v]) => `<div class="mode"><span>${MODE_NAMES[m]}</span><i style="width:${Math.round(v * 100)}%"></i><b>${Math.round(v * 100)}</b></div>`).join('')}</div>
      <div class="swatches">${d.style.palette.swatches.map(c => `<span style="background:${rgbHex(c)}" title="${rgbHex(c)}"></span>`).join('')}</div>
      <h2>Почему день выглядит так</h2>
      <ul class="why">${why.map(x => `<li><span class="src">${x.source}</span> ${esc(x.evidence)} → <em>${esc(x.effect)}</em></li>`).join('')}</ul>
      <h2>Запись</h2>
      <p class="text">${esc(d.text).replace(/\n/g, '<br>') || '<span class="muted">без слов</span>'}</p>
      ${d.song ? `<p class="song">♪ ${esc([d.song.artist, d.song.title].filter(Boolean).join(' — '))}${d.song.link ? ` · <a href="${esc(d.song.link)}" target="_blank" rel="noopener">ссылка</a>` : ''}</p>` : ''}
      <div class="photos"></div>
      <details class="chain"><summary>Все решения (${d.decisions.length})</summary>
        <table><thead><tr><th>Источник</th><th>Вход</th><th>Правило</th><th>Результат</th></tr></thead>
        <tbody>${d.decisions.map(x => `<tr><td>${x.source}</td><td>${esc(x.evidence)}</td><td>${esc(x.rule)}</td><td>${esc(x.effect)}</td></tr>`).join('')}</tbody></table>
      </details>
      <div class="actions">
        <a class="btn" download="poster-${d.date}.png" href="${posterUrl}">Скачать постер</a>
        <button class="btn danger" type="button">Удалить день</button>
      </div>
    </div>`;
  const ph = page.querySelector('.photos')!;
  d.photos.forEach((p, i) => ph.append(el('img', { src: URL.createObjectURL(p), alt: '', class: i === d.heroIndex ? 'hero' : '' })));
  page.querySelector<HTMLButtonElement>('.danger')!.onclick = async () => {
    if (!confirm(`Удалить «${d.title}» из дневника?`)) return;
    await deleteDay(d.id);
    location.hash = '#/archive';
  };
  root.append(page);
}
