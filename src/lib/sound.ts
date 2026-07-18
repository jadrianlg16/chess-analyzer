/**
 * Lightweight synthesized sound effects via the Web Audio API so we don't need
 * to bundle any audio files. Each cue is a short blip with a distinct pitch.
 */
export type SoundCue = "move" | "capture" | "check" | "castle" | "promote" | "end";

let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

const TONES: Record<SoundCue, { freq: number; type: OscillatorType; duration: number; gain: number }> = {
  move: { freq: 320, type: "sine", duration: 0.07, gain: 0.18 },
  capture: { freq: 200, type: "square", duration: 0.09, gain: 0.16 },
  check: { freq: 560, type: "triangle", duration: 0.12, gain: 0.2 },
  castle: { freq: 260, type: "sine", duration: 0.1, gain: 0.18 },
  promote: { freq: 660, type: "triangle", duration: 0.14, gain: 0.2 },
  end: { freq: 150, type: "sawtooth", duration: 0.25, gain: 0.18 }
};

export function playSound(cue: SoundCue) {
  const context = audioContext();
  if (!context) return;

  const tone = TONES[cue];
  const osc = context.createOscillator();
  const gain = context.createGain();

  osc.type = tone.type;
  osc.frequency.value = tone.freq;

  const now = context.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(tone.gain, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.duration);

  osc.connect(gain);
  gain.connect(context.destination);
  osc.start(now);
  osc.stop(now + tone.duration + 0.02);
}

/** Pick a cue from a chess.js move's SAN/flags. */
export function cueForMove(san: string, flags: string): SoundCue {
  if (san.includes("#")) return "end";
  if (san.includes("+")) return "check";
  if (flags.includes("k") || flags.includes("q")) return "castle";
  if (san.includes("=")) return "promote";
  if (flags.includes("c") || flags.includes("e")) return "capture";
  return "move";
}
