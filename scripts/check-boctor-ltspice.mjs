// Optional real-part check: node --import ./scripts/resolve-ext.mjs scripts/check-boctor-ltspice.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { designBoctorNotch } from '../src/lib/filter/boctor.js';
import { magnitudePhaseAt } from '../src/lib/filter/bode.js';
import { generateNetlist, generateSchematic } from '../src/lib/filter/spice.js';

const exe = process.env.LTSPICE ?? join(process.env.LOCALAPPDATA ?? '', 'Programs', 'ADI', 'LTspice', 'LTspice.exe');
if (!existsSync(exe)) { console.log('LTspice unavailable; skipped'); process.exit(0); }
const dir = mkdtempSync(join(tmpdir(), 'rbt56-boctor-lt-'));
let failures = 0;
const check = (label, ok, detail = '') => { console.log(`${ok ? 'ok' : 'FAIL'} ${label} ${detail}`); if (!ok) failures++; };
const run = args => {
	try { execFileSync(exe, args, { windowsHide: true, stdio: 'ignore', timeout: 60000 }); }
	catch (e) { if (e.code === 'ETIMEDOUT') throw e; } // LTspice exit status is not authoritative.
};
for (const lowSide of [true, false]) {
	const name = lowSide ? 'LP' : 'HP', wn = 2 * Math.PI * 1000;
	const d = designBoctorNotch(wn, 0.9, wn * (lowSide ? 2 : 0.5), { lowSide, resistorSeries: 'E96' });
	const opts = { realizedStages: [d], filterType: lowSide ? 'lowpass' : 'highpass', topology: 'boctor', response: 'elliptic', fp: 1000, fs: lowSide ? 3000 : 300, amaxDb: 3, aminDb: 40, opamp: 'TL082' };
	const ac = join(dir, `${name}-ac.cir`), asc = join(dir, `${name}.asc`);
	writeFileSync(asc, generateSchematic(opts)); run(['-netlist', asc]);
	const net = readFileSync(join(dir, `${name}.net`), 'latin1');
	check(`${name} LTspice opens the schematic`, /TL082/i.test(net));
	writeFileSync(ac, generateNetlist(opts).replace(/^\.meas.*$/gm, '') .replace(/\.end\s*$/i, '.meas AC boctor_gain FIND mag(V(vout)) AT 1000\n.end\n'));
	run(['-b', '-ascii', ac]);
	const log = readFileSync(join(dir, `${name}-ac.log`), 'latin1');
	const gainDb = Number(/boctor_gain:.*?=\s*\(([-+\d.e]+)dB/i.exec(log)?.[1]);
	const gain = 10 ** (gainDb / 20);
	const ideal = 10 ** (magnitudePhaseAt([d], 1000).db / 20);
	check(`${name} TL082 AC agrees at 1 kHz`, Number.isFinite(gain) && Math.abs(gain / ideal - 1) < 0.15, `measured ${gain.toPrecision(4)}, ideal ${ideal.toPrecision(4)}`);
	const tran = join(dir, `${name}-tran.cir`);
	writeFileSync(tran, generateNetlist(opts).replace(/^\.(ac|meas).*$/gm, '').replace(/\.end\s*$/i, '.tran 0 20m 0 10u\n.end\n'));
	run(['-b', '-ascii', tran]);
	const raw = readFileSync(join(dir, `${name}-tran.raw`), 'latin1');
	const head = raw.slice(0, raw.indexOf('Values:')), n = Number(/No\. Variables:\s*(\d+)/.exec(head)[1]);
	const vars = head.slice(head.indexOf('\nVariables:') + 12).trim().split(/\r?\n/).map(l => l.trim().split(/\s+/)[1]);
	const col = vars.findIndex(v => v.toLowerCase() === 'v(vout)'), rows = raw.slice(raw.indexOf('Values:') + 7).trim().split(/\r?\n/);
	const samples = [];
	for (let i = 0; i + n <= rows.length; i += n) if (Number(rows[i].trim().split(/\s+/)[1]) > 0.01) samples.push(Number(rows[i + col].trim()));
	const peak = Math.max(...samples.map(Math.abs)), mean = samples.reduce((a,b) => a+b,0) / samples.length;
	check(`${name} TL082 settles without latching on a rail`, samples.length > 100 && peak > 0.05 && peak < 10 && Math.abs(mean) < 0.3, `peak ${peak.toFixed(3)} V, mean ${mean.toFixed(3)} V`);
}
console.log(failures ? `${failures} failures` : 'Boctor real-part checks clean');
process.exit(failures ? 1 : 0);
