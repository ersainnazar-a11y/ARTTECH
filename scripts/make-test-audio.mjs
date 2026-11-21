// Синтетические тестовые треки с ИЗВЕСТНЫМИ параметрами — чтобы проверить аудиоанализ.
// upbeat: 128 BPM, до мажор (C–G–Am–F), бочка на каждую долю, хэт на восьмые.
// slow:   70 BPM, ля минор (Am–F–C–E), мягкая бочка на 1 и 3, пэды.
import { mkdir, writeFile } from 'node:fs/promises';

const SR = 44100;
const midi = n => 440 * 2 ** ((n - 69) / 12);

function render({ bpm, dur, chords, kickEvery, hat, pad }) {
  const N = Math.round(dur * SR);
  const out = new Float32Array(N);
  const beat = 60 / bpm;
  let seed = 1;
  const noise = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const b = t / beat;
    const bar = Math.floor(b / 4);
    const chord = chords[bar % chords.length];
    // гармония
    let s = 0;
    for (const n of chord) {
      const f = midi(n);
      s += (pad ? Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t) : Math.sign(Math.sin(2 * Math.PI * f * t)) * 0.35 + 0.5 * Math.sin(2 * Math.PI * f * t));
    }
    const bassF = midi(chord[0] - 12);
    s = s * 0.06 + Math.sin(2 * Math.PI * bassF * t) * 0.12;
    // бочка
    const bp = b % kickEvery;
    const kt = bp * beat;
    if (kt < 0.25) s += Math.sin(2 * Math.PI * (50 + 120 * Math.exp(-kt * 30)) * kt) * Math.exp(-kt * 14) * 0.7;
    // хэт
    if (hat) {
      const ht = (b % 0.5) * beat;
      if (ht < 0.05) s += noise() * Math.exp(-ht * 90) * 0.18;
    }
    out[i] = Math.max(-1, Math.min(1, s));
  }
  return out;
}

function wav(samples) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.round(samples[i] * 32767), 44 + i * 2);
  return buf;
}

await mkdir('shots/audio', { recursive: true });
await writeFile('shots/audio/upbeat-128-Cmaj.wav', wav(render({ bpm: 128, dur: 40, kickEvery: 1, hat: true, pad: false, chords: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]] })));
await writeFile('shots/audio/slow-70-Amin.wav', wav(render({ bpm: 70, dur: 45, kickEvery: 2, hat: false, pad: true, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [52, 56, 59]] })));
console.log('ok');
