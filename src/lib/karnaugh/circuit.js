import { createNet, label } from '../filter/schematic';
import { andGate, gateHeight, notGate, orGate } from './gates';

/**
 * Two-level gate circuit for a minimized expression: a sum of products
 * (AND gates into one OR) or a product of sums (OR gates into one AND).
 *
 * Layout, left to right: one vertical bus line per input variable, with an
 * inverter hanging off it feeding a second, complemented bus line whenever
 * a complemented literal is needed; the first-level gates stacked in a
 * column, each input tapped straight off the bus it needs (a dot marks
 * every tap, a plain crossing means no connection); the second-level gate
 * to the right, fed by a fan-in whose vertical runs are staggered so no two
 * of them share a line; the output on the far right.
 *
 * `terms` is an array of terms, each an array of { index, negated }.
 */

const MARGIN = 24;
const SLOT = 60; // horizontal room per variable: true line, inverter, complemented line
const PIN = 14;
const ROW_GAP = 18;

export function buildTwoLevelDiagram({ names, terms, form = 'sop', outputName = 'F', constant = null }) {
	const n = names.length;
	if (constant !== null || terms.length === 0) {
		const value = constant !== null ? constant : form === 'sop' ? 0 : 1;
		const svg = label(`${outputName} = ${value}`, MARGIN, 44, { anchor: 'start' });
		return { svg, viewBox: `0 0 220 80` };
	}

	const level1 = form === 'sop' ? andGate : orGate;
	const level2 = form === 'sop' ? orGate : andGate;
	const usesNeg = names.map((_, i) => terms.some((t) => t.some((l) => l.index === i && l.negated)));
	const usesTrue = names.map((_, i) => terms.some((t) => t.some((l) => l.index === i && !l.negated)));

	const xT = (i) => MARGIN + 20 + i * SLOT;
	const xC = (i) => xT(i) + 36;
	const topY = 40;
	const invY = (i) => topY + 18 + i * 24;
	const gatesTop = topY + 18 + n * 24 + 26;

	// first-level rows: a gate per term with 2+ literals, a bare wire for a single literal
	const rowH = terms.map((t) => (t.length >= 2 ? gateHeight(t.length) : 20));
	const rowY = [];
	let y = gatesTop;
	for (let k = 0; k < terms.length; k++) {
		rowY.push(y + rowH[k] / 2);
		y += rowH[k] + ROW_GAP;
	}
	const bottomY = y + 6;

	const xG1 = xT(n - 1) + 36 + 44;
	const net = createNet();
	const parts = [];
	const ports = [];

	// --- input buses and inverters
	for (let i = 0; i < n; i++) {
		parts.push(label(names[i], xT(i), topY - 8, { anchor: 'middle' }));
		if (usesNeg[i]) {
			const inv = notGate(xT(i), invY(i));
			parts.push(inv.svg);
			ports.push(...inv.ports.in, inv.ports.out);
			net.wire(inv.ports.out, { x: xC(i), y: invY(i) });
			net.wire({ x: xC(i), y: invY(i) }, { x: xC(i), y: bottomY });
			parts.push(label(`${names[i]}'`, xC(i) + 5, invY(i) - 5, { anchor: 'start' }));
			// the bus is split at the inverter's input so that pin is a real
			// junction (bus in, bus on, inverter) rather than a wire passing by
			net.wire({ x: xT(i), y: topY }, inv.ports.in[0]);
			if (usesTrue[i]) net.wire(inv.ports.in[0], { x: xT(i), y: bottomY });
		} else if (usesTrue[i]) {
			net.wire({ x: xT(i), y: topY }, { x: xT(i), y: bottomY });
		} else {
			net.wire({ x: xT(i), y: topY }, { x: xT(i), y: topY + 20 });
		}
	}

	// --- first level
	const rowOut = []; // { x, y } where each row's signal is available
	let w1max = 0;
	terms.forEach((t, k) => {
		const lits = [...t].sort((a, b) => a.index - b.index);
		if (lits.length >= 2) {
			const g = level1(xG1, rowY[k], lits.length);
			parts.push(g.svg);
			ports.push(...g.ports.in, g.ports.out);
			w1max = Math.max(w1max, g.width);
			lits.forEach((l, j) => {
				const pin = g.ports.in[j];
				const bx = l.negated ? xC(l.index) : xT(l.index);
				net.wire({ x: bx, y: pin.y }, pin);
			});
			rowOut.push(g.ports.out);
		} else {
			const l = lits[0];
			const bx = l.negated ? xC(l.index) : xT(l.index);
			const out = { x: xG1, y: rowY[k] };
			net.wire({ x: bx, y: rowY[k] }, out);
			rowOut.push(out);
		}
	});
	const xOut1 = xG1 + w1max;

	// --- second level and output
	let outPoint;
	if (terms.length === 1) {
		outPoint = { x: xOut1 + 40, y: rowOut[0].y };
		net.wire(rowOut[0], outPoint);
	} else {
		const M = terms.length;
		const yMid = rowY.reduce((s, v) => s + v, 0) / M;
		const xG2 = xOut1 + 24 + M * 8 + 30;
		const g2 = level2(xG2, yMid, M);
		parts.push(g2.svg);
		ports.push(...g2.ports.in, g2.ports.out);
		// fan-in: rows further from the middle get verticals further right, so
		// no vertical crosses another row's horizontal run
		const centre = (M - 1) / 2;
		const rank = terms.map((_, k) => Math.abs(k - centre));
		const order = [...rank].sort((a, b) => a - b);
		terms.forEach((_, k) => {
			const pin = g2.ports.in[k];
			const xMid = xOut1 + 16 + order.indexOf(rank[k]) * 8 + (k > centre ? 4 : 0);
			const from = rowOut[k];
			if (Math.abs(from.y - pin.y) < 0.5) {
				net.wire(from, pin);
			} else {
				net.wire(from, { x: xMid, y: from.y });
				net.wire({ x: xMid, y: from.y }, { x: xMid, y: pin.y });
				net.wire({ x: xMid, y: pin.y }, pin);
			}
		});
		outPoint = { x: g2.ports.out.x + 40, y: g2.ports.out.y };
		net.wire(g2.ports.out, outPoint);
	}
	parts.push(label(outputName, outPoint.x + 6, outPoint.y + 4, { anchor: 'start' }));

	parts.push(net.svg(), net.dots(ports));
	const width = outPoint.x + 40;
	const height = bottomY + 16;
	return { svg: parts.join(''), viewBox: `0 0 ${width} ${height}` };
}

/** Gate count of a two-level implementation, for the summary line. */
export function gateCount(terms, names, form = 'sop') {
	const n = names.length;
	const inverters = names.filter((_, i) => terms.some((t) => t.some((l) => l.index === i && l.negated))).length;
	const first = terms.filter((t) => t.length >= 2).length;
	const second = terms.length >= 2 ? 1 : 0;
	return {
		inverters,
		first,
		second,
		firstType: form === 'sop' ? 'AND' : 'OR',
		secondType: form === 'sop' ? 'OR' : 'AND',
		total: inverters + first + second,
		n
	};
}
