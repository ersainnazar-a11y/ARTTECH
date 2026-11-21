// Mock OpenAI-совместимого сервера для проверки LLM-пути без ключа.
// - первый ответ на каждый текст НАРОЧНО невалиден (мотив не из библиотеки, штамп в названии) → проверяет повтор;
// - текст с «СЛОМАЙ» всегда невалиден → проверяет fallback на правила;
// - понимает иронию в тестовом тексте (правила видят «отлично», «обожаю» как позитив).
import http from 'node:http';

const seen = new Map();
const reply = (res, obj) => {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: typeof obj === 'string' ? obj : JSON.stringify(obj) } }] }));
};

function analyze(text) {
  const t = text.toLowerCase();
  if (t.includes('проспала')) {
    return {
      valence: -0.7, arousal: 0.75, warmth: 0.35, nostalgia: 0.05, social: 0.2, intimacy: 0.1,
      timeOfDay: 'утро', season: null, weather: 'дождь',
      motifs: [{ id: 'rain', word: 'дождь' }],
      evidence: [{ word: 'опоздала', axis: 'a', sign: 1 }, { word: 'разбился', axis: 'v', sign: -1 }, { word: 'отлично', axis: 'v', sign: -1 }, { word: 'Обожаю', axis: 'v', sign: -1 }],
      sensory: { light: [], sounds: [], smells: [], textures: ['мокрые'] },
      title: 'Утро с разбитым телефоном', caption: 'ну просто отлично, обожаю такие дни', confidence: 0.85,
    };
  }
  return {
    valence: 0.5, arousal: 0.3, warmth: 0.7, nostalgia: 0.4, social: 0.4, intimacy: 0.6,
    timeOfDay: 'вечер', season: 'осень', weather: null,
    motifs: [{ id: 'steam', word: 'чай' }],
    evidence: [{ word: 'чай', axis: 'w', sign: 1 }],
    sensory: { light: [], sounds: [], smells: [], textures: [] },
    title: 'Вечер с чаем у окна', caption: 'тихо и тепло', confidence: 0.6,
  };
}

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, authorization', 'Access-Control-Allow-Methods': 'POST' });
    return res.end();
  }
  let body = '';
  req.on('data', c => (body += c));
  req.on('end', () => {
    const j = JSON.parse(body || '{}');
    const msgs = j.messages ?? [];
    const sys = msgs[0]?.content ?? '';
    const user = msgs[1]?.content ?? '';
    console.log('[mock]', msgs.length, 'msgs |', user.slice(0, 40).replace(/\n/g, ' '));
    if (sys.includes('Оцени музыкальные признаки')) return reply(res, { bpm: 104, energy: 0.66, brightness: 0.6, danceability: 0.7, scale: 'major', year: 1986, genre: 'Synth-pop', confidence: 0.7 });
    if (!sys.includes('дневника')) return reply(res, { ok: true });
    if (user.includes('СЛОМАЙ')) return reply(res, 'это не json');
    const n = (seen.get(user) ?? 0) + 1;
    seen.set(user, n);
    if (msgs.length <= 2) {
      // первая попытка: нарушаем схему
      const bad = analyze(user);
      return reply(res, { ...bad, motifs: [{ id: 'ufo', word: 'НЛО' }], title: 'Незабываемый волшебный день' });
    }
    return reply(res, analyze(user));
  });
}).listen(5197, () => console.log('mock llm on 5197'));
