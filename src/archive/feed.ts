// Лента: сетка карточек 4:5 (кроп постера) + дата и название.

import { allDays } from './db';
import { el, esc } from '../ui/dom';

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const humanDate = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

export async function renderFeed(root: HTMLElement) {
  const days = await allDays();
  const wrap = el('section', { class: 'feed' });
  wrap.innerHTML = `<h1>Архив</h1>`;
  if (!days.length) {
    wrap.append(el('p', { class: 'empty' }, 'Пока здесь пусто. Начните с ', el('a', { href: '#/new' }, 'первого дня'), '.'));
    root.append(wrap);
    return;
  }
  const grid = el('div', { class: 'grid' });
  for (const d of days) {
    const url = URL.createObjectURL(d.outputs.poster);
    const card = el('a', { class: 'card', href: `#/day/${encodeURIComponent(d.id)}` });
    card.innerHTML = `
      <div class="crop"><img src="${url}" alt="${esc(d.title)}" loading="lazy"></div>
      <div class="meta"><span class="d">${humanDate(d.date)}</span><span class="t">${esc(d.title)}</span></div>`;
    grid.append(card);
  }
  wrap.append(grid);
  root.append(wrap);
}
