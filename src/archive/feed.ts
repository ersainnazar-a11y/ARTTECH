// Лента: сетка карточек 4:5 (кроп постера) + дата и название; поиск по названию и тексту, фильтр по месяцу;
// режим «Проверка лентой» — 5–7 дней в ряд целиком на одном экране: видно, что дни разные, но это один дневник.

import { allDays } from './db';
import { el, esc } from '../ui/dom';
import { normalize } from '../analysis/text-rules';
import { MODE_NAMES } from '../style/modes';
import { MOTIFS } from '../style/motifs';
import type { DayEntry, ModeId } from '../types';

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_NOM = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
export const humanDate = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

const VIEW_KEY = 'diary.feedView';
const getView = (): 'grid' | 'strip' => { try { return localStorage.getItem(VIEW_KEY) === 'strip' ? 'strip' : 'grid'; } catch { return 'grid'; } };
const setView = (v: string) => { try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ } };

const urls = new Map<string, string>();
const posterUrl = (d: DayEntry) => { let u = urls.get(d.id); if (!u) { u = URL.createObjectURL(d.outputs.poster); urls.set(d.id, u); } return u; };

function modesLine(d: DayEntry) {
  const m = (Object.entries(d.style.modes) as [ModeId, number][]).sort((a, b) => b[1] - a[1]).slice(0, 2);
  const motif = d.style.motifs?.[0] ? ` · ${MOTIFS[d.style.motifs[0].id].name}` : '';
  return m.map(([id, v]) => `${MODE_NAMES[id]} ${Math.round(v * 100)}`).join(' · ') + motif;
}

export async function renderFeed(root: HTMLElement) {
  const days = await allDays();
  const wrap = el('section', { class: 'feed' });
  if (!days.length) {
    wrap.innerHTML = '<h1>Архив</h1>';
    wrap.append(el('p', { class: 'empty' }, 'Пока здесь пусто. Начните с ', el('a', { href: '#/new' }, 'первого дня'), '.'));
    root.append(wrap);
    return;
  }
  const months = [...new Set(days.map(d => d.date.slice(0, 7)))].sort().reverse();
  wrap.innerHTML = `
    <div class="feed-head">
      <h1>Архив <span class="count">${days.length}</span></h1>
      <div class="tools">
        <input type="search" class="q" placeholder="Поиск по названию и тексту" aria-label="Поиск">
        <select class="month" aria-label="Месяц"><option value="">Все месяцы</option>${months.map(m => `<option value="${m}">${MONTHS_NOM[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}</option>`).join('')}</select>
        <div class="seg" role="tablist">
          <button type="button" data-v="grid" role="tab">Лента</button>
          <button type="button" data-v="strip" role="tab">Проверка лентой</button>
        </div>
      </div>
    </div>
    <p class="strip-note muted" hidden>5–7 дней подряд целиком. Константы дневника (бумага, дата слева сверху, название внизу, сетка) одинаковые; режимы, палитра и мотивы у каждого дня свои.</p>
    <div class="list"></div>`;
  root.append(wrap);

  const q = wrap.querySelector<HTMLInputElement>('.q')!;
  const month = wrap.querySelector<HTMLSelectElement>('.month')!;
  const list = wrap.querySelector<HTMLDivElement>('.list')!;
  const note = wrap.querySelector<HTMLParagraphElement>('.strip-note')!;
  let view = getView();

  const draw = () => {
    const needle = normalize(q.value.trim());
    const shown = days.filter(d => (!month.value || d.date.startsWith(month.value)) && (!needle || normalize(`${d.title} ${d.caption} ${d.text}`).includes(needle)));
    wrap.querySelectorAll<HTMLButtonElement>('.seg button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.v === view)));
    note.hidden = view !== 'strip';
    list.className = view === 'strip' ? 'list strip' : 'list grid';
    list.innerHTML = '';
    if (!shown.length) { list.append(el('p', { class: 'empty' }, 'Ничего не нашлось.')); return; }
    // в «Проверке лентой» — до 7 дней в хронологическом порядке, как страницы дневника
    const items = view === 'strip' ? shown.slice(0, 7).reverse() : shown;
    for (const d of items) {
      const card = el('a', { class: 'card', href: `#/day/${encodeURIComponent(d.id)}` });
      card.innerHTML = view === 'strip'
        ? `<div class="full"><img src="${posterUrl(d)}" alt="${esc(d.title)}"></div><div class="meta"><span class="d">${humanDate(d.date)}</span><span class="t">${esc(d.title)}</span><span class="m">${esc(modesLine(d))}</span></div>`
        : `<div class="crop"><img src="${posterUrl(d)}" alt="${esc(d.title)}" loading="lazy"></div><div class="meta"><span class="d">${humanDate(d.date)}</span><span class="t">${esc(d.title)}</span><span class="m">${esc(modesLine(d))}</span></div>`;
      list.append(card);
    }
    if (view === 'strip' && shown.length < 5) list.append(el('p', { class: 'muted strip-few' }, `Для проверки лентой нужно 5–7 дней — сейчас ${shown.length}.`));
  };
  q.oninput = draw;
  month.onchange = draw;
  wrap.querySelectorAll<HTMLButtonElement>('.seg button').forEach(b => (b.onclick = () => { view = b.dataset.v as 'grid' | 'strip'; setView(view); draw(); }));
  draw();
}
