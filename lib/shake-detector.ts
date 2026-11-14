type Vector = { x: number | null; y: number | null; z: number | null };
export type MotionSample = { acceleration?: Vector | null; accelerationIncludingGravity?: Vector | null };
const valid = (v: Vector | null | undefined): v is { x: number; y: number; z: number } =>
  !!v && [v.x, v.y, v.z].every(n => typeof n === "number" && Number.isFinite(n));

/** Recognize acceleration peaks, independent of the sensor's sample frequency. */
export class ShakeDetector {
  private gravity: { x: number; y: number; z: number } | null = null;
  private gravityAt = 0;
  private peak: { x: number; y: number; z: number } | null = null;
  private armed = true;
  private last = -Infinity;
  feed(sample: MotionSample, time: number) {
    let a = sample.acceleration;
    if (!valid(a)) {
      const raw = sample.accelerationIncludingGravity;
      if (!valid(raw)) return { signal: false, shake: false };
      if (!this.gravity) { this.gravity = { ...raw }; this.gravityAt = time; return { signal: true, shake: false }; }
      const retain = Math.exp(-Math.max(0, time - this.gravityAt) / 200);
      this.gravityAt = time;
      this.gravity = {
        x: this.gravity.x * retain + raw.x * (1 - retain),
        y: this.gravity.y * retain + raw.y * (1 - retain),
        z: this.gravity.z * retain + raw.z * (1 - retain),
      };
      a = { x: raw.x - this.gravity.x, y: raw.y - this.gravity.y, z: raw.z - this.gravity.z };
    }
    const force = Math.hypot(a.x!, a.y!, a.z!);
    // A lower-rate sensor may skip the low-force sample between two opposite
    // peaks. A direction reversal also arms the next shake in that case.
    if (force < 4.5 || (this.peak && a.x! * this.peak.x + a.y! * this.peak.y + a.z! * this.peak.z < 0)) this.armed = true;
    const shake = this.armed && force > 10 && time - this.last >= 80;
    if (shake) { this.armed = false; this.last = time; this.peak = { x: a.x!, y: a.y!, z: a.z! }; }
    return { signal: true, shake };
  }
}
