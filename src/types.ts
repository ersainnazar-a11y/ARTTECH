export type RGB = [number, number, number]; // 0..1
export type TimeOfDay = 'утро' | 'день' | 'вечер' | 'ночь';
export type Season = 'зима' | 'весна' | 'лето' | 'осень';
export type Weather = 'дождь' | 'снег' | 'туман' | 'солнце' | 'ветер' | 'гроза' | 'пасмурно';

export type MotifId =
  | 'leaves' | 'rain' | 'snow' | 'fog' | 'bokeh' | 'candle' | 'stars' | 'sunflare'
  | 'steam' | 'waves' | 'wind' | 'confetti' | 'dust' | 'leafShadow' | 'neon';

export type ModeId = 'impressionism' | 'geometry' | 'film' | 'minimal' | 'collage';

export interface Song {
  source: 'file' | 'preview' | 'link';
  title: string;
  artist: string;
  year?: number;
  genre?: string;
  blob?: Blob;
  previewUrl?: string;
  link?: string;
  features?: {
    bpm: number; beats: number[]; key: string; scale: 'major' | 'minor';
    energy: number; brightness: number; danceability: number;
  };
  featuresFrom: 'audio' | 'description' | 'none';
}

export interface Sensory { light: string[]; sounds: string[]; smells: string[]; textures: string[] }

export interface Mood {
  valence: number; arousal: number; warmth: number; nostalgia: number; social: number; intimacy: number;
  timeOfDay: TimeOfDay; season: Season; weather?: Weather;
  sensory: Sensory; motifs: MotifId[];
  confidence: { text: number; photo: number; music: number };
}

export interface Decision {
  source: 'текст' | 'фото' | 'музыка';
  evidence: string;
  rule: string;
  effect: string;
  /** ключевое решение для блока «Почему день выглядит так» */
  key?: boolean;
}

export interface PhotoFeatures {
  palette: { lab: RGB; rgb: RGB; weight: number }[]; // sorted by weight
  brightness: number;   // 0..1 (mean L)
  saturation: number;   // 0..1 (mean chroma)
  contrast: number;     // 0..1 (std L)
  temperature: number;  // 0 cold .. 1 warm
  edgeDensity: number;  // 0 calm .. 1 noisy
  sharpness: number;    // 0..1
  aspect: number;       // w / h
  hash: number;
}

export interface ModeWeights { impressionism: number; geometry: number; film: number; minimal: number; collage: number }

export interface DayStyle {
  modes: ModeWeights;
  primaryMode: ModeId;
  secondaryMode: ModeId;
  palette: { swatches: RGB[]; shadow: RGB; highlight: RGB; accent: RGB; ink: RGB; paper: RGB };
  grade: {
    exposure: number; contrast: number; saturation: number;
    lift: RGB; gamma: RGB; gain: RGB;
    splitShadow: RGB; splitHighlight: RGB; splitBalance: number;
  };
  painterly: { radius: number; strength: number; sharpness: number };
  film: { grain: number; halation: number; vignette: number; leak: number; leakColor: RGB; leakAngle: number; warmShadows: number };
  paper: { intensity: number; tone: RGB };
  layout: { photoScale: number; centerY: number; rotation: number; feather: number; deckle: number; border: number; crop: number };
  type: { tracking: number; titleWeight: number; italic: boolean; inkSaturation: number; captionTilt: number; rule: boolean };
}

export interface DayEntry {
  id: string;
  date: string; // YYYY-MM-DD
  page: number;
  text: string;
  photos: Blob[];
  heroIndex: number;
  song: Song | null;
  mood: Mood;
  style: DayStyle;
  title: string;
  caption: string;
  decisions: Decision[];
  outputs: { poster: Blob; video?: Blob; voice?: Blob };
  seed: number;
  createdAt: number;
}
