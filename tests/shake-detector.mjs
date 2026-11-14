import assert from 'node:assert/strict';
import { build } from 'esbuild';

const compiled = await build({ entryPoints: ['lib/shake-detector.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { ShakeDetector } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
let checks = 0;
for (const hz of [30, 60, 120]) {
  for (const gravityOnly of [false, true]) {
    const detector = new ShakeDetector();
    let shakes = 0;
    // Ten seconds of the same 2.5 Hz movement at different sensor rates.
    for (let sample = 0; sample < hz * 10; sample++) {
      const ms = sample * 1000 / hz;
      const x = 24 * Math.sin(2 * Math.PI * 2.5 * ms / 1000);
      const motion = gravityOnly ? { accelerationIncludingGravity: { x, y: 0, z: 9.81 } } : { acceleration: { x, y: 0, z: 0 } };
      if (detector.feed(motion, ms).shake) shakes++;
    }
    assert.ok(shakes >= 48 && shakes <= 50, `${hz} Hz ${gravityOnly ? 'gravity fallback' : 'linear acceleration'}: ${shakes} shakes`);
    checks++;
  }
}
for (const gravityOnly of [false, true]) {
  const detector = new ShakeDetector();
  for (let i = 0; i < 600; i++) {
    const x = Math.sin(i) * .3, y = Math.cos(i) * .3, z = gravityOnly ? 9.81 : 0;
    const motion = gravityOnly ? { accelerationIncludingGravity: { x, y, z } } : { acceleration: { x, y, z } };
    assert.equal(detector.feed(motion, i * 1000 / 60).shake, false, 'stationary sensor noise is ignored');
  }
  checks++;
}
for (const hz of [30, 60, 120]) {
  for (const gravityOnly of [false, true]) {
    let previous = 0;
    for (const frequency of [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]) {
      const detector = new ShakeDetector(); let shakes = 0;
      for (let sample = 0; sample < hz * 10; sample++) {
        const ms = sample * 1000 / hz, x = 24 * Math.sin(2 * Math.PI * frequency * ms / 1000);
        const motion = gravityOnly ? { accelerationIncludingGravity: { x, y: 0, z: 9.81 } } : { acceleration: { x, y: 0, z: 0 } };
        if (detector.feed(motion, ms).shake) shakes++;
      }
      assert.ok(shakes >= previous, `${hz} Hz ${gravityOnly ? 'gravity' : 'linear'}: shaking faster at ${frequency} Hz reduced the count from ${previous} to ${shakes}`);
      assert.ok(Math.abs(shakes - 20 * frequency) <= 2, 'sensor rates recognize the same movement consistently');
      previous = shakes;
    }
    checks++;
  }
}
const detector = new ShakeDetector();
assert.equal(detector.feed({ acceleration: { x: null, y: null, z: null } }, 0).signal, false); checks++;
assert.equal(detector.feed({ acceleration: { x: NaN, y: 0, z: 0 } }, 1).signal, false); checks++;
assert.equal(detector.feed({ acceleration: { x: 14, y: 0, z: 0 } }, 200).shake, true);
assert.equal(detector.feed({ acceleration: { x: 14, y: 0, z: 0 } }, 500).shake, false, 'one held peak is counted once'); checks++;
assert.equal(detector.feed({ acceleration: { x: 0, y: 0, z: 0 } }, 550).shake, false);
assert.equal(detector.feed({ acceleration: { x: 14, y: 0, z: 0 } }, 600).shake, true); checks++;
console.log(JSON.stringify({ sensorChecks: checks, result: 'passed', source: 'synthetic motion traces; physical WeChat devices still require testing' }));
