import { RESPONSES } from '../approximations';
import { plannedTopology } from '../bandMethod';
import { check } from './check';
import { comment, header, IND, listWords, noted, PyFile, pyEng, pyList, pyNum, pyRaise, pyStr, section, prose } from './emit';
import { sourceOhms } from './filter';
import { ellipticIntegrals, PLAIN_NAME } from './order';
import { parts } from './parts';
import { discriminationHelper, leastHelper, rebuilt, scaleHelper } from './placement';
import { plot } from './plot';
import { lossCall, lossHelper, lossReal, poles } from './poles';
import { report } from './report';
import { docstring, orderSetting, resultsComment } from './settings';
import { stockOf, stockSettings, typedOf } from './stock';
import { engHelper } from './template';

/**
 * The file of a band filter by transformation (designBandPassTransformed
 * and designBandStopTransformed in stages.js, bandTransformed): one
 * low-pass prototype with its passband edge at the bandwidth B = fh - fl,
 * each stopband edge landing on the prototype at its own Omega
 * (bandStopbandRatio), then every prototype stage turned into band stages:
 *   band-pass  s_lp = (s^2 + w0^2) / s: a pole pair P into the two roots
 *              of s^2 - P s + w0^2 (two band-pass stages, or two notches
 *              with the zeros a prototype zero turns into), the real pole
 *              into one band-pass stage at f0; each held at 1 at f0
 *   band-stop  s_lp = (2 pi B)^2 s / (s^2 + w0^2): the same split with
 *              (2 pi B)^2 / P, every stage a notch held at 1 at DC
 * Section 2 counts the order edge by edge (transformedOrder), section 4
 * places the prototype against both stopband edges (placementWindow with
 * two edges) and denormalizes it to B (lowPassAt), then transforms it. The
 * band-pass stages are bandPass.js's (the MFB band-pass built for the
 * op-amp of panel 01 when the page builds it for one: `gbw` in SETTINGS),
 * the notches boctor.js's and towThomasNotch.js's, each stage on the
 * circuit the page shows for it.
 */
export function transformedFile({ args, design, shown, registry }) {
	const ctx = transformedContext({ args, design, shown, registry });
	const file = new PyFile();
	file.imports.add('math');
	file.imports.add('cmath');
	file.add(docstring(ctx.what, 'template', ctx.detail));
	file.add(transformedSettings(ctx));
	engHelper(file);
	file.add(section('1 The template'));
	file.add(templateCode(ctx));
	file.add(section('2 The order'));
	orderCode(file, ctx);
	file.add(section('3 The normalized poles'));
	poles(file, ctx.proto);
	file.add(section('4 Placement and denormalization'));
	placementCode(file, ctx);
	transformCode(file, ctx);
	file.add(section('5 The parts of each stage'));
	parts(file, ctx);
	file.add(section('6 The check'));
	check(
		file,
		ctx,
		ctx.pass
			? { sides: ['below the band', 'above the band'], comment: checkWords(ctx), rows: ['f"passband, <= {amax:g} dB"', 'f"below the band, >= {amin_low:g} dB"', 'f"above the band, >= {amin_high:g} dB"'] }
			: { comment: checkWords(ctx) }
	);
	report(file, ctx);
	file.add(header('Bode plot'));
	plot(file, ctx, ctx.pass ? BANDPASS_FRAME : BANDSTOP_FRAME);
	return file.text();
}

/** The op-amp the page names for a gain-bandwidth, as SETTINGS' comment says it. */
const OPAMP_WORDS = { TL082: "the TL082 / TL072's", LM741: "the LM741's" };

/**
 * Everything the sections read for a transformed design: the filterContext
 * fields (filter.js), `pass`, the circuit of each stage (the page's, else
 * the one it plans: plannedTopology), the prototype as a side of filter.js
 * for poles.js (`proto`), and `opamp` { gbw, words } when the MFB band-pass
 * stages are built for one (the page's menus.gbw), else null.
 */
function transformedContext({ args, design, shown, registry }) {
	const pass = design.filterType === 'bandpass';
	const bandMenu = args.topologyBand ?? 'mfb';
	const gbw = pass && bandMenu === 'mfb' && Number.isFinite(args.opampGbw) && args.opampGbw > 0 ? args.opampGbw : null;
	const menus = { method: 'transformed', bandpass: bandMenu, notch: args.topologyNotch ?? 'boctor', ...(gbw !== null ? { gbw } : {}) };
	const shownStages = shown?.stages ?? null;
	// (a stage the page cannot build keeps the circuit its menu names)
	const fallback = (stage) => (stage.filterType === 'bandpass' ? (bandMenu === 'towThomas' ? 'towThomasBp' : 'mfbBp') : 'towThomasNotch');
	const stageCircuits = design.stages.map((stage, i) => registry.circuitOf(shownStages?.[i]?.topology ?? plannedTopology(stage, menus).topology ?? fallback(stage)).circuit);
	const used = [...new Set([...stageCircuits, ...(shownStages ?? []).filter(Boolean).map((s) => registry.circuitOf(s.topology).circuit)])];
	// (the stages in words: a band-pass circuit by its own name, a notch by its family's)
	const words = [...new Set(used.map((c) => (registry.familyOf(c).family === 'band-pass' ? registry.label(c) : registry.familyOf(c).family)))];
	const response = design.response;
	const zeros = Boolean(RESPONSES[response]?.zeros);
	const name = PLAIN_NAME[response] ?? response;
	const opamp = gbw !== null && used.includes('mfb_bandpass') ? { gbw, words: OPAMP_WORDS[args.mfbOpamp] ?? 'a single-pole op-amp of the gain-bandwidth set on the page' } : null;
	return {
		args,
		design,
		shown,
		registry,
		type: design.filterType,
		pass,
		lp: false,
		response,
		zeros,
		name,
		stageCircuits,
		placement: design.placement?.mode === 'centred' ? 'centred' : 'edge',
		rs: sourceOhms(args.sourceR),
		stock: stockOf(args),
		typed: typedOf(args.capOverrides),
		circuits: used,
		opamp,
		pageComplete: Boolean(shownStages?.length) && shownStages.every(Boolean),
		what: `Active ${pass ? 'band-pass' : 'band-stop'} filter: ${name} response, from one low-pass prototype.`,
		detail: `The band transformation turns the prototype into ${listWords(words)} stages.`,
		// the prototype, as poles.js reads a side (it reads these alone): its design is the page's (design.lowpass),
		// its real pole a band stage, its amin the one it is built for (section 2)
		proto: { type: 'lowpass', lp: true, response, design: design.lowpass, circuits: { pair: 'band', notch: zeros ? 'band' : null, real: 'band' }, lossReal: lossReal([{ response, design: design.lowpass }]), amax: 'amax', amin: 'amin_s', v: (n) => n }
	};
}

/* ---------------------------------------------------------------- SETTINGS */

function transformedSettings(ctx) {
	const { design, pass } = ctx;
	const lines = [
		header('SETTINGS'),
		...(pass
			? [`fsl = ${pyNum(design.fsl)}  # Hz, the lower stopband edge`, `fl = ${pyNum(design.fl)}  # Hz, the lower passband edge`, `fh = ${pyNum(design.fh)}  # Hz, the upper passband edge`, `fsh = ${pyNum(design.fsh)}  # Hz, the upper stopband edge`]
			: [`fl = ${pyNum(design.fl)}  # Hz, the lower passband edge`, `fsl = ${pyNum(design.fsl)}  # Hz, the lower stopband edge`, `fsh = ${pyNum(design.fsh)}  # Hz, the upper stopband edge`, `fh = ${pyNum(design.fh)}  # Hz, the upper passband edge`]),
		`amax = ${pyNum(design.amaxDb)}  # dB, the most loss allowed over the passband`,
		...(pass
			? [`amin_low = ${pyNum(design.aminDbLow)}  # dB, the least loss required from fsl down`, `amin_high = ${pyNum(design.aminDbHigh)}  # dB, the least loss required from fsh up`]
			: [`amin = ${pyNum(design.aminDbLow)}  # dB, the least loss required from fsl to fsh`]),
		comment("The order is the low-pass prototype's: the filter has twice it, in n second-order stages."),
		orderSetting('order', design),
		`placement = ${pyStr(ctx.placement)}  # "edge": amax exactly at fl and fh; "centred": the middle of the room left`,
		`rs = ${pyNum(ctx.rs)}  # ohm, the source resistance in series with the input (0 for an ideal source)`
	];
	if (ctx.opamp) {
		lines.push(
			comment(`The MFB band-pass stages are built for a single-pole op-amp of this gain-bandwidth, ${ctx.opamp.words}: the file designs and checks them with it, as the page does.`),
			`gbw = ${pyEng(ctx.opamp.gbw)}  # Hz (None for an ideal op-amp)`
		);
	}
	return [lines.join('\n'), stockSettings(ctx), resultsComment(['f0', 'bw', 'omega_low', 'omega_high', 'n', 'wc', 'stages', 'own_parts', 'own_check', 'page_parts', 'page_check'])].join('\n\n');
}

/* ---------------------------------------------------------------- template */

function templateCode(ctx) {
	if (ctx.pass) {
		return [
			comment(
				'A band-pass keeps fl to fh within amax of the top of its passband, and loses at least amin_low from fsl down and amin_high from fsh up; the check (6) reads two decades out from each stopband edge, as the page does. The page builds a band filter one of two ways, the one its Method menu shows (on auto, the one that takes fewer op-amps, the cascade on a tie): here the transformation of one low-pass prototype whose passband edge is the bandwidth B = fh - fl. Its substitution s_lp = (s^2 + w0^2) / s, w0 = 2 pi f0 at the geometric centre f0 = sqrt(fl fh), puts both fl and fh on the passband edge of the prototype, and a stopband edge fs on\n    Omega = |fs^2 - fl fh| / (fs B)\nin units of it, each stopband edge with its own Omega and amin.'
			),
			'if not (0 < fsl < fl < fh < fsh and 0 < amax < amin_low and amax < amin_high):',
			pyRaise('A band-pass needs 0 < fsl < fl < fh < fsh and 0 < amax < amin on each side: see SETTINGS.', IND),
			'f0 = math.sqrt(fl * fh)  # Hz, the geometric centre',
			'bw = fh - fl  # Hz, the bandwidth B',
			'omega_low = abs(fsl * fsl - fl * fh) / (fsl * bw)  # fsl on the prototype',
			'omega_high = abs(fsh * fsh - fl * fh) / (fsh * bw)  # fsh on the prototype',
			'edges = [("fsl", omega_low, amin_low), ("fsh", omega_high, amin_high)]  # (name, Omega, amin)',
			'passband = [(fl, fh, amax)]  # (from Hz, to Hz, the most loss in dB)',
			'stopband = [(fsl / 100, fsl, amin_low), (fsh, fsh * 100, amin_high)]  # (from, to, the least loss)',
			`print(f"  f0 = sqrt(fl fh) = {eng(f0, 'Hz')}, B = fh - fl = {eng(bw, 'Hz')}")`,
			'print(f"  fsl lands on Omega = {omega_low:.4f}, fsh on Omega = {omega_high:.4f}")',
			`print(f"  passband {eng(fl, 'Hz')} to {eng(fh, 'Hz')}: at most {amax:g} dB of loss")`,
			`print(f"  stopband {eng(fsl / 100, 'Hz')} to {eng(fsl, 'Hz')}: at least {amin_low:g} dB of loss")`,
			`print(f"  stopband {eng(fsh, 'Hz')} to {eng(fsh * 100, 'Hz')}: at least {amin_high:g} dB of loss")`
		].join('\n');
	}
	return [
		comment(
			'A band-stop keeps fl and below and fh and above within amax of the top of its passband, and loses at least amin from fsl to fsh; the check (6) reads two decades out from each passband edge, as the page does. The page builds a band filter one of two ways, the one its Method menu shows (on auto, the one that takes fewer op-amps, the cascade on a tie): here the transformation of one low-pass prototype whose passband edge is the bandwidth B = fh - fl. Its substitution s_lp = (2 pi B)^2 s / (s^2 + w0^2), w0 = 2 pi f0 at the geometric centre f0 = sqrt(fl fh), puts both fl and fh on the passband edge of the prototype, and a stopband edge fs on\n    Omega = fs B / |fs^2 - fl fh|\nin units of it, each stopband edge with its own Omega.'
		),
		'if not (0 < fl < fsl < fsh < fh and 0 < amax < amin):',
		pyRaise('A band-stop needs 0 < fl < fsl < fsh < fh and 0 < amax < amin: see SETTINGS.', IND),
		'f0 = math.sqrt(fl * fh)  # Hz, the geometric centre',
		'bw = fh - fl  # Hz, the bandwidth B',
		'omega_low = fsl * bw / abs(fsl * fsl - fl * fh)  # fsl on the prototype',
		'omega_high = fsh * bw / abs(fsh * fsh - fl * fh)  # fsh on the prototype',
		'edges = [("fsl", omega_low, amin), ("fsh", omega_high, amin)]  # (name, Omega, amin)',
		comment('(from Hz, to Hz, the most loss in dB) and (from Hz, to Hz, the least loss in dB):'),
		'passband = [(fl / 100, fl, amax), (fh, fh * 100, amax)]',
		'stopband = [(fsl, fsh, amin)]',
		`print(f"  f0 = sqrt(fl fh) = {eng(f0, 'Hz')}, B = fh - fl = {eng(bw, 'Hz')}")`,
		'print(f"  fsl lands on Omega = {omega_low:.4f}, fsh on Omega = {omega_high:.4f}")',
		`print(f"  passband to {eng(fl, 'Hz')} and from {eng(fh, 'Hz')}: at most {amax:g} dB of loss")`,
		`print(f"  stopband {eng(fsl, 'Hz')} to {eng(fsh, 'Hz')}: at least {amin:g} dB of loss")`
	].join('\n');
}

/* ------------------------------------------------------------------- order */

/**
 * Section 2 (transformedOrder in stages.js). A response whose stopband keeps
 * falling needs each stopband edge met on its own: n is the larger of the two
 * edge orders, closed form (Butterworth, Chebyshev I) or the page's search
 * (Bessel, Legendre: its losses written in). A response with zeros keeps one
 * floor from its stopband edge on: n is counted for the closer edge and the
 * larger amin together, and the page may then lower it with a stopband edge
 * of its own fitting (written in). Defines n, and the prototype's k and
 * amin_s where poles.js or the placement read them.
 */
function orderCode(file, ctx) {
	const { response } = ctx;
	if (response === 'butterworth' || response === 'chebyshev') {
		const butter = response === 'butterworth';
		// (Omega is the 1/k of the low-pass formulas: the order is written with it straight)
		file.add(
			[
				comment(
					butter
						? 'Butterworth loses 10 log10(1 + eps^2 Omega^(2n)) at Omega on the prototype, eps^2 = 10^(amax/10) - 1, so each stopband edge needs\n    n >= log10((10^(amin/10) - 1) / (10^(amax/10) - 1)) / (2 log10(Omega))\nwith its own amin, and the prototype takes the larger of the two (Omega is the 1/k of a low-pass).'
						: 'Chebyshev I loses 10 log10(1 + eps^2 cosh(n acosh(Omega))^2) past its edge, eps^2 = 10^(amax/10) - 1, so each stopband edge needs\n    n >= acosh(sqrt((10^(amin/10) - 1) / (10^(amax/10) - 1))) / acosh(Omega)\nwith its own amin, and the prototype takes the larger of the two (Omega is the 1/k of a low-pass).'
				),
				'n_min = 1',
				'for name, omega, amin_edge in edges:',
				'    ratio = (10 ** (amin_edge / 10) - 1) / (10 ** (amax / 10) - 1)',
				butter ? '    n_exact = math.log10(ratio) / (2 * math.log10(omega))' : '    n_exact = math.acosh(math.sqrt(ratio)) / math.acosh(omega)',
				'    n_min = max(n_min, math.ceil(n_exact))',
				'    print(f"  {name}: Omega = {omega:.4f}, n >= {n_exact:.4f}")',
				'n = n_min if order is None else order',
				'print(f"  so n = {n}")'
			].join('\n')
		);
		return;
	}
	if (response === 'bessel' || response === 'legendre') {
		searchedOrderCode(file, ctx);
		return;
	}
	zerosOrderCode(file, ctx);
}

/** Bessel and Legendre: the page's losses at each stopband edge, n = 1, 2, ..., behind a guard. */
function searchedOrderCode(file, ctx) {
	const { design, name } = ctx;
	const [low, high] = design.orderInfo.edges;
	const tried = (edge) => (edge.tried ?? []).map((t) => pyNum(t.loss));
	// the prototype is built for the edge that binds (transformedOrder: on a tie, the closer one)
	const source = design.orderInfo.binding === 'low' ? 'low' : design.orderInfo.binding === 'high' ? 'high' : high.omega < low.omega || (high.omega === low.omega && high.aminDb > low.aminDb) ? 'high' : 'low';
	const ampWord = prose(design.amaxDb);
	file.add(
		[
			comment(
				`${name} has no closed form for its order: n = 1, 2, ... is tried until the loss at each stopband edge reaches its amin. The losses there (dB, at Omega in units of the prototype's passband edge) of the prototypes the page builds for amax = ${ampWord} dB, for n = 1, 2, ...:`
			),
			pyList('losses_low', tried(low), `at fsl, Omega = ${prose(low.omega)}`),
			pyList('losses_high', tried(high), `at fsh, Omega = ${prose(high.omega)}`),
			`if not (math.isclose(amax, ${pyNum(design.amaxDb)}) and math.isclose(omega_low, ${pyNum(low.omega)})`,
			`        and math.isclose(omega_high, ${pyNum(high.omega)})):`,
			pyRaise(`The ${name} losses here are the page's for amax = ${ampWord} dB and these band edges: for other settings, get the file again from the page.`, IND),
			'n_min = 1',
			'for (name, omega, amin_edge), losses in zip(edges, (losses_low, losses_high)):',
			'    enough = [i + 1 for i, loss in enumerate(losses) if loss >= amin_edge]',
			'    if not enough:',
			'        raise SystemExit(f"None of the orders written here reaches amin at {name}: get the file"',
			'                         " again from the page.")',
			'    n_min = max(n_min, enough[0])',
			'    print(f"  {name}: Omega = {omega:.4f}, the loss there first reaches amin with n = {enough[0]}"',
			'          f" ({losses[enough[0] - 1]:.2f} dB)")',
			'n = n_min if order is None else order',
			'print(f"  so n = {n}")',
			comment(`The prototype is built for ${source === 'low' ? 'fsl' : 'fsh'}, the edge that needs the larger order (the closer edge on a tie):`),
			`k = 1 / omega_${source}  # its transition ratio`,
			`amin_s = ${ctx.pass ? `amin_${source}` : 'amin'}  # dB, its amin`
		].join('\n')
	);
}

/**
 * Inverse Chebyshev and elliptic: the closed form at the closer edge with
 * the larger amin, and the order the page lowers it to with a stopband
 * edge of its own fitting (orderInfo.lowered), written in.
 */
function zerosOrderCode(file, ctx) {
	const { design, response } = ctx;
	const info = design.orderInfo;
	const ellip = response === 'elliptic';
	if (ellip) ellipticIntegrals(file);
	const lines = [
		comment(
			ellip
				? "An elliptic prototype keeps one floor from its own stopband edge on, so it is counted for the closer stopband edge and the larger amin together (the larger of the two edge orders can leave the far edge short), with the degree equation:\n    n >= K(k^2) K'(k1^2) / (K'(k^2) K(k1^2)),  k = 1/Omega\nk1 = eps / eps_s the discrimination, eps and eps_s the ripple factors of amax and amin."
				: 'An inverse Chebyshev prototype keeps one floor from its own stopband edge on, so it is counted for the closer stopband edge and the larger amin together (the larger of the two edge orders can leave the far edge short), with eps and eps_s the ripple factors of amax and that amin:\n    n >= acosh(eps_s / eps) / acosh(1/k),  k = 1/Omega'
		),
		'omega_s = min(omega_low, omega_high)  # the closer stopband edge',
		ctx.pass ? 'amin_s = max(amin_low, amin_high)  # dB, the larger amin' : 'amin_s = amin  # dB',
		'k = 1 / omega_s  # the transition ratio the prototype is built for'
	];
	if (ellip) {
		lines.push('k1_sq = (10 ** (amax / 10) - 1) / (10 ** (amin_s / 10) - 1)', 'n_exact = ellip_k(k * k) * ellip_kp(k1_sq) / (ellip_kp(k * k) * ellip_k(k1_sq))');
	} else {
		lines.push('eps = math.sqrt(10 ** (amax / 10) - 1)', 'eps_s = math.sqrt(10 ** (amin_s / 10) - 1)', 'n_exact = math.acosh(eps_s / eps) / math.acosh(1 / k)');
	}
	const lowered = info.lowered;
	if (!lowered) {
		lines.push('n = max(1, math.ceil(n_exact)) if order is None else order', 'print(f"  Omega = {omega_s:.4f} and amin = {amin_s:g} dB: n >= {n_exact:.4f}, so n = {n}")');
		file.add(lines.join('\n'));
		return;
	}
	// the page's lower order and its stopband edge (bandEquirippleFit), behind a guard on what they came from;
	// an order set on the page under the closed-form count has an edge of its own fitting (bandPrototypeSpec)
	const amins = ctx.pass ? `math.isclose(amin_low, ${pyNum(design.aminDbLow)}) and math.isclose(amin_high, ${pyNum(design.aminDbHigh)})` : `math.isclose(amin, ${pyNum(design.aminDbLow)})`;
	const refit = design.n !== info.n && design.n < lowered.from;
	lines.push(
		'print(f"  Omega = {omega_s:.4f} and amin = {amin_s:g} dB: n >= {n_exact:.4f}")',
		comment(
			`The closer edge needs less than the far one here, and the closed form asks one order or more too many: the page tries the orders from the larger edge order up, each with the stopband edge that leaves both edges the most room, and keeps the first that meets both, n = ${info.n} with its stopband edge at Omega = ${prose(1 / info.k)}.${refit ? ` For the order set on the page, n = ${design.n}, it fits the edge again: Omega = ${prose(1 / design.lowpass.k)}.` : ''} ${refit ? 'Those orders and edges are' : 'That order and that edge are'} the page's search, written in:`
		),
		`if not (math.isclose(amax, ${pyNum(design.amaxDb)}) and math.isclose(omega_low, ${pyNum(info.omegaLow)})`,
		`        and math.isclose(omega_high, ${pyNum(info.omegaHigh)})`,
		`        and ${amins}):`,
		pyRaise("The lower order here is the page's for these settings: for others, get the file again from the page.", IND),
		`if order is None or order == ${info.n}:`,
		noted(`n, k = ${info.n}, ${pyNum(info.k)}`, "the lowest order the page's search keeps, and its transition ratio", '    '),
		`    amin_s = ${pyNum(info.aminDb)}  # dB, the floor the prototype then reaches`,
		...(refit
			? [`elif order == ${design.n}:`, noted(`n, k = ${design.n}, ${pyNum(design.lowpass.k)}`, 'the order set on the page, its stopband edge fitted again', '    '), `    amin_s = ${pyNum(design.lowpass.aminDb)}  # dB, the floor the prototype then reaches`]
			: []),
		`elif order < ${lowered.from}:`,
		pyRaise(`The page fits the stopband edge again for an order under ${lowered.from}: get the file again from the page for it.`, IND),
		'else:',
		'    n = order',
		'print(f"  the page\'s search: n = {n}, the stopband edge at Omega = {1 / k:.4f}")'
	);
	file.add(lines.join('\n'));
}

/* ----------------------------------------------------- placement, prototype */

/** Both stopband edges in the Python the placement reads: (Omega, amin) pairs. */
const EDGE_PAIRS = 'for _, omega, amin_edge in edges';

/**
 * Section 4, first part: the placement against both stopband edges
 * (placementWindow in stages.js with two edges), then the prototype
 * denormalized to the bandwidth (lowPassAt): wc, and its sections and real
 * pole in rad/s.
 */
function placementCode(file, ctx) {
	const { design, response } = ctx;
	const proto = design.lowpass;
	if (response === 'chebyshev' || response === 'elliptic') {
		rippleCode(file, ctx, proto);
		return;
	}
	const butter = response === 'butterworth';
	const zeros = ctx.zeros;
	if (!butter) {
		lossHelper(file, zeros, ctx.proto.lossReal);
		scaleHelper(file);
		if (zeros) leastHelper(file);
	}
	const lines = [
		comment(
			`The whole order n leaves room: the ideal design can lose exactly amax at fl and fh and still keep more than amin at each stopband edge. Every frequency of the prototype is multiplied by a scale sigma, from 1 (amax exactly at fl and fh) to sigma_s, where the first stopband edge loses exactly its amin; "edge" takes sigma = 1, "centred" the geometric middle, sqrt(sigma_s). ${butter ? 'For Butterworth, edge by edge\n    sigma_s = Omega (eps / eps_s)^(1/n)\nwith eps and eps_s the ripple factors of amax and of that edge\'s amin.' : 'Each edge\'s sigma_s is found by bisection, as the page finds it.'}`
		)
	];
	if (butter) {
		lines.push('eps = math.sqrt(10 ** (amax / 10) - 1)', `sigma_s = min(omega * (eps / math.sqrt(10 ** (amin_edge / 10) - 1)) ** (1 / n)`, `              ${EDGE_PAIRS})`);
	} else if (zeros) {
		lines.push(
			comment('An inverse Chebyshev is read on its least loss from w on (least_loss): past its stopband edge it never drops under its floor.'),
			'last = 1 / (k * math.sin(math.pi / (2 * n))) if n % 2 else math.inf  # its last minimum',
			`sigma_s = min(scale_for(lambda w: least_loss(sections, real, w, floor, last), omega, amin_edge)`,
			`              ${EDGE_PAIRS})`
		);
	} else {
		lines.push(`sigma_s = min(scale_for(lambda w: ${lossCall(ctx.proto, 'sections', 'real', 'w')}, omega, amin_edge)`, `              ${EDGE_PAIRS})`);
	}
	lines.push(
		'sigma = math.sqrt(sigma_s) if placement == "centred" and sigma_s >= 1 else 1.0',
		'print(f"  scale sigma from 1 to {sigma_s:.4f} (amin at a stopband edge); {placement}: {sigma:.4f}")',
		comment(
			butter
				? "The unit circle loses 3 dB at w = 1: its radius moves to eps^(-1/n) to lose amax at the prototype's passband edge 2 pi B, and\n    s -> s / wc,  wc = 2 pi B eps^(-1/n) sigma"
				: "The prototype loses amax at w = 1, its passband edge, which goes to 2 pi B:\n    s -> s / wc,  wc = 2 pi B sigma"
		),
		butter ? 'wc = 2 * math.pi * bw * eps ** (-1 / n) * sigma  # rad/s' : 'wc = 2 * math.pi * bw * sigma  # rad/s',
		butter ? 'print(f"  wc = 2 pi B eps^(-1/n) sigma = {wc:.6g} rad/s")' : 'print(f"  wc = 2 pi B sigma = {wc:.6g} rad/s")'
	);
	file.add(lines.join('\n'));
}

/** The ripple placement of Chebyshev I and elliptic against both edges. */
function rippleCode(file, ctx, proto) {
	const cheb = ctx.response === 'chebyshev';
	const lines = [];
	if (cheb) {
		lines.push(
			comment(
				'The whole order n leaves room: the ripple can shrink from amax down to the one that leaves exactly its amin at the first stopband edge, the band edges staying on fl and fh. In ripple factors, from eps_max (amax) down to the larger over both edges of\n    eps_min = eps_s / cosh(n acosh(Omega))\nwith eps_s from that edge\'s amin. "edge" keeps eps_max; "centred" takes the geometric middle, eps = sqrt(eps_min eps_max), and builds the poles again for its ripple.'
			),
			'eps_max = math.sqrt(10 ** (amax / 10) - 1)',
			'eps_min = max(math.sqrt(10 ** (amin_edge / 10) - 1) / math.cosh(n * math.acosh(omega))',
			`              ${EDGE_PAIRS})`,
			'centred = placement == "centred" and eps_min <= eps_max',
			'eps = math.sqrt(eps_min * eps_max) if centred else eps_max',
			'ripple = 10 * math.log10(1 + eps * eps)  # dB, the passband ripple',
			'print(f"  eps from {eps_min:.4f} to {eps_max:.4f}; {placement}: eps = {eps:.4f}, a ripple of"',
			'      f" {ripple:.4f} dB")',
			rebuilt(ctx.proto, 'ripple')
		);
	} else {
		const chosen = proto.placement?.rippleDb?.chosen ?? ctx.design.amaxDb;
		// (each stopband edge on the floor, 1/k on, by the page's own test (placementWindow): an edge that sits
		// on 1/k to the last digit can fall under it, and the page then reads both edges by bisection, the far
		// one by its own loss, which the closed form below does not; the file follows the page's branch)
		const omegas = [ctx.design.orderInfo.omegaLow, ctx.design.orderInfo.omegaHigh];
		const floorAll = omegas.every((omega) => omega >= 1 / proto.k);
		const onEdge = !floorAll && omegas.every((omega) => omega * proto.k >= 1 - 1e-9);
		// (on the passband edge the ripple is amax, which section 3's guard holds with the placement)
		const centred = ctx.placement === 'centred';
		const guard = centred ? [`if not math.isclose(ripple, ${pyNum(chosen)}):`, pyRaise(`The elliptic poles in 3 are the page's for a ripple of ${prose(chosen)} dB, the centred placement: for another ripple or placement, get the file again from the page.`, IND)] : [];
		if (floorAll) {
			discriminationHelper(file);
			lines.push(
				comment(
					'The whole order n leaves room: the ripple can shrink from amax down to the one that leaves exactly the larger amin on the floor, both stopband edges at 1/k or past it. In ripple factors, from eps_max (amax) down to\n    eps_min = k1 eps_s\nwith eps_s from that amin and k1 the discrimination the order n reaches at this k. "edge" keeps eps_max; "centred" takes the geometric middle, eps = sqrt(eps_min eps_max).'
				),
				'eps_max = math.sqrt(10 ** (amax / 10) - 1)',
				'eps_min = math.sqrt(discrimination(n, k * k)) * max(math.sqrt(10 ** (amin_edge / 10) - 1)',
				`                                                  ${EDGE_PAIRS})`,
				'centred = placement == "centred" and eps_min <= eps_max',
				'eps = math.sqrt(eps_min * eps_max) if centred else eps_max',
				'ripple = 10 * math.log10(1 + eps * eps)  # dB, the passband ripple',
				...guard,
				'print(f"  eps from {eps_min:.4f} to {eps_max:.4f}; {placement}: eps = {eps:.4f}, a ripple of"',
				'      f" {ripple:.4f} dB")'
			);
		} else if (!centred) {
			lines.push(comment('On the passband edge the ripple is amax (section 3 holds the placement and amax).'), 'ripple = amax  # dB', 'print(f"  edge: a ripple of {ripple:.4f} dB")');
		} else {
			// (the centred ripple hangs on every edge and limit: amin and Omega too)
			const held = [
				`math.isclose(amax, ${pyNum(ctx.design.amaxDb)})`,
				...(ctx.pass ? [`math.isclose(amin_low, ${pyNum(ctx.design.aminDbLow)})`, `math.isclose(amin_high, ${pyNum(ctx.design.aminDbHigh)})`] : [`math.isclose(amin, ${pyNum(ctx.design.aminDbLow)})`]),
				`math.isclose(omega_low, ${pyNum(ctx.design.orderInfo.omegaLow)})`,
				`math.isclose(omega_high, ${pyNum(ctx.design.orderInfo.omegaHigh)})`
			];
			lines.push(
				comment(
					onEdge
						? `The nearer stopband edge sits on 1/k, the page's test putting it a hair under, so the page finds the smallest ripple by bisection, the far edge read by its own loss rather than the floor, on elliptic prototypes, which the file does not build: its ripple, ${prose(chosen)} dB for the centred placement, is written in.`
						: `A stopband edge sits in the transition band of this prototype (under 1/k), where the page finds the smallest ripple by bisection on elliptic prototypes, which the file does not build: its ripple, ${prose(chosen)} dB for the centred placement, is written in.`
				),
				`if not (placement == "centred"`,
				...held.map((h, i) => `        and ${h}${i === held.length - 1 ? '):' : ''}`),
				pyRaise(`The elliptic poles in 3 are the page's for amax = ${prose(ctx.design.amaxDb)} dB, these band edges and limits, and the centred placement: for others, get the file again from the page.`, IND),
				`ripple = ${pyNum(chosen)}  # dB, the page's`,
				'print(f"  centred: a ripple of {ripple:.4f} dB")'
			);
		}
	}
	lines.push(comment("The prototype's edge is its ripple edge, which goes to 2 pi B:\n    s -> s / wc,  wc = 2 pi B"), 'wc = 2 * math.pi * bw  # rad/s', 'print(f"  wc = 2 pi B = {wc:.6g} rad/s")');
	file.add(lines.join('\n'));
}

/* ---------------------------------------------------------- transformation */

/**
 * Section 4, second part: each prototype stage in rad/s, then turned into
 * band stages (bandTransformed in stages.js), and the circuit of each.
 */
function transformCode(file, ctx) {
	const { pass, zeros } = ctx;
	const one = pass && !zeros ? ctx.stageCircuits[0] : null;
	const lines = [];
	if (pass) {
		lines.push(
			comment(
				`Each pole pair of the prototype, with wn = wc sqrt(b) and Q = sqrt(b) / a, is the pole\n    P = -wn / (2 Q) + j wn sqrt(1 - 1 / (4 Q^2))\nand s_lp = (s^2 + w0^2) / s turns its factor s - P into s^2 - P s + w0^2: two stages, its two roots (split, below). ${zeros ? 'A zero of the prototype at wz = wc sqrt(z) turns into the two zeros\n    wz / 2 + sqrt(wz^2 / 4 + w0^2) and w0^2 over it\nthe upper one with the upper stage (a low-pass notch), the lower one with the lower stage (a high-pass notch). ' : ''}The real pole -1/tau, tau = 1 / (wc real), turns into one band-pass stage at f0 with Q = w0 tau. Every stage is held at exactly 1 at f0, and so is the whole filter: a band-pass stage at its own centre at the gain\n    G = sqrt(1 + Q^2 (fn / f0 - f0 / fn)^2)${zeros ? '\na notch far above its zero at the gain\n    |wn^2 - w0^2 + j wn w0 / Q| / |wz^2 - w0^2|' : ''}`
			),
			'w0 = 2 * math.pi * f0  # rad/s'
		);
	} else {
		lines.push(
			comment(
				`Each pole pair of the prototype, with wn = wc sqrt(b) and Q = sqrt(b) / a, is the pole\n    P = -wn / (2 Q) + j wn sqrt(1 - 1 / (4 Q^2))\nand s_lp = (2 pi B)^2 s / (s^2 + w0^2) turns its factor s - P into\n    s^2 - ((2 pi B)^2 / P) s + w0^2\ntwo notch stages, its two roots (split, below), ${zeros ? 'their zeros the two a zero of the prototype at wz = wc sqrt(z) turns into,\n    r / 2 + sqrt(r^2 / 4 + w0^2) and w0^2 over it, r = (2 pi B)^2 / wz\nthe lower one with the lower stage' : 'both with their zeros at w0'}. The real pole -1/tau, tau = 1 / (wc real), turns into one notch at f0 with Q = w0 / ((2 pi B)^2 tau). Every stage is held at 1 at DC, so the whole filter passes 1 at DC and far above the band: a notch's gain far above its zero is then\n    (wn / wz)^2`
			),
			'w0 = 2 * math.pi * f0  # rad/s',
			'bw_rad = 2 * math.pi * bw  # rad/s, the prototype\'s passband edge'
		);
	}
	lines.push(
		'',
		'',
		'def split(p):',
		'    """The two roots of s^2 - p s + w0^2 = 0, as (wn, Q) with wn in rad/s, the lower one first:',
		'    they multiply to w0^2, so they sit on either side of w0 on a log scale, with one Q."""',
		'    d = cmath.sqrt(p * p - 4 * w0 * w0)',
		'    r = (p + d) / 2 if abs(p + d) >= abs(p - d) else (p - d) / 2  # the larger root, then the other',
		'    return sorted((abs(x), abs(x) / (-2 * x.real)) for x in (r, w0 * w0 / r))'
	);
	// the stage builders
	if (pass) {
		lines.push(
			'',
			'',
			'def bandpass_stage(wn, q):',
			'    """A band-pass stage at wn (rad/s), held at its own centre at the gain G that leaves it at',
			'    1 at f0."""',
			one
				? `    return {"circuit": ${pyStr(one)}, "f0": wn / (2 * math.pi), "q": q,`
				: '    return {"f0": wn / (2 * math.pi), "q": q,',
			'            "gain": math.sqrt(1 + q * q * (wn / w0 - w0 / wn) ** 2)}'
		);
	}
	if (zeros || !pass) {
		lines.push(
			'',
			'',
			'def notch_stage(wn, q, wz):',
			pass
				? '    """A notch stage at wn with its zero at wz (rad/s), held at 1 at f0 by its gain far above the\n    zero (a Tow-Thomas notch is built for it; Boctor\'s sets its own, the page keeping it near)."""'
				: '    """A notch stage at wn with its zero at wz (rad/s), held at 1 at DC: its gain far above the zero\n    is (wn / wz)^2 (a Tow-Thomas notch is built for it; Boctor\'s sets its own)."""',
			'    return {"f0": wn / (2 * math.pi), "q": q, "fz": wz / (2 * math.pi),',
			pass ? '            "gain": abs(complex(wn * wn - w0 * w0, wn * w0 / q)) / abs(wz * wz - w0 * w0)}' : '            "gain": (wn / wz) ** 2}'
		);
	}
	if (zeros) {
		lines.push(
			'',
			'',
			'def zero_pair(r):',
			'    """The two zeros (rad/s) a prototype zero turns into, the lower one first."""',
			'    hi = r / 2 + math.sqrt(r * r / 4 + w0 * w0)',
			'    return w0 * w0 / hi, hi'
		);
	}
	lines.push('', '');
	// the loop over the prototype
	const pole = '    p = complex(-wn / (2 * q), wn * math.sqrt(max(0.0, 1 - 1 / (4 * q * q))))';
	if (pass && !zeros) {
		lines.push(
			'stages = []  # the target of each stage, in the order of the prototype\'s',
			'for a, b in sections:',
			'    wn, q = wc * math.sqrt(b), math.sqrt(b) / a',
			pole,
			'    for wb, qb in split(p):',
			'        stages.append(bandpass_stage(wb, qb))',
			'if real is not None:',
			'    stages.append(bandpass_stage(w0, w0 / (wc * real)))  # Q = w0 tau'
		);
	} else if (pass) {
		lines.push(
			'stages = []  # the target of each stage, in the order of the prototype\'s',
			'for a, b, z in sections:',
			'    wn, q = wc * math.sqrt(b), math.sqrt(b) / a',
			pole,
			'    (wl, ql), (wu, qu) = split(p)',
			'    zl, zu = zero_pair(wc * math.sqrt(z))',
			'    stages += [notch_stage(wl, ql, zl), notch_stage(wu, qu, zu)]',
			'if real is not None:',
			'    stages.append(bandpass_stage(w0, w0 / (wc * real)))  # Q = w0 tau'
		);
	} else {
		lines.push(
			'stages = []  # the target of each stage, in the order of the prototype\'s',
			zeros ? 'for a, b, z in sections:' : 'for a, b in sections:',
			'    wn, q = wc * math.sqrt(b), math.sqrt(b) / a',
			pole,
			'    (wl, ql), (wu, qu) = split(bw_rad * bw_rad / p)',
			// (a prototype without zeros gives every notch its zero at w0)
			...(zeros ? ['    zl, zu = zero_pair(bw_rad * bw_rad / (wc * math.sqrt(z)))', '    stages += [notch_stage(wl, ql, zl), notch_stage(wu, qu, zu)]'] : ['    stages += [notch_stage(wl, ql, w0), notch_stage(wu, qu, w0)]']),
			'if real is not None:',
			'    q = w0 * wc * real / (bw_rad * bw_rad)  # Q = w0 / ((2 pi B)^2 tau)',
			'    stages.append(notch_stage(w0, q, w0))'
		);
	}
	// the circuit of each stage, the page's
	if (!one) {
		const names = ctx.stageCircuits.map(pyStr);
		lines.push(
			comment(
				`The circuit of each stage, as the page builds them, for n = ${ctx.design.n}${ctx.args.topologyNotch === 'towThomas' ? '' : ": Boctor's notch where its search finds parts that keep the stage's level and its zero (bandMethod.js), else the Tow-Thomas notch"}:`
			),
			pyList('circuits', names),
			'if len(circuits) != len(stages):',
			pyRaise(`The circuits written here are the page's for n = ${ctx.design.n}: for another order, get the file again from the page.`, IND),
			'for st, circuit in zip(stages, circuits):',
			'    st["circuit"] = circuit'
		);
	}
	lines.push(
		'for i, st in enumerate(stages):',
		// (what each stage has: a band-pass stage its centre gain, a notch its zero; a band-pass with zeros both kinds)
		...(pass && !zeros
			? ['    print(f"  stage {i + 1}: f0 = {eng(st[\'f0\'], \'Hz\')}, Q = {st[\'q\']:.4f},"', '          f" gain {st[\'gain\']:.4f} at its centre")']
			: pass
				? [
						'    kind = f"fz = {eng(st[\'fz\'], \'Hz\')}" if "fz" in st else f"gain {st[\'gain\']:.4f} at its centre"',
						'    print(f"  stage {i + 1}: f0 = {eng(st[\'f0\'], \'Hz\')}, Q = {st[\'q\']:.4f}, {kind}")'
					]
				: ['    print(f"  stage {i + 1}: f0 = {eng(st[\'f0\'], \'Hz\')}, Q = {st[\'q\']:.4f},"', '          f" fz = {eng(st[\'fz\'], \'Hz\')}")'])
	);
	file.add(lines.join('\n'));
}

/* ------------------------------------------------------------------- check */

function checkWords(ctx) {
	const every = ctx.stageCircuits.every((c) => c === 'mfb_bandpass');
	const opamps = !ctx.opamp ? 'ideal op-amps' : every ? 'the single-pole op-amp of gbw the MFB band-pass stages are built for' : 'ideal op-amps but for the MFB band-pass stages, read with the single-pole op-amp of gbw they are built for';
	return ctx.pass
		? `Each set of parts goes through each stage's H(s), written from its parts with ${opamps}, and rs in series with the input, and is read as the page reads its template: from the top of the passband (401 points from fl to fh), the worst passband loss against amax (0.05 dB of slack), and the least stopband loss of each side against its amin (801 points a stretch).`
		: `Each set of parts goes through each stage's H(s), written from its parts with ${opamps} and rs in series with the input, and is read as the page reads its template: from the top of the passband (401 points a stretch), the worst passband loss against amax (0.05 dB of slack) and the least stopband loss against amin (801 points).`;
}

/* -------------------------------------------------------------------- plot */

const BANDPASS_FRAME = {
	points: 'fsl / 10, fsl, fl, f0, fh, fsh, fsh * 10',
	span: ['fsl / 10', 'fsh * 10'],
	limits: [
		'plt.hlines(-amax, fl, fh, colors="0.5", linestyles="--", label="amax and amin")',
		'plt.hlines(-amin_low, lo, fsl, colors="0.5", linestyles="--")',
		'plt.hlines(-amin_high, fsh, hi, colors="0.5", linestyles="--")'
	]
};

const BANDSTOP_FRAME = {
	points: 'fl / 10, fl, fsl, f0, fsh, fh, fh * 10',
	span: ['fl / 10', 'fh * 10'],
	limits: [
		'plt.hlines(-amax, lo, fl, colors="0.5", linestyles="--", label="amax and amin")',
		'plt.hlines(-amax, fh, hi, colors="0.5", linestyles="--")',
		'plt.hlines(-amin, fsl, fsh, colors="0.5", linestyles="--")'
	]
};
