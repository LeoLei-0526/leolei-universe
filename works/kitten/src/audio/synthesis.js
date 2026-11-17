// 沿用11已接受的确定性四类声音合成。
  const durations = { pink: 8, brown: 8, contact: .22, end: .72 };
  function make(kind, sampleRate = 48000, seconds = durations[kind]) {
    if (!Object.hasOwn(durations, kind)) throw new Error('未知声音类型');
    const n = Math.floor(sampleRate * seconds); let data = new Float32Array(n);
    let seed = 782311, low = 0, walk = 0;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2147483648 - 1; };
    const octaves = Array.from({ length: 12 }, random);
    const alpha = 1 - Math.exp(-2 * Math.PI * (kind === 'pink' ? 2400 : 900) / sampleRate);
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate;
      if (kind === 'pink' || kind === 'brown') {
        let raw;
        if (kind === 'pink') {
          // 各倍频程保持不同长度的随机值，近似1/f，再柔和低通。
          for (let k = 0; k < octaves.length; k++) if (i % (1 << k) === 0) octaves[k] = random();
          raw = (octaves.reduce((a, b) => a + b, 0) + random()) / 6;
        } else { walk = .997 * walk + .025 * random(); raw = walk; }
        low += alpha * (raw - low); data[i] = low;
      } else if (kind === 'contact') {
        const env = Math.min(1, t / .009) * Math.exp(-t * 26) * Math.max(0, 1 - t / seconds);
        data[i] = env * (.24 * Math.sin(2 * Math.PI * 230 * t) + .06 * Math.sin(2 * Math.PI * 470 * t));
      } else {
        const tone = (start, length, hz) => {
          const q = t - start;
          if (q < 0 || q > length) return 0;
          return Math.sin(Math.PI * q / length) ** 2 * Math.sin(2 * Math.PI * hz * q);
        };
        data[i] = .15 * tone(0, .43, 520) + .11 * tone(.28, .42, 650);
      }
    }
    if (kind === 'pink' || kind === 'brown') {
      const cross = Math.floor(sampleRate * .14);
      const folded = new Float32Array(n - cross);
      for (let i = 0; i < cross; i++) {
        const q = i / (cross - 1);
        folded[i] = data[n - cross + i] * (1 - q) + data[i] * q;
      }
      folded.set(data.subarray(cross, n - cross), cross); data = folded;
      const mean = data.reduce((a, b) => a + b, 0) / data.length;
      let power = 0, peak = 0;
      for (let i = 0; i < data.length; i++) { data[i] -= mean; power += data[i] ** 2; peak = Math.max(peak, Math.abs(data[i])); }
      const scale = Math.min(.12 / Math.sqrt(power / data.length), .52 / peak);
      for (let i = 0; i < data.length; i++) data[i] *= scale;
    }
    return data;
  }

export { make, durations };
