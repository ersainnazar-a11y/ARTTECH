// Настройки: OpenAI-совместимый провайдер для анализа текста. Ключ хранится только в localStorage этого браузера.

import { loadLlmConfig, saveLlmConfig, testLlm, llmReady } from '../analysis/text-llm';
import { el, esc } from './dom';

const PRESETS: { name: string; baseUrl: string; model: string }[] = [
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
  { name: 'Ollama (локально)', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b' },
];

export function renderSettings(root: HTMLElement) {
  const c = loadLlmConfig();
  const f = el('form', { class: 'day-form settings' });
  f.innerHTML = `
    <h1>Настройки</h1>
    <p class="lead">Без ключа дневник работает полностью: текст разбирается словарём правил, офлайн. С моделью анализ точнее понимает контекст (иронию, «не», намёки), а название и подпись звучат живее. Каждый ответ модели проверяется валидатором, а если проверка не пройдена — включаются правила.</p>
    <label class="check"><input type="checkbox" name="enabled" ${c.enabled ? 'checked' : ''}> Использовать модель для анализа текста</label>
    <div class="presets">${PRESETS.map((p, i) => `<button type="button" class="ghost small" data-p="${i}">${esc(p.name)}</button>`).join('')}</div>
    <label class="field"><span>Endpoint (OpenAI-совместимый)</span><input name="baseUrl" value="${esc(c.baseUrl)}" spellcheck="false"></label>
    <label class="field"><span>Модель</span><input name="model" value="${esc(c.model)}" spellcheck="false"></label>
    <label class="field"><span>Ключ API</span><input name="apiKey" type="password" value="${esc(c.apiKey)}" autocomplete="off" spellcheck="false"></label>
    <p class="hint">Ключ хранится только в этом браузере (localStorage) и никуда, кроме выбранного провайдера, не отправляется. Текст дня уходит этому провайдеру. Для Ollama задайте <code>OLLAMA_ORIGINS</code>, чтобы браузер мог к нему обращаться.</p>
    <div class="row"><button type="submit" class="primary">Сохранить</button><button type="button" class="ghost test">Проверить связь</button><span class="status" aria-live="polite"></span></div>`;
  root.append(f);
  const status = f.querySelector<HTMLSpanElement>('.status')!;
  const read = () => {
    const fd = new FormData(f);
    return { enabled: fd.get('enabled') === 'on', baseUrl: String(fd.get('baseUrl')).trim(), model: String(fd.get('model')).trim(), apiKey: String(fd.get('apiKey')).trim() };
  };
  f.querySelectorAll<HTMLButtonElement>('[data-p]').forEach(b => (b.onclick = () => {
    const p = PRESETS[Number(b.dataset.p)];
    (f.elements.namedItem('baseUrl') as HTMLInputElement).value = p.baseUrl;
    (f.elements.namedItem('model') as HTMLInputElement).value = p.model;
  }));
  f.onsubmit = e => {
    e.preventDefault();
    const v = read();
    saveLlmConfig(v);
    status.textContent = llmReady(v) ? 'Сохранено: анализ — модель' : 'Сохранено: анализ — правила (офлайн)';
  };
  f.querySelector<HTMLButtonElement>('.test')!.onclick = async () => {
    status.textContent = 'Проверяю…';
    try { status.textContent = await testLlm({ ...read(), enabled: true }); }
    catch (err) { status.textContent = 'Ошибка: ' + (err instanceof Error ? err.message : String(err)).slice(0, 140); }
  };
}
