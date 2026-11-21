// Страница дня: постер, текст, фото, «Почему день выглядит так», полная цепочка решений.

import { deleteDay, getDay } from './db';
import { el, esc } from '../ui/dom';
import { humanDate } from './feed';
import { rgbHex } from '../analysis/photo';
import { MODE_NAMES } from '../style/modes';
import type { ModeId, Song } from '../types';
import { MemoryPlayer } from '../render/player';

export async function renderDay(root: HTMLElement, id: string) {
  const d = await getDay(id);
  if (!d) { root.append(el('p', { class: 'empty' }, 'Такого дня нет в архиве.')); return; }
  const posterUrl = URL.createObjectURL(d.outputs.poster);
  const keys = d.decisions.filter(x => x.key).slice(0, 5);
  const why = (keys.length >= 3 ? keys : d.decisions.slice(0, 5));
  const modes = (Object.entries(d.style.modes) as [ModeId, number][]).sort((a, b) => b[1] - a[1]);

  const page = el('article', { class: 'day' });
  page.innerHTML = `
    <div class="poster">
      <div class="stage"><img src="${posterUrl}" alt="Воспоминание: ${esc(d.title)}"></div>
      <div class="play-row">
        <button type="button" class="primary play">▶ Воспроизвести воспоминание</button>
        <span class="beat" aria-hidden="true"></span>
        <span class="pinfo">${d.style.motion ? `${d.style.motion.duration.toFixed(1)} с · ${Math.round(d.style.motion.bpm)} BPM · склейка каждые ${d.style.motion.beatsPerCut} долей` : ''}</span>
      </div>
    </div>
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
      ${d.song ? songLine(d.song) : ''}
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
    player?.destroy();
    await deleteDay(d.id);
    location.hash = '#/archive';
  };

  // — проигрывание воспоминания
  let player: MemoryPlayer | null = null;
  const stage = page.querySelector<HTMLDivElement>('.stage')!;
  const playBtn = page.querySelector<HTMLButtonElement>('.play')!;
  const beatEl = page.querySelector<HTMLSpanElement>('.beat')!;
  let playing = false;
  playBtn.onclick = async () => {
    if (!d.style.motion) return;
    if (playing) { player?.stop(); playing = false; playBtn.textContent = '▶ Воспроизвести воспоминание'; return; }
    if (!player) {
      playBtn.disabled = true;
      playBtn.textContent = 'Готовлю кадры…';
      player = new MemoryPlayer(d);
      await player.load();
      player.canvas.className = 'memory';
      stage.replaceChildren(player.canvas);
      let lastBeat = -1;
      player.onTick = (_t, b) => { if (b !== lastBeat) { lastBeat = b; beatEl.classList.remove('hit'); void beatEl.offsetWidth; beatEl.classList.add('hit'); } };
      player.onEnd = () => { playing = false; playBtn.textContent = '↺ Ещё раз'; };
      playBtn.disabled = false;
    }
    playing = true;
    playBtn.textContent = '■ Стоп';
    await player.play();
  };
  const cleanup = () => { player?.destroy(); window.removeEventListener('hashchange', cleanup); };
  window.addEventListener('hashchange', cleanup);
  root.append(page);
}

function songLine(s: Song) {
  const name = esc([s.artist, s.title].filter(Boolean).join(' — '));
  const f = s.features;
  const how = s.featuresFrom === 'audio' ? (s.source === 'file' ? 'анализ своего файла' : 'анализ официального фрагмента') : s.featuresFrom === 'description' ? 'оценка по описанию (жанр), не по звуку' : 'не анализировалась';
  const feat = f ? ` · ${Math.round(f.bpm)} BPM${f.key !== '—' ? ` · ${f.key} ${f.scale === 'minor' ? 'минор' : 'мажор'}` : ''} · энергия ${f.energy.toFixed(2)}` : '';
  return `<p class="song-line">♪ ${name}${s.year ? ` (${s.year})` : ''}${feat}<br><span class="muted">${how}</span>${s.link ? ` · <a href="${esc(s.link)}" target="_blank" rel="noopener">ссылка</a>` : ''}</p>`;
}
