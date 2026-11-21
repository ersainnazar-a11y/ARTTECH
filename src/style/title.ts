// Название дня без LLM: конкретная деталь + время/место, 3–7 слов, без пафоса.
// Шаблоны перебираются по порядку; берётся первый уникальный для архива.

import type { Decision, Mood, Season, TimeOfDay, Weather } from '../types';
import { normalize, tokenize } from '../analysis/text-rules';

type G = 'm' | 'f' | 'n' | 'pl';
interface Noun { p: string[]; nom: string; g: G; prep?: string; noAdj?: boolean; person?: boolean }
interface Adj { m: string; f: string; n: string; pl: string }

const PLACES: Noun[] = [
  { p: ['парк*'], nom: 'парк', g: 'm', prep: 'в парке' },
  { p: ['офис*'], nom: 'офис', g: 'm', prep: 'в офисе' },
  { p: ['кухн*'], nom: 'кухня', g: 'f', prep: 'на кухне' },
  { p: ['метро'], nom: 'метро', g: 'n', prep: 'в метро' },
  { p: ['море', 'моря', 'морем', 'морю', 'морск*'], nom: 'море', g: 'n', prep: 'у моря' },
  { p: ['дач*'], nom: 'дача', g: 'f', prep: 'на даче' },
  { p: ['кафе', 'кофейн*'], nom: 'кафе', g: 'n', prep: 'в кафе' },
  { p: ['набережн*'], nom: 'набережная', g: 'f', prep: 'на набережной' },
  { p: ['лес', 'лесу', 'леса', 'лесом', 'лесн*'], nom: 'лес', g: 'm', prep: 'в лесу' },
  { p: ['библиотек*'], nom: 'библиотека', g: 'f', prep: 'в библиотеке' },
  { p: ['универ*', 'университет*'], nom: 'университет', g: 'm', prep: 'в университете' },
  { p: ['школ*'], nom: 'школа', g: 'f', prep: 'в школе' },
  { p: ['вокзал*'], nom: 'вокзал', g: 'm', prep: 'на вокзале' },
  { p: ['поезд*', 'электричк*'], nom: 'поезд', g: 'm', prep: 'в поезде' },
  { p: ['каток', 'катк*'], nom: 'каток', g: 'm', prep: 'на катке' },
  { p: ['концерт*'], nom: 'концерт', g: 'm', prep: 'на концерте' },
  { p: ['балкон*'], nom: 'балкон', g: 'm', prep: 'на балконе' },
  { p: ['двор', 'двора', 'дворе', 'двору'], nom: 'двор', g: 'm', prep: 'во дворе' },
  { p: ['гор', 'горы', 'горах', 'горам'], nom: 'горы', g: 'pl', prep: 'в горах' },
  { p: ['река', 'реки', 'реке', 'реку', 'речк*'], nom: 'река', g: 'f', prep: 'у реки' },
  { p: ['бабушк*', 'бабул*'], nom: 'бабушка', g: 'f', prep: 'у бабушки', noAdj: true },
  { p: ['город*', 'улиц*'], nom: 'город', g: 'm', prep: 'в городе' },
  { p: ['дом', 'дома', 'домой', 'квартир*'], nom: 'дом', g: 'm', prep: 'дома' },
];

const DETAILS: Noun[] = [
  { p: ['какао'], nom: 'какао', g: 'n' },
  { p: ['кофе'], nom: 'кофе', g: 'm' },
  { p: ['чай', 'чая', 'чаю', 'чаем'], nom: 'чай', g: 'm' },
  { p: ['глинтвейн*'], nom: 'глинтвейн', g: 'm' },
  { p: ['плед*'], nom: 'плед', g: 'm' },
  { p: ['книг*', 'книж*'], nom: 'книга', g: 'f' },
  { p: ['свеч*', 'свечк*'], nom: 'свечи', g: 'pl' },
  { p: ['гирлянд*'], nom: 'гирлянды', g: 'pl' },
  { p: ['мандарин*'], nom: 'мандарины', g: 'pl' },
  { p: ['пирог*'], nom: 'пирог', g: 'm' },
  { p: ['торт*'], nom: 'торт', g: 'm' },
  { p: ['лист*'], nom: 'листья', g: 'pl' },
  { p: ['друз*', 'подруг*'], nom: 'друзья', g: 'pl', person: true },
  { p: ['мама', 'мамой', 'маме', 'маму', 'мамы'], nom: 'мама', g: 'f', person: true },
  { p: ['кот', 'кота', 'котом', 'коту', 'кошк*'], nom: 'кот', g: 'm', person: true },
  { p: ['собак*', 'пес', 'пса'], nom: 'собака', g: 'f', person: true },
  { p: ['гитар*'], nom: 'гитара', g: 'f' },
  { p: ['фильм*', 'кино'], nom: 'кино', g: 'n' },
  { p: ['письм*'], nom: 'письмо', g: 'n' },
  { p: ['фотограф*', 'фотоальбом*', 'фотк*'], nom: 'старые фото', g: 'pl' },
  { p: ['велосипед*'], nom: 'велосипед', g: 'm' },
  { p: ['костер', 'костра', 'костром'], nom: 'костёр', g: 'm' },
  { p: ['звезд*'], nom: 'звёзды', g: 'pl' },
  { p: ['закат*'], nom: 'закат', g: 'm' },
  { p: ['разговор*'], nom: 'долгий разговор', g: 'm' },
  { p: ['музык*', 'песн*', 'пластинк*'], nom: 'музыка', g: 'f' },
  { p: ['снег*'], nom: 'снег', g: 'm' },
  { p: ['дожд*', 'ливн*', 'ливень'], nom: 'дождь', g: 'm' },
];

// хвосты-обстоятельства: «перед сдачей», «без будильника»
const CODAS: { p: string[]; needNeg?: boolean; text: string }[] = [
  { p: ['дедлайн*', 'сдач*', 'сдавал*', 'сдать'], text: 'перед сдачей' },
  { p: ['экзамен*'], text: 'перед экзаменом' },
  { p: ['будильник*'], needNeg: true, text: 'без будильника' },
  { p: ['день рожд*'], text: 'в день рождения' },
  { p: ['после работ*'], text: 'после работы' },
  { p: ['после пар'], text: 'после пар' },
];

const TIME_NOUN: Record<TimeOfDay, { nom: string; g: G }> = {
  утро: { nom: 'утро', g: 'n' }, день: { nom: 'день', g: 'm' }, вечер: { nom: 'вечер', g: 'm' }, ночь: { nom: 'ночь', g: 'f' },
};

const ADJ = (stem: string, m: string, f: string, n: string, pl: string): Adj => ({ m: stem + m, f: stem + f, n: stem + n, pl: stem + pl });
const SEASON_ADJ: Record<Season, Adj> = {
  осень: ADJ('осенн', 'ий', 'яя', 'ее', 'ие'), зима: ADJ('зимн', 'ий', 'яя', 'ее', 'ие'),
  весна: ADJ('весенн', 'ий', 'яя', 'ее', 'ие'), лето: ADJ('летн', 'ий', 'яя', 'ее', 'ие'),
};
const WEATHER_ADJ: Record<Weather, Adj> = {
  дождь: ADJ('дождлив', 'ый', 'ая', 'ое', 'ые'), снег: ADJ('снежн', 'ый', 'ая', 'ое', 'ые'),
  туман: ADJ('туманн', 'ый', 'ая', 'ое', 'ые'), солнце: ADJ('солнечн', 'ый', 'ая', 'ое', 'ые'),
  ветер: ADJ('ветрен', 'ый', 'ая', 'ое', 'ые'), гроза: ADJ('грозов', 'ой', 'ая', 'ое', 'ые'),
  пасмурно: ADJ('пасмурн', 'ый', 'ая', 'ое', 'ые'),
};
const QUIET = ADJ('тих', 'ий', 'ая', 'ое', 'ие');
const WARM = ADJ('тёпл', 'ый', 'ая', 'ое', 'ые');
const LOUD = ADJ('шумн', 'ый', 'ая', 'ое', 'ые');
const LONG = ADJ('долг', 'ий', 'ая', 'ое', 'ие');

const MONTH_PREP = ['в январе', 'в феврале', 'в марте', 'в апреле', 'в мае', 'в июне', 'в июле', 'в августе', 'в сентябре', 'в октябре', 'в ноябре', 'в декабре'];

function match(tokens: string[], i: number, p: string) {
  const parts = normalize(p).split(' ');
  return parts.every((q, k) => {
    const t = tokens[i + k];
    return t !== undefined && (q.endsWith('*') ? t.startsWith(q.slice(0, -1)) : t === q);
  });
}

function findNouns(tokens: string[], lex: Noun[]): { n: Noun; word: string }[] {
  const out: { n: Noun; word: string; at: number }[] = [];
  for (const n of lex) {
    for (let i = 0; i < tokens.length; i++) if (n.p.some(p => match(tokens, i, p))) { out.push({ n, word: tokens[i], at: i }); break; }
  }
  return out.sort((a, b) => a.at - b.at);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function makeTitle(text: string, m: Mood, dateISO: string, existing: string[]): { title: string; decisions: Decision[] } {
  const tokens = tokenize(text);
  const places = findNouns(tokens, PLACES);
  const details = findNouns(tokens, DETAILS).filter(d => !(m.weather && WEATHER_ADJ[m.weather] && (d.n.nom === 'дождь' || d.n.nom === 'снег')));
  let coda: string | null = null, codaWord = '';
  for (const c of CODAS) {
    for (let i = 0; i < tokens.length && !coda; i++) {
      if (!c.p.some(p => match(tokens, i, p))) continue;
      if (c.needNeg && !['без', 'не'].includes(tokens[i - 1]) && !tokens.slice(Math.max(0, i - 3), i).includes('без')) continue;
      coda = c.text; codaWord = tokens[i];
    }
    if (coda) break;
  }

  const time = TIME_NOUN[m.timeOfDay];
  // прилагательное: погода → сезон → тон дня
  const night = m.timeOfDay === 'ночь';
  let adj: Adj, adjWhy: string;
  if (m.weather && !(night && m.weather === 'солнце')) { adj = WEATHER_ADJ[m.weather]; adjWhy = `погода «${m.weather}»`; }
  else if (m.arousal > 0.66 && m.social > 0.5) { adj = LOUD; adjWhy = 'высокий arousal + люди'; }
  else if (m.arousal < 0.33) { adj = m.warmth > 0.62 ? WARM : QUIET; adjWhy = m.warmth > 0.62 ? 'покой + тепло' : 'покой'; }
  else if (m.intimacy > 0.6) { adj = LONG; adjWhy = 'близость'; }
  else { adj = SEASON_ADJ[m.season]; adjWhy = `сезон «${m.season}»`; }
  const seasonAdj = SEASON_ADJ[m.season];

  const things = details.filter(d => !d.n.person);
  const place = places[0]?.n, d1 = things[0]?.n ?? details[0]?.n, d2 = (things[1] ?? details.find(d => d.n !== (things[0]?.n ?? details[0]?.n)))?.n;
  const cands: { t: string; rule: string }[] = [];
  // обстоятельство («перед сдачей», «без будильника») — самая конкретная деталь дня, идёт первым
  if (place && coda) cands.push({ t: `${cap(time.nom)} ${place.prep} ${coda}`, rule: 'время + место + обстоятельство' });
  if (coda) cands.push({ t: `${cap(adj[time.g])} ${time.nom} ${coda}`, rule: 'тон + время + обстоятельство' });
  if (place && d1 && !d1.person && !place.noAdj && place.prep !== 'дома')
    cands.push({ t: `${cap((m.weather ? adj : seasonAdj)[place.g])} ${place.nom} и ${d1.nom}`, rule: 'прилагательное + место + деталь' });
  if (place) cands.push({ t: `${cap(adj[time.g])} ${time.nom} ${place.prep}`, rule: 'тон + время + место' });
  if (d1 && d2) cands.push({ t: `${cap(d1.nom)}, ${d2.nom} и ${time.nom}`, rule: 'две детали + время' });
  if (d1) cands.push({ t: `${cap(adj[time.g])} ${time.nom} и ${d1.nom}`, rule: 'тон + время + деталь' });
  if (place && d1) cands.push({ t: `${cap(d1.nom)} ${place.prep}`, rule: 'деталь + место' });
  cands.push({ t: `${cap(adj[time.g])} ${time.nom} ${MONTH_PREP[Number(dateISO.slice(5, 7)) - 1]}`, rule: 'тон + время + месяц' });

  const used = new Set(existing.map(s => normalize(s)));
  const okLen = (t: string) => { const n = t.split(/\s+/).length; return n >= 3 && n <= 7; };
  let chosen = cands.find(c => okLen(c.t) && !used.has(normalize(c.t)));
  if (!chosen) {
    const base = cands[cands.length - 1];
    const day = Number(dateISO.slice(8, 10));
    chosen = { t: `${base.t.split(' ').slice(0, 2).join(' ')} ${day}-го ${MONTH_PREP[Number(dateISO.slice(5, 7)) - 1].slice(2)}`, rule: base.rule + ' + число (уникальность)' };
  }

  const ev = [places[0] && `место «${places[0].word}»`, details[0] && `деталь «${details[0].word}»`, coda && `«${codaWord}»`, adjWhy].filter(Boolean).join(', ');
  return {
    title: chosen.t,
    decisions: [{ source: 'текст', evidence: ev, rule: `название: шаблон «${chosen.rule}», 3–7 слов, без повторов в архиве`, effect: `«${chosen.t}»` }],
  };
}
