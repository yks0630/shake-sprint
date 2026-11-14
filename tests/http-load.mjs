import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
const base = process.argv[2] || 'http://127.0.0.1:5187';
const participants = 137;
const timings = [], errors = [], retries = [];
let requests = 0;
const sleep = ms => new Promise(r => setTimeout(r, Math.max(0, ms)));
async function call(path, input, token) {
 for(let attempt=0;attempt<4;attempt++) {
  const t = performance.now(); requests++;
  let retryable = true;
  try {
   const r = await fetch(base + path, { method: input === undefined ? 'GET' : 'POST', headers: { ...(input === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: input === undefined ? undefined : JSON.stringify(input), signal: AbortSignal.timeout(path.endsWith('/score')?1800:8000) });
   retryable = [502,503,504].includes(r.status);
   let d; try { d = await r.json(); } catch { throw new Error(r.status+': non-JSON service response'); }
   if (!r.ok) throw new Error(r.status + ': ' + d.error);
   timings.push(performance.now()-t);return d;
  } catch(e) {
   // GET and cumulative score writes can be repeated safely, like the client.
   // Do not retry create/join, which could duplicate rooms or participants.
   if(retryable && (input===undefined||path.endsWith('/score')) && attempt<3) { retries.push(e.message); await sleep(120*(attempt+1)); continue; }
   errors.push(e.message);throw e;
  }
 }
}
const room = await call('/api/rooms', { title: '并发验收' });
const users = [];
for (let i=0;i<participants;i+=16) {
 const batch = await Promise.all(Array.from({length:Math.min(16,participants-i)},(_,j)=>call('/api/rooms/'+room.code+'/join',{nickname:'测试'+String(i+j+1).padStart(3,'0'),character:(i+j)%3})));
 users.push(...batch);
}
assert.equal((await call('/api/rooms/'+room.code)).count,participants);
let schedule = null;
const firstCountdown = new Map();
const personal=users.map(async(u,i)=>{
 await sleep((i%8)*70);
 while(!schedule || Date.now()<schedule.endAt+1000){
  const d=await call('/api/rooms/'+room.code+'?player='+u.id,undefined,u.playerToken);
  assert.equal(d.count,participants);assert.equal(d.me.id,u.id);
  if(d.stage==='countdown'&&!firstCountdown.has(u.id))firstCountdown.set(u.id,Math.ceil((d.startAt-d.serverNow)/1000));
  await sleep(d.stage==='lobby'||d.stage==='countdown'?400:1500);
 }
});
const screen=(async()=>{while(!schedule || Date.now()<schedule.endAt+1000){const d=await call('/api/rooms/'+room.code);assert.equal(d.count,participants);await sleep(800);}})();
await sleep(1800);
schedule = await call('/api/rooms/'+room.code+'/start',{},room.hostToken);
assert.equal(schedule.endAt-schedule.startAt,40000);
console.log(JSON.stringify({event:'started',room:room.code,participants,screen:base+'/screen/'+room.code}));
await sleep(schedule.startAt-Date.now()+30);
const expected = new Map();
const started=performance.now();
const reporters=users.map(async(u,i)=>{
 const rate=3+(i%5)*.2;
 await sleep((i%7)*25);
 while(Date.now()<schedule.endAt-1000){
  const n=Math.floor(Math.max(0,Date.now()-schedule.startAt)*rate/1000);
  await call('/api/rooms/'+room.code+'/score',{id:u.id,round:1,shakes:n},u.playerToken);
  await sleep(650);
 }
 await sleep(schedule.endAt+100-Date.now());
 const final=Math.floor(40*rate);
 await call('/api/rooms/'+room.code+'/score',{id:u.id,round:1,shakes:final},u.playerToken);
 expected.set(u.id,final);
});
await Promise.all([...reporters,...personal,screen]);
assert.equal(firstCountdown.size,participants,'all waiting phones receive the countdown');
assert.ok([...firstCountdown.values()].every(n=>n===3),'all simulated phones first see 3 seconds on this local connection');
await sleep(schedule.endAt+2300-Date.now());
const result=await call('/api/rooms/'+room.code);
assert.equal(result.stage,'finished');assert.equal(result.count,participants);
for(const p of result.players)assert.equal(p.shakes,expected.get(p.id),'final score '+p.id);
await call('/api/rooms/'+room.code+'/next',{},room.hostToken);
const next=await call('/api/rooms/'+room.code);
assert.equal(next.round,2);assert.equal(next.count,participants);assert.ok(next.players.every(p=>p.shakes===0));
timings.sort((a,b)=>a-b);
const report={result:'passed',target:base,participants,requests,failed:errors.length,transientRetries:retries.length,retryReasons:[...new Set(retries)],countdownThree:firstCountdown.size,durationSeconds:Math.round((performance.now()-started)/1000),latencyMs:{p50:Math.round(timings[Math.floor(timings.length*.5)]),p95:Math.round(timings[Math.floor(timings.length*.95)]),max:Math.round(timings.at(-1))},checks:['137 independent credentials','400ms lobby and countdown polling','all 137 simulated phones first see 3 seconds','40-second shared schedule','concurrent score and rank requests','all final scores match','all participants retained after next round','scores reset on next round']};
if(process.argv[3])writeFileSync(process.argv[3],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
