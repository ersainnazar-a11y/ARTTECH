// «Рентген дня»: поверх воспоминания показывает цепочки «слово / цвет / бит → правило → эффект»,
// привязанные к месту кадра, где эффект виден. Во время проигрывания метка ритма живёт на каждой доле.

import type { DayEntry, Decision, ModeId } from '../types';
import { sceneLayout } from '../render/scene';
import { dateLine, pageLabel } from '../style/typography';
import { el, esc } from '../ui/dom';

interface Callout { x: number; y: number; d: Decision; tag: string; live?: boolean }

const find = (ds: Decision[], re: RegExp, src?: Decision['source']) => ds.find(d => re.test(d.rule) && (!src || d.source === src));
const short = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

const MODE_RULE: Record<ModeId, RegExp> = {
  impressionism: /Кувахара/,
  film: /семейного архива/,
  minimal: /пустота = тишина/,
  geometry: /SDF-круги|Кандинск|ритм и форма/,
  collage: /наклеиваются|теснота/,
};

export async function buildXray(d: DayEntry, stage: HTMLElement): Promise<{ el: HTMLElement; onBeat: (t: number, beat: number) => void }> {
  const L = await sceneLayout({
    photos: d.photos, heroIndex: d.heroIndex, style: d.style,
    date: dateLine(d.date, d.mood.timeOfDay), page: pageLabel(d.page), title: d.title, caption: d.caption, seed: d.seed,
  });
  const fx = (px: number) => (px / L.W) * 100, fy = (px: number) => (px / L.H) * 100;
  const r = L.rect;
  const ds = d.decisions;
  const c: Callout[] = [];
  const add = (x: number, y: number, dec: Decision | undefined, tag: string, live = false) => dec && c.push({ x, y, d: dec, tag, live });

  add(7, fy(L.headerBottom - 40), find(ds, /время суток|пишется вечером|без указания времени/), 'время');
  add(fx(r.cx - r.hw) + 4, fy(r.cy - r.hh) + 3, find(ds, /^k-means|базовая палитра/), 'цвет');
  add(fx(r.cx) - 6, fy(r.cy) - 6, find(ds, /библиотека мотивов/), 'мотив');
  add(fx(r.cx) + 4, fy(r.cy) + 7, find(ds, MODE_RULE[d.style.primaryMode]) ?? find(ds, /Кувахара/), 'режим');
  add(fx(r.cx + r.hw) - 6, fy(r.cy + r.hh) - 4, find(ds, /склейки на реальных битах|темп задаёт возбуждение/), 'ритм', true);
  add(fx(r.cx + r.hw) - 4, fy(r.cy - r.hh) + 14, ds.find(x => x.source === 'музыка' && /мажор|минор/.test(x.rule)), 'музыка');
  // подпись и название: метки справа, текст не закрывают (сдвигаются вверх, в воздух над текстом)
  add(92, fy(L.textTop + 40), find(ds, /^подпись/), 'подпись');
  add(92, fy(L.textTop + 150), find(ds, /^название/), 'название');
  add(7, 95.5, find(ds, /режимы — непрерывные/), 'режимы');
  add(88, fy(L.headerBottom) + 6, find(ds, /одна бумага/), 'константа');

  const box = el('div', { class: 'xray', 'aria-label': 'Рентген дня: цепочки решений' });
  box.innerHTML = `<div class="xray-scrim"></div>` + c.map((o, i) => {
    const right = o.x > 55;
    return `<div class="xc ${right ? 'r' : ''} ${o.live ? 'live' : ''}" style="left:${o.x.toFixed(1)}%;top:${o.y.toFixed(1)}%" tabindex="0">
      <i class="dot"></i>
      <div class="chip" title="${esc(o.d.rule)}">
        <b>${i + 1} · ${o.tag}</b>
        <span class="ev">${esc(short(o.d.evidence, 46))}</span>
        <span class="rule">${esc(short(o.d.rule, 74))}</span>
        <span class="fx">→ ${esc(short(o.d.effect, 60))}</span>
      </div></div>`;
  }).join('');
  stage.append(box);
  requestAnimationFrame(() => requestAnimationFrame(() => declutter(box)));

  // живая метка ритма: номер доли, склейка, текущее фото
  const live = box.querySelector<HTMLElement>('.xc.live');
  const liveFx = live?.querySelector<HTMLElement>('.fx');
  const M = d.style.motion;
  const onBeat = (t: number, beat: number) => {
    if (!live || !liveFx || !M) return;
    const cut = beat % M.beatsPerCut === 0;
    liveFx.textContent = `→ ${t.toFixed(1)} с · доля ${beat + 1}${cut ? ' · СКЛЕЙКА' : ''} · ${Math.round(M.bpm)} BPM`;
    live.classList.remove('beat'); void live.offsetWidth; live.classList.add('beat');
  };
  return { el: box, onBeat };
}

/** раскладка меток без наложений: верхняя половина сдвигается вниз, нижняя — вверх (к центру кадра) */
export function declutter(box: HTMLElement) {
  const chips = [...box.querySelectorAll<HTMLElement>('.xc .chip')];
  chips.forEach(c => (c.style.top = ''));
  const H = box.getBoundingClientRect().height;
  const placed: DOMRect[] = [];
  const hit = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom + 4 && b.top < a.bottom + 4;
  const items = chips.map(c => ({ c, r: c.getBoundingClientRect() }));
  const top = items.filter(i => i.r.top - box.getBoundingClientRect().top < H * 0.62).sort((a, b) => a.r.top - b.r.top);
  const bottom = items.filter(i => !top.includes(i)).sort((a, b) => b.r.top - a.r.top);
  for (const [list, dir] of [[top, 1], [bottom, -1]] as const) {
    for (const { c } of list) {
      let r = c.getBoundingClientRect(), shift = 0;
      for (let guard = 0; guard < 30 && placed.some(p => hit(r, p)); guard++) {
        const p = placed.find(q => hit(r, q))!;
        const d = dir > 0 ? p.bottom + 4 - r.top : p.top - 4 - r.bottom;
        shift += d;
        c.style.top = `${-6 + shift}px`;
        r = c.getBoundingClientRect();
      }
      placed.push(r);
    }
  }
}

/** слова-доказательства из решений («…») — подсвечиваются в тексте записи */
export function evidenceWords(d: DayEntry): string[] {
  const out = new Set<string>();
  for (const x of d.decisions) if (x.source === 'текст') for (const m of x.evidence.matchAll(/«([^»]{2,40})»/g)) out.add(m[1].replace(/^не /, ''));
  return [...out].filter(w => w.length > 2 && d.text.toLowerCase().replace(/ё/g, 'е').includes(w.toLowerCase().replace(/ё/g, 'е')));
}

export function highlightText(text: string, words: string[]): string {
  let html = esc(text);
  const sorted = [...words].sort((a, b) => b.length - a.length);
  for (const w of sorted) {
    const re = new RegExp(`(${esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[её]/g, '[её]')})`, 'gi');
    html = html.replace(re, '<mark>$1</mark>');
  }
  return html.replace(/\n/g, '<br>');
}
