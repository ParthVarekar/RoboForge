import type { ActuatorFrame } from '../engine/actuators';

/**
 * What the buzzers and relays on the bench sound like: a quiet square-wave tone while a buzzer sounds, and a short
 * click each time a relay switches. Uses Web Audio; does nothing where it is not available (tests, old browsers).
 * The browser only allows sound after the user has clicked on the page (pressing Run counts).
 */
export class ActuatorSound {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private clickBuffer: AudioBuffer | null = null;
  private relays = new Set<string>();
  private toneOn = false;

  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
    if (!Ctor) return null;
    try {
      this.ctx = new Ctor();
    } catch {
      return null;
    }
    return this.ctx;
  }

  /** Call once per frame with what the parts are doing. */
  update(frame: ActuatorFrame, enabled: boolean): void {
    const freq = enabled ? frame.buzzers.values().next().value : undefined;
    if (freq !== undefined) this.startTone(freq);
    else if (this.toneOn) this.stopTone();

    for (const id of frame.relaysOn) if (!this.relays.has(id) && enabled) this.click();
    for (const id of this.relays) if (!frame.relaysOn.has(id) && enabled) this.click();
    this.relays = new Set(frame.relaysOn);
  }

  private startTone(freq: number): void {
    const ctx = this.context();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    if (!this.osc || !this.gain) {
      this.osc = ctx.createOscillator();
      this.osc.type = 'square';
      this.gain = ctx.createGain();
      this.gain.gain.value = 0;
      this.osc.connect(this.gain).connect(ctx.destination);
      this.osc.start();
    }
    this.osc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.005);
    if (!this.toneOn) this.gain.gain.setTargetAtTime(0.035, ctx.currentTime, 0.01);
    this.toneOn = true;
  }

  private stopTone(): void {
    if (this.ctx && this.gain) this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01);
    this.toneOn = false;
  }

  private click(): void {
    const ctx = this.context();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    if (!this.clickBuffer) {
      // 25 ms of decaying noise: the armature hitting its contact
      const n = Math.round(ctx.sampleRate * 0.025);
      this.clickBuffer = ctx.createBuffer(1, n, ctx.sampleRate);
      const data = this.clickBuffer.getChannelData(0);
      for (let i = 0; i < n; i += 1) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (n * 0.12));
    }
    const src = ctx.createBufferSource();
    src.buffer = this.clickBuffer;
    const g = ctx.createGain();
    g.gain.value = 0.18;
    src.connect(g).connect(ctx.destination);
    src.start();
  }

  dispose(): void {
    try {
      this.osc?.stop();
    } catch {
      /* already stopped */
    }
    void this.ctx?.close();
    this.ctx = null;
    this.osc = null;
    this.gain = null;
  }
}
