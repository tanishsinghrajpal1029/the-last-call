/**
 * All sound is generated in code (Web Audio) and the voice uses the device's
 * built-in speech synthesis. No audio files. Everything fails silently: the
 * captions always carry the full content.
 */

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambience: AudioNode[] = [];
  private noiseBuf: AudioBuffer | null = null;
  sound = true;
  voice = true;
  gentle = false;

  /** Must be called from a user gesture (browser autoplay rules). */
  unlock(): void {
    try {
      if (!this.ctx) {
        const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC() as AudioContext;
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.7;
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate * 2;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  private noise(dur: number, f: number, q: number, gain: number, at = 0, type: BiquadFilterType = "bandpass"): void {
    const c = this.ctx;
    if (!c || !this.master || !this.noiseBuf || !this.sound) return;
    const t = c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filt = c.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = f;
    filt.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.03);
    g.gain.setValueAtTime(gain, t + Math.max(0.04, dur - 0.08));
    g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  private tone(freq: number, dur: number, gain: number, at = 0, type: OscillatorType = "sine", glideTo?: number): void {
    const c = this.ctx;
    if (!c || !this.master || !this.sound) return;
    const t = c.currentTime + at;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  startAmbience(): void {
    const c = this.ctx;
    if (!c || !this.master || !this.noiseBuf || this.ambience.length || !this.sound) return;
    // rain: low-passed noise; drone: two detuned low sines
    const rain = c.createBufferSource();
    rain.buffer = this.noiseBuf;
    rain.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    const rg = c.createGain();
    rg.gain.value = 0.05;
    rain.connect(lp).connect(rg).connect(this.master);
    rain.start();
    const dg = c.createGain();
    dg.gain.value = 0.035;
    dg.connect(this.master);
    const oscs = [55, 55.7].map((f) => {
      const o = c.createOscillator();
      o.frequency.value = f;
      o.connect(dg);
      o.start();
      return o;
    });
    this.ambience = [rain, ...oscs, rg, dg];
  }

  stopAmbience(): void {
    for (const n of this.ambience) {
      try {
        if (n instanceof AudioScheduledSourceNode) n.stop();
        n.disconnect();
      } catch {
        /* already stopped */
      }
    }
    this.ambience = [];
  }

  ring(): void {
    for (let i = 0; i < 2; i++) {
      this.tone(440, 0.35, 0.08, i * 0.45, "sine");
      this.tone(480, 0.35, 0.08, i * 0.45, "sine");
    }
  }

  lineOpen(): void {
    this.noise(0.25, 2500, 0.7, 0.05);
    this.tone(1400, 0.06, 0.04, 0.0, "square");
  }

  staticBurst(): void {
    this.noise(1.1, 1800, 0.4, 0.16);
    this.noise(1.1, 300, 1.2, 0.08);
  }

  traceBeeps(): void {
    [697, 770, 852, 941].forEach((f, i) => this.tone(f, 0.12, 0.07, i * 0.14, "square"));
    this.tone(1209, 0.3, 0.06, 0.62, "sine");
  }

  dial(): void {
    this.noise(0.04, 4000, 2, 0.08, 0, "highpass");
  }

  door(): void {
    this.tone(120, 1.2, 0.08, 0, "sawtooth", 70);
    this.noise(1.0, 600, 3, 0.05, 0.05);
  }

  stinger(): void {
    if (this.gentle) {
      this.tone(220, 2.0, 0.06, 0, "sine", 110);
      return;
    }
    [110, 116.5, 155.6, 233].forEach((f) => this.tone(f, 2.4, 0.09, 0, "sawtooth", f * 0.5));
    this.noise(1.2, 120, 0.8, 0.25, 0, "lowpass");
  }

  relief(): void {
    [392, 494, 587].forEach((f, i) => this.tone(f, 1.6, 0.05, i * 0.12, "sine"));
  }

  /** Speak with the device voice. `eerie` lowers and slows it. */
  say(text: string, eerie = false): void {
    if (!this.voice) return;
    try {
      const synth = window.speechSynthesis;
      if (!synth || typeof SpeechSynthesisUtterance === "undefined") return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/[“”—]/g, " "));
      const voices = synth.getVoices();
      const en = voices.filter((v) => v.lang.startsWith("en"));
      const pick = en.find((v) => /female|samantha|zira|victoria|karen|moira|tessa|fiona|google uk english female/i.test(v.name)) || en[0];
      if (pick) u.voice = pick;
      u.rate = eerie ? 0.72 : 0.92;
      u.pitch = eerie ? 0.55 : 1.05;
      u.volume = 0.9;
      synth.speak(u);
    } catch {
      /* captions carry the content */
    }
  }

  dispose(): void {
    this.voice = false; // any late timer must stay silent
    this.sound = false;
    this.stopAmbience();
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }
}
