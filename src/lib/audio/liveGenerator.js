import oscillatorSrc from './oscillator.js?raw';

/**
 * Live signal generator on the computer's audio output: two independent
 * channels (left, right) synthesized sample by sample inside an
 * AudioWorklet, from the same engine the Stereo tool renders files with.
 *
 * The worklet's code is assembled at run time from oscillator.js (inlined
 * verbatim, exports stripped) plus a small processor class, and loaded
 * from a Blob URL: no separate file to keep in sync, and the live output
 * can never drift from what the file renderer produces.
 *
 * Browsers only open the audio output after a user gesture, so start()
 * must be called from a click. The context is kept between stop() and
 * start(); stop() fades both channels out over the generator's smoothing
 * time before suspending, so neither end clicks.
 */

const PROCESSOR = 'rbt56-signal-generator';
const SMOOTHING = 0.005; // s, slew on level changes and on/off

function workletSource() {
	const engine = oscillatorSrc
		.split('\n')
		.filter((line) => !/^import\s/.test(line))
		.join('\n')
		.replace(/^export\s+/gm, '');
	return `${engine}

class SignalGeneratorProcessor extends AudioWorkletProcessor {
	constructor() {
		super();
		const silent = { type: 'sine', frequency: 1000, amplitude: 0, offset: 0, phase: 0, symmetry: 50 };
		this.gens = [0, 1].map(() => createGenerator({ wave: silent, sampleRate, smoothing: ${SMOOTHING}, gate: 0 }));
		this.port.onmessage = (e) => {
			const { channel, wave, modulation, gate } = e.data;
			const g = this.gens[channel];
			if (g) g.set({ wave, modulation, gate });
			this.sweeping[channel] = !!(wave && wave.sweep);
		};
		// a running sweep reports how far it has gone, about 20 times a second,
		// so the page can show the frequency being played right now
		this.sweeping = [false, false];
		this.untilReport = 0;
	}
	process(inputs, outputs) {
		const out = outputs[0];
		for (let c = 0; c < out.length; c++) {
			if (this.gens[c]) this.gens[c].fill(out[c]);
			else out[c].fill(0);
		}
		this.untilReport -= out[0] ? out[0].length : 128;
		if (this.untilReport <= 0 && (this.sweeping[0] || this.sweeping[1])) {
			this.untilReport = sampleRate / 20;
			this.port.postMessage({ sweepTimes: this.gens.map((g, c) => (this.sweeping[c] ? g.sweepTime : null)) });
		}
		return true;
	}
}
registerProcessor('${PROCESSOR}', SignalGeneratorProcessor);
`;
}

/** Structured clone cannot carry a reactive proxy, so settings go over as plain data. */
const plain = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

export class LiveGenerator {
	ctx = null;
	node = null;
	analysers = [];
	error = null;
	// seconds into each channel's running sweep, as last reported by the worklet
	sweepTimes = [null, null];
	onsweep = null;

	get running() {
		return !!this.ctx && this.ctx.state === 'running';
	}

	get sampleRate() {
		return this.ctx ? this.ctx.sampleRate : null;
	}

	/** Output latency the browser reports, in seconds, or null before start. */
	get latency() {
		if (!this.ctx) return null;
		return this.ctx.outputLatency || this.ctx.baseLatency || null;
	}

	/**
	 * Opens the output (or resumes it). `sampleRate` asks the browser for a
	 * rate; what it actually runs at is read back from sampleRate. Whether
	 * the hardware follows a request is not visible from a page.
	 */
	async start({ sampleRate = null } = {}) {
		this.error = null;
		if (this.ctx) {
			await this.ctx.resume();
			return;
		}
		if (typeof AudioContext === 'undefined') {
			this.error = 'This browser has no Web Audio support.';
			return;
		}
		const options = { latencyHint: 'interactive' };
		if (sampleRate) options.sampleRate = sampleRate;
		let ctx;
		try {
			ctx = new AudioContext(options);
		} catch {
			// a rate the browser refuses: fall back to its default
			ctx = new AudioContext({ latencyHint: 'interactive' });
		}
		if (!ctx.audioWorklet) {
			this.error = 'This browser has no AudioWorklet support.';
			await ctx.close();
			return;
		}
		const url = URL.createObjectURL(new Blob([workletSource()], { type: 'application/javascript' }));
		try {
			await ctx.audioWorklet.addModule(url);
		} finally {
			URL.revokeObjectURL(url);
		}
		const node = new AudioWorkletNode(ctx, PROCESSOR, { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
		const splitter = ctx.createChannelSplitter(2);
		const analysers = [0, 1].map(() => {
			const a = ctx.createAnalyser();
			a.fftSize = 4096;
			a.smoothingTimeConstant = 0;
			return a;
		});
		node.port.onmessage = (e) => {
			if (e.data && e.data.sweepTimes) {
				this.sweepTimes = e.data.sweepTimes;
				if (this.onsweep) this.onsweep(this.sweepTimes);
			}
		};
		node.connect(splitter);
		splitter.connect(analysers[0], 0);
		splitter.connect(analysers[1], 1);
		node.connect(ctx.destination);
		this.ctx = ctx;
		this.node = node;
		this.analysers = analysers;
		await ctx.resume();
	}

	/** Pushes one channel's settings; harmless before start. */
	update(channel, { wave, modulation = null, enabled = true }) {
		if (!this.node) return;
		this.node.port.postMessage({ channel, wave: plain(wave), modulation: plain(modulation), gate: enabled ? 1 : 0 });
	}

	/** Fades out, then suspends. The next start() resumes where it left off. */
	async stop() {
		if (!this.ctx || this.ctx.state !== 'running') return;
		for (const channel of [0, 1]) this.node.port.postMessage({ channel, gate: 0 });
		await new Promise((r) => setTimeout(r, SMOOTHING * 8 * 1000));
		await this.ctx.suspend();
	}

	async close() {
		if (!this.ctx) return;
		try {
			await this.ctx.close();
		} finally {
			this.ctx = null;
			this.node = null;
			this.analysers = [];
		}
	}

	/** Latest output samples of a channel, for the scope. */
	readWave(channel, out) {
		const a = this.analysers[channel];
		if (!a) {
			out.fill(0);
			return false;
		}
		a.getFloatTimeDomainData(out);
		return true;
	}
}
