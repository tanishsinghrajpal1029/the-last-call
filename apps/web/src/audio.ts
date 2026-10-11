/**
 * Sound effects are generated in code (Web Audio). Spoken lines are pre-rendered
 * clips (Piper TTS, MIT, with the LibriTTS-trained voice, CC BY 4.0; see
 * THIRD_PARTY_NOTICES.md) embedded in voicedata.ts; if a clip can't play, the
 * device's speech synthesis is used instead. Everything fails silently: the
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
    this.boxTimer = window.setInterval(() => { if (Math.random() < 0.5) this.musicBox(); }, 17000);
  }

  private boxTimer = 0;

  /** A slightly detuned music-box phrase (original), drifting in now and then. */
  musicBox(): void {
    const notes = [659, 587, 523, 494, 523, 392, 440, 330];
    notes.forEach((f, i) => {
      const detune = 1 + (Math.random() - 0.5) * 0.012;
      this.tone(f * detune, 0.9, 0.028, i * 0.42, "triangle");
      this.tone(f * 2 * detune, 0.5, 0.008, i * 0.42, "sine");
    });
  }

  stopAmbience(): void {
    clearInterval(this.boxTimer);
    this.boxTimer = 0;
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
    // a shriek: bright noise and a falling scrape
    this.noise(0.9, 3200, 2.5, 0.22, 0.05);
    this.tone(1800, 0.9, 0.07, 0.05, "sawtooth", 300);
  }

  relief(): void {
    [392, 494, 587].forEach((f, i) => this.tone(f, 1.6, 0.05, i * 0.12, "sine"));
  }

  // ---------- recorded (neural TTS) voice clips ----------
  private clips = new Map<string, AudioBuffer>();
  private clipData: Record<string, string> | null = null;
  private loading: Promise<void> | null = null;
  private current: AudioBufferSourceNode | null = null;
  private voiceToken = 0;

  /** Load the pre-rendered voice clips (lazy; a separate module). */
  loadVoices(): Promise<void> {
    if (!this.loading) {
      this.loading = import("./voicedata.js")
        .then((m) => { this.clipData = m.VOICES; })
        .catch(() => { this.clipData = null; });
    }
    return this.loading;
  }

  private async clip(id: string): Promise<AudioBuffer | null> {
    const c = this.ctx;
    if (!c) return null;
    const hit = this.clips.get(id);
    if (hit) return hit;
    await this.loadVoices();
    const b64 = this.clipData?.[id];
    if (!b64) return null;
    try {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const buf = await c.decodeAudioData(bytes.buffer);
      this.clips.set(id, buf);
      return buf;
    } catch {
      return null;
    }
  }

  /**
   * Play a recorded line by id. Falls back to the device's speech synthesis
   * with `fallbackText` if the clip can't be played. Interrupts the previous line.
   */
  async voiceLine(id: string, fallbackText: string, eerie = false): Promise<void> {
    if (!this.voice) return;
    const token = ++this.voiceToken;
    const buf = await this.clip(id);
    if (!this.voice || token !== this.voiceToken) return; // a newer line (or stop) superseded this one
    const c = this.ctx;
    if (!buf || !c || !this.master) {
      if (fallbackText) this.say(fallbackText, eerie);
      return;
    }
    try {
      this.current?.stop();
    } catch {
      /* already stopped */
    }
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.value = 1.0;
    src.connect(g).connect(this.master);
    src.start();
    this.current = src;
  }

  stopVoice(): void {
    this.voiceToken++;
    try {
      this.current?.stop();
    } catch {
      /* ignore */
    }
    this.current = null;
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
  }

  /** Slow wet footsteps on the porch, louder as `k` (0..1) rises; the same at both doors. */
  footsteps(k: number): void {
    const n = 3 + Math.round(k * 3), g = 0.06 + 0.22 * k;
    for (let i = 0; i < n; i++) {
      const at = i * (0.62 - 0.12 * k) + (i % 2) * 0.05;
      this.noise(0.12, 180 + 60 * (i % 2), 0.9, g, at, "lowpass");
      this.tone(70, 0.1, g * 0.6, at, "sine", 45);
      this.noise(0.05, 2400, 2, g * 0.25, at + 0.04, "bandpass"); // water
    }
  }

  /** Length of a voice clip in seconds (0 if it can't be decoded). */
  async clipSeconds(id: string): Promise<number> {
    const b = await this.clip(id);
    return b ? b.duration : 0;
  }

  knock(): void {
    for (let i = 0; i < 3; i++) {
      this.tone(90, 0.18, 0.22, i * 0.32, "sine", 55);
      this.noise(0.08, 300, 1, 0.18, i * 0.32, "lowpass");
    }
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
    this.stopVoice();
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
