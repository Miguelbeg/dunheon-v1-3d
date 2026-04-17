class SoundManager {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  play(name: string, volume: number = 0.5) {
    if (!this.enabled) return;
    
    try {
      this.init();
      if (!this.ctx) return;

      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);

      if (name === 'walk') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(120, t);
        osc.frequency.exponentialRampToValueAtTime(10, t + 0.1);
        gain.gain.setValueAtTime(volume * 0.8, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
        osc.start(t);
        osc.stop(t + 0.1);
      } else if (name === 'swing') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, t);
        osc.frequency.exponentialRampToValueAtTime(100, t + 0.15);
        gain.gain.setValueAtTime(volume * 0.5, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
        osc.start(t);
        osc.stop(t + 0.15);
      } else if (name === 'hit') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.exponentialRampToValueAtTime(50, t + 0.15);
        gain.gain.setValueAtTime(volume, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
        osc.start(t);
        osc.stop(t + 0.15);
      } else if (name === 'hurt') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, t);
        osc.frequency.exponentialRampToValueAtTime(50, t + 0.3);
        gain.gain.setValueAtTime(volume, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
        osc.start(t);
        osc.stop(t + 0.3);
      } else if (name === 'death') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.exponentialRampToValueAtTime(10, t + 0.6);
        gain.gain.setValueAtTime(volume, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.6);
        osc.start(t);
        osc.stop(t + 0.6);
      } else if (name === 'slime') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, t);
        osc.frequency.linearRampToValueAtTime(200, t + 0.2);
        gain.gain.setValueAtTime(volume, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
        osc.start(t);
        osc.stop(t + 0.2);
      } else if (name === 'levelUp') {
        osc.type = 'square';
        const notes = [440, 554, 659, 880]; // A4, C#5, E5, A5
        notes.forEach((freq, i) => {
          osc.frequency.setValueAtTime(freq, t + i * 0.1);
        });
        gain.gain.setValueAtTime(volume * 0.3, t);
        gain.gain.setValueAtTime(volume * 0.3, t + 0.3);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
        osc.start(t);
        osc.stop(t + 0.5);
      }
    } catch (e) {
      console.warn("Audio play failed:", e);
    }
  }

  toggle(enabled: boolean) {
    this.enabled = enabled;
  }
}

export const sounds = new SoundManager();
