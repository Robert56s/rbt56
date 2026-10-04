// The interactive figures a transistor guide page can place by name, in
// its `curves` field or in a { widget } block of its text.
import BjtCurves from './BjtCurves.svelte';
import FetCurves from './FetCurves.svelte';
import FetTransfer from './FetTransfer.svelte';
import LossCompare from './LossCompare.svelte';
import UjtWave from './UjtWave.svelte';

export const WIDGETS = {
	bjtCurves: BjtCurves,
	fetCurves: FetCurves,
	fetTransfer: FetTransfer,
	lossCompare: LossCompare,
	ujtWave: UjtWave
};
