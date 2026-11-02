export type AmbienceSeason = "spring" | "summer" | "autumn" | "winter";

const SAMPLE_RATE = 22050;
const LOOP_SECONDS = 8;
const OUTDOOR_LEVEL = 0.12;
const INDOOR_LEVEL = 0.025;
const SEASON_LEVEL: Record<AmbienceSeason, number> = {
  spring: 1.995,
  summer: 0.9025,
  autumn: 0.5775,
  winter: 2.94,
};

type LoopVoice = { source: AudioBufferSourceNode; gain: GainNode };

function randomGenerator(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function makeLoopBuffer(context: AudioContext, season: AmbienceSeason) {
  const length = SAMPLE_RATE * LOOP_SECONDS;
  const buffer = context.createBuffer(1, length, SAMPLE_RATE);
  const samples = buffer.getChannelData(0);
  const random = randomGenerator({ spring: 12, summer: 25, autumn: 38, winter: 51 }[season]);
  let slow = 0;
  let mid = 0;
  let event = 0;
  let winterPhase = 0;

  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const noise = random() * 2 - 1;
    slow += (noise - slow) * 0.006;
    mid += (noise - mid) * 0.09;

    if (season === "spring") {
      const gust = 0.62 + 0.23 * Math.sin(2 * Math.PI * t / LOOP_SECONDS)
        + 0.12 * Math.sin(4 * Math.PI * t / LOOP_SECONDS + 0.8);
      samples[i] = (slow * 2.3 + mid * 0.2) * gust;
    } else if (season === "summer") {
      if (random() < 0.0013) event = 0.55 + random() * 0.35;
      event *= 0.992;
      const rain = (noise - mid) * 0.37 + mid * 0.22;
      samples[i] = rain + event * (noise - slow) * 0.35;
    } else if (season === "autumn") {
      if (random() < 0.000045) event = 0.48 + random() * 0.22;
      event *= 0.99955;
      const breeze = slow * (0.5 + 0.2 * Math.sin(2 * Math.PI * t / LOOP_SECONDS));
      samples[i] = breeze * 0.95 + event * ((noise - mid) * 0.12 + mid * 0.38);
    } else {
      if (random() < 0.000055) event = 0.22 + random() * 0.18;
      event *= 0.997;
      const gust = 0.5 + 0.5 * Math.sin(4 * Math.PI * t / LOOP_SECONDS - 0.8);
      winterPhase += (2 * Math.PI * (185 + 28 * Math.sin(2 * Math.PI * t / LOOP_SECONDS))) / SAMPLE_RATE;
      const howl = Math.sin(winterPhase) * 0.026 + Math.sin(winterPhase * 1.9 + 0.4) * 0.007;
      samples[i] = slow * (0.58 + 0.24 * gust) + (mid * 0.1 + howl) * gust
        + event * (mid * 0.33 + noise * 0.06);
    }
  }

  // Bring the final samples gently to the first value so the loop point cannot click.
  const seam = 1024;
  const first = samples[0];
  for (let i = 0; i < seam; i++) {
    const at = length - seam + i;
    const blend = (i / (seam - 1)) ** 2;
    samples[at] = samples[at] * (1 - blend) + first * blend;
  }
  return buffer;
}

function makeThunderBuffer(context: AudioContext) {
  const length = SAMPLE_RATE * 4;
  const buffer = context.createBuffer(1, length, SAMPLE_RATE);
  const samples = buffer.getChannelData(0);
  const random = randomGenerator(2048);
  let low = 0;
  let mid = 0;
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const noise = random() * 2 - 1;
    low += (noise - low) * 0.018;
    mid += (noise - mid) * 0.11;
    const envelope = Math.min(1, t / 0.28) * Math.exp(-t / 1.45);
    const swell = 0.75 + 0.25 * Math.sin(t * 13);
    samples[i] = envelope * swell * (low * 3.2 + mid * 0.95 + Math.sin(t * 2 * Math.PI * 48) * 0.075);
  }
  return buffer;
}

export class SeasonAmbience {
  private readonly context = new AudioContext();
  private readonly master = this.context.createGain();
  private readonly loops = new Map<AmbienceSeason, AudioBuffer>();
  private thunder: AudioBuffer | null = null;
  private readonly thunderVoices = new Set<AudioBufferSourceNode>();
  private current: LoopVoice | null = null;
  private season: AmbienceSeason;
  private enabled = false;
  private inside = false;

  constructor(season: AmbienceSeason, inside: boolean) {
    this.season = season;
    this.inside = inside;
    this.master.gain.value = 0;
    this.master.connect(this.context.destination);
  }

  resume() {
    const result = this.context.resume();
    if (!this.current) this.current = this.startLoop(this.season);
    return result;
  }

  private startLoop(season: AmbienceSeason): LoopVoice {
    let buffer = this.loops.get(season);
    if (!buffer) {
      buffer = makeLoopBuffer(this.context, season);
      this.loops.set(season, buffer);
    }
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    gain.gain.value = SEASON_LEVEL[season];
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain).connect(this.master);
    source.start();
    return { source, gain };
  }

  private updateLevel() {
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(this.enabled ? (this.inside ? INDOOR_LEVEL : OUTDOOR_LEVEL) : 0, now + 0.35);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.updateLevel();
  }

  setInside(inside: boolean) {
    if (this.inside === inside) return;
    this.inside = inside;
    this.updateLevel();
  }

  setSeason(season: AmbienceSeason) {
    if (this.season === season) return;
    this.season = season;
    this.thunderVoices.forEach((voice) => { try { voice.stop(); } catch { /* already ended */ } });
    this.thunderVoices.clear();
    const old = this.current;
    const next = this.startLoop(season);
    const now = this.context.currentTime;
    next.gain.gain.setValueAtTime(0, now);
    next.gain.gain.linearRampToValueAtTime(SEASON_LEVEL[season], now + 0.5);
    if (old) {
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueAtTime(old.gain.gain.value, now);
      old.gain.gain.linearRampToValueAtTime(0, now + 0.5);
      old.source.stop(now + 0.55);
      old.source.onended = () => { old.source.disconnect(); old.gain.disconnect(); };
    }
    this.current = next;
  }

  playThunder() {
    if (!this.enabled || this.inside || this.season !== "summer") return;
    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    if (!this.thunder) this.thunder = makeThunderBuffer(this.context);
    source.buffer = this.thunder;
    gain.gain.value = 1.47;
    source.connect(gain).connect(this.master);
    this.thunderVoices.add(source);
    source.onended = () => { this.thunderVoices.delete(source); source.disconnect(); gain.disconnect(); };
    const thunderAt = now + 1.05 + Math.random() * 0.55;
    const rain = this.current?.gain.gain;
    if (rain) {
      rain.cancelScheduledValues(now);
      rain.setValueAtTime(rain.value, now);
      rain.linearRampToValueAtTime(SEASON_LEVEL.summer * 0.82, thunderAt + 0.35);
      rain.setValueAtTime(SEASON_LEVEL.summer * 0.82, thunderAt + 2.1);
      rain.linearRampToValueAtTime(SEASON_LEVEL.summer, thunderAt + 3.9);
    }
    source.start(thunderAt);
  }

  dispose() {
    this.current?.source.stop();
    this.thunderVoices.forEach((voice) => { try { voice.stop(); } catch { /* already ended */ } });
    void this.context.close();
  }
}
