// Голос дня (бонус): Web Speech API, русский голос. rate и pitch выбираются правилом из Mood
// (спокойный вечер ≈ 0.85/0.9, насыщенный день ≈ 1.15/1.05) и записываются в decisions.
// Синтез браузера нельзя записать в файл без захвата вкладки, поэтому голос звучит на странице дня,
// а voice.webm в папку дня не кладётся (спека: «если есть»).

import type { Decision, Mood } from '../types';
import { clamp, f2, lerp } from '../util/seed';

export interface VoiceStyle { rate: number; pitch: number }

export function voiceStyle(m: Mood): { voice: VoiceStyle; decision: Decision } {
  const late = m.timeOfDay === 'вечер' || m.timeOfDay === 'ночь';
  const drive = clamp(m.arousal * 0.8 + Math.max(0, m.valence) * 0.2);
  const rate = clamp(lerp(0.85, 1.15, drive) - (late ? 0.03 : 0), 0.8, 1.2);
  const pitch = clamp(lerp(0.9, 1.05, clamp(drive * 0.7 + (m.valence + 1) / 2 * 0.3)), 0.85, 1.1);
  return {
    voice: { rate, pitch },
    decision: {
      source: 'текст',
      evidence: `arousal ${f2(m.arousal)}, valence ${f2(m.valence)}, ${m.timeOfDay}`,
      rule: 'голос: спокойный вечер читается медленнее и ниже (0.85/0.9), насыщенный день — быстрее и выше (1.15/1.05)',
      effect: `скорость ${f2(rate)}, высота ${f2(pitch)}`,
    },
  };
}

export const ttsAvailable = () => typeof speechSynthesis !== 'undefined';

function ruVoice(): SpeechSynthesisVoice | null {
  const vs = speechSynthesis.getVoices();
  return vs.find(v => v.lang?.toLowerCase().startsWith('ru') && /natural|online/i.test(v.name)) ?? vs.find(v => v.lang?.toLowerCase().startsWith('ru')) ?? null;
}

/** читает название, подпись и запись; resolve — когда дочитал или остановлен */
export function speak(text: string, v: VoiceStyle): Promise<void> {
  if (!ttsAvailable()) return Promise.resolve();
  speechSynthesis.cancel();
  return new Promise(res => {
    const go = () => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ru-RU';
      const voice = ruVoice();
      if (voice) u.voice = voice;
      u.rate = v.rate;
      u.pitch = v.pitch;
      u.onend = u.onerror = () => res();
      speechSynthesis.speak(u);
    };
    if (speechSynthesis.getVoices().length) go();
    else { speechSynthesis.onvoiceschanged = () => { speechSynthesis.onvoiceschanged = null; go(); }; setTimeout(go, 800); }
  });
}

export const stopSpeaking = () => ttsAvailable() && speechSynthesis.cancel();
