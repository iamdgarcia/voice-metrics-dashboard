// Node self-check for Voice Metrics Dashboard pure functions.
// Extracts the window.VMD block from index.html, stubs window, runs assertions.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const m = html.match(/<script id="vmd-pure">([\s\S]*?)<\/script>/);
if (!m) { console.error('FAIL: vmd-pure script block not found'); process.exit(1); }

const sandbox = { window: {}, console };
vm.createContext(sandbox);
try {
  vm.runInContext(m[1], sandbox);
} catch (e) {
  console.error('FAIL: VMD block threw:', e.message);
  process.exit(1);
}
const V = sandbox.window.VMD;
let failures = 0;
function check(name, fn) {
  try { fn(); console.log('PASS', name); }
  catch (e) { failures++; console.error('FAIL', name, '-', e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg || ''} expected ${b}, got ${a}`); }

// --- parseTime
check('parseTime: seconds number', () => eq(V.parseTime(3.2), 3.2));
check('parseTime: "mm:ss"', () => eq(V.parseTime('01:30'), 90));
check('parseTime: "hh:mm:ss"', () => eq(V.parseTime('1:00:00'), 3600));
check('parseTime: "ss,ss" comma decimal', () => eq(V.parseTime('2,5'), 2.5));
check('parseTime: junk -> null', () => eq(V.parseTime('abc'), null));

// --- normalize: format (a)
check('normalize: flat array with text', () => {
  const { turns } = V.normalize([{ speaker: 'bot', start: 0, end: 3.2, text: 'Hello' }]);
  eq(turns.length, 1); eq(turns[0].text, 'Hello');
});
// format (b): {turns:[...]} wrapper
check('normalize: {turns:[...]} wrapper', () => {
  const { turns } = V.normalize({ turns: [{ speaker: 'a', start: 5, end: 6 }, { speaker: 'b', start: 0, end: 1 }] });
  eq(turns.length, 2);
  eq(turns[0].start, 0, 'sorted by start:');
});
// format (c): aliases role/t0/t1
check('normalize: role/t0/t1 aliases', () => {
  const { turns } = V.normalize([{ role: 'customer', t0: '00:04', t1: '00:06' }]);
  eq(turns[0].speaker, 'customer');
  eq(turns[0].start, 4);
  eq(turns[0].end, 6);
});
// sorting
check('normalize: out-of-order turns sorted', () => {
  const { turns } = V.normalize([
    { speaker: 'b', start: '10', end: '12' },
    { speaker: 'a', start: 0, end: 2 }]);
  eq(turns[0].speaker, 'a');
});
// bad inputs -> clear errors, not crashes
check('normalize: non-JSON-garbage types throw clear errors', () => {
  for (const bad of [null, 42, 'text', {}, { turns: 'no' }, [], [{ speaker: 'a' }],
                     [{ start: 1, end: 0 }], [{ start: 'xx', end: 2 }]]) {
    let threw = null;
    try { V.normalize(bad); } catch (e) { threw = e; }
    if (!threw) throw new Error('no throw for ' + JSON.stringify(bad));
    if (typeof threw.message !== 'string' || threw.message.length < 8) {
      throw new Error('error message not descriptive');
    }
  }
});

// --- computeKpis: known tiny case, hand-verified
// t0: 0..2 (2s), t1: 3..5 (2s, gap 1000ms), t2: 5.5..7 (1.5s, gap 500ms), t3: 6.5..8 (overlap!)
const tiny = [
  { speaker: 'A', start: 0, end: 2, text: 'one two three four' },
  { speaker: 'B', start: 3, end: 5, text: 'five six' },
  { speaker: 'A', start: 5.5, end: 7, text: '' },
  { speaker: 'B', start: 6.5, end: 8, text: 'eight' }
];
check('computeKpis: median gap = 750 (avg of 500,1000)', () => {
  eq(V.computeKpis(tiny).medianGapMs, 750);
});
check('computeKpis: p95 (nearest-rank, n=3) = max gap 1000', () => {
  eq(V.computeKpis(tiny).p95GapMs, 1000);
});
check('computeKpis: interruptions = 1 (t3 starts 6.5 < t2 end 7)', () => {
  eq(V.computeKpis(tiny).interruptions, 1);
});
check('computeKpis: longest silence = 1000ms', () => {
  eq(V.computeKpis(tiny).longestSilenceMs, 1000);
});
check('computeKpis: duration = 8s (last.end - first.start)', () => {
  eq(V.computeKpis(tiny).durationSec, 8);
});
check('computeKpis: talk share A = 3.5/7.0 = 50%', () => {
  const k = V.computeKpis(tiny);
  const a = k.talkBySpeaker.find(s => s.speaker === 'A');
  if (Math.abs(a.pct - 50) > 1e-9) throw new Error('got ' + a.pct);
});
check('computeKpis: wps = 7 words / 7.0s speech (overlap counts for both speakers)', () => {
  const k = V.computeKpis(tiny);
  if (Math.abs(k.wordsPerSecond - 1) > 1e-9) throw new Error('got ' + k.wordsPerSecond);
});
check('computeKpis: containment — no handoff words = 100%', () => {
  eq(V.computeKpis(tiny).containmentPct, 100);
});
check('computeKpis: containment — handoff word detected', () => {
  const withHandoff = [...tiny, { speaker: 'bot', start: 9, end: 10, text: 'Le transfiero con un agente humano.' }];
  const k = V.computeKpis(withHandoff);
  eq(k.handoffTurns, 1);
  if (Math.abs(k.containmentPct - 4 / 5 * 100) > 1e-9) throw new Error('got ' + k.containmentPct);
});

// --- gapBuckets
check('gapBuckets: tiny -> [500,1000] gaps + 1 overlap', () => {
  const b = V.gapBuckets(tiny);
  // gaps: 1000 -> bucket 700-1500 (idx 2); 500 -> bucket 0-300? no: 300-700 (idx 1); overlap: 1
  if (b.counts[1] !== 1 || b.counts[2] !== 1) throw new Error('got ' + JSON.stringify(b.counts));
  eq(b.overlaps, 1);
});

// --- demo transcript end-to-end
check('DEMO: 14 turns, parses, computes, has 1 interruption + 1 handoff', () => {
  const { turns } = V.normalize(V.DEMO);
  eq(turns.length, 14);
  const k = V.computeKpis(turns);
  eq(k.interruptions, 1, 'demo interruptions:');
  eq(k.handoffTurns, 1, 'demo handoff turns:');
  if (k.medianGapMs <= 0) throw new Error('median gap should be > 0');
  if (k.durationSec <= 60 || k.durationSec >= 90) throw new Error('demo duration unexpected: ' + k.durationSec);
});

// --- fmt helpers
check('fmtTime: 90 -> "1:30"', () => eq(V.fmtTime(90), '1:30'));
check('fmtTime: 3725 -> "1:02:05"', () => eq(V.fmtTime(3725), '1:02:05'));
check('wordCount', () => eq(V.wordCount('  hola   mundo  '), 2));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
