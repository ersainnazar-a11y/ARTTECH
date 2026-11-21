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
  /** кэш официального фрагмента для проигрывания офлайн; в папку дня не экспортируется */
  previewBlob?: Blob;
  artwork?: string;
  link?: string;
  duration?: number;
  features?: {
    bpm: number; beats: number[]; key: string; scale: 'major' | 'minor';
    energy: number; brightness: number; danceability: number;
    keyStrength?: number; loudnessDb?: number; centroidHz?: number;
  };
  featuresFrom: 'audio' | 'description' | 'none';
  /** кто оценил признаки «по описанию»: модель или таблица жанров */
  describedBy?: 'llm' | 'genre';
  /** уверенность в признаках: аудио ≈ 0.6–0.95, описание 0.35 */
  confidence?: number;
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
  key?: boolean | number; // число = приоритет (меньше — важнее), true = 5
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
  /** мотивы (до 3) — шейдерные слои поверх фото */
  motifs: import('./style/motifs').MotifStyle[];
  /** геометрический слой (SDF) */
  geometry: import('./style/geometry').GeometryStyle;
  /** карточки коллажа вокруг главного кадра */
  cards: import('./style/geometry').Card[];
  /** «дрожание света» импрессионизма, вспышка плёнки на склейке, тонкая линия минимализма */
  accents: { shimmer: number; flash: number; hairline: number; waves: number };
  /** голос дня (Web Speech): скорость и высота из Mood */
  voice?: { rate: number; pitch: number };
  /** движение воспоминания: всё привязано к битам песни */
  motion: {
    bpm: number;
    beatsPerCut: number;      // 2 / 4 / 8 долей на склейку
    transitionBeats: number;  // длина растворения в долях (0 = жёсткая склейка)
    pulse: number;            // амплитуда пульсации на долю
    camera: number;           // скорость Ken Burns (доля масштаба за склейку)
    slow: number;             // замедление (светлая грусть), 1 = нет
    phrases: number;          // число фраз по 16 долей
    duration: number;         // с
    start: number;            // с от начала аудио
  };
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
