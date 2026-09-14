<script>
	import Equation from '$lib/components/Equation.svelte';
</script>

<svelte:head>
	<title>Method sheet · Karnaugh Map Solver · rbt56</title>
	<meta
		name="description"
		content="How the Karnaugh Map Solver works: Gray code adjacency, the grouping identity, prime and essential implicants, Petrick's method, product of sums by De Morgan, and the two-level circuit."
	/>
</svelte:head>

<article>
	<p class="eyebrow"><a href="/tools/karnaugh/">&larr; Karnaugh Map Solver</a></p>
	<h1>Method sheet</h1>
	<p class="lead">
		Everything the solver does, in the order it does it, with the identity each step rests on. The
		tool's own "show the method" panel walks the same steps with the map's actual cells in them.
	</p>

	<section class="panel">
		<div class="panel-head">
			<span class="num">1</span>
			<h2>Why the map works</h2>
		</div>

		<div class="formula">
			<h3>Cells and Gray code</h3>
			<p class="note">
				Each cell is one minterm, numbered by the binary value of the variables in order (first
				variable = most significant bit). Rows and columns follow the Gray sequence, in which
				consecutive codes differ in exactly one bit and the ends are consecutive too, so any two
				touching cells, including across the outer edges, differ in exactly one variable.
			</p>
			<Equation tex={`\\text{Gray, 2 bits: } 00,\\ 01,\\ 11,\\ 10 \\qquad g_i = i \\oplus (i \\gg 1)`} />
		</div>

		<div class="formula">
			<h3>The grouping identity</h3>
			<p class="note">
				Two touching ones share every variable but one, and that variable takes both of its values
				inside the pair, so it cancels. A rectangle of 2^k touching ones applies this k times.
			</p>
			<Equation tex={`XY + X\\overline{Y} = X\\,(Y + \\overline{Y}) = X`} />
			<p class="note">
				<strong>How to use:</strong> a group of 2^k cells is one product term of the n - k variables
				that keep the same value everywhere in the group. Groups must be rectangles of size 1, 2,
				4, 8 or 16 cells, may overlap, and may wrap around the edges. A don't-care may join a group
				as a one or stay out as a zero, whichever helps, and never has to be covered.
			</p>
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">2</span>
			<h2>Choosing the groups</h2>
		</div>

		<div class="formula">
			<h3>Prime implicants</h3>
			<p class="note">
				A group that cannot be made any bigger. A group that is not prime sits inside a bigger one
				with fewer literals, so only primes are candidates. They are found by the Quine-McCluskey
				tabulation: pair single cells that differ in one variable, pair the pairs into quads, and
				so on, keeping whatever cannot pair any further.
			</p>
			<Equation tex={`\\text{pattern } 1{-}0{-} \\;\\equiv\\; A\\,\\overline{C} \\quad (\\text{variables at } {-} \\text{ eliminated})`} />
		</div>

		<div class="formula">
			<h3>Essential prime implicants</h3>
			<p class="note">
				A one that only a single prime covers forces that prime into the answer. Every essential
				prime is taken first, and every cell it covers is crossed off.
			</p>
		</div>

		<div class="formula">
			<h3>Petrick's method for the rest</h3>
			<p class="note">
				Each cell still uncovered needs at least one of the primes that cover it (a sum), and all
				those conditions hold at once (a product). Multiplying the product out and dropping every
				option that contains another lists every irredundant way to finish the cover; the cheapest
				(fewest primes, then fewest literals) is the minimum. Absorption is what keeps the list
				short:
			</p>
			<Equation tex={`(P_1 + P_2)(P_2 + P_3) = P_1P_2 + P_1P_3 + P_2 + P_2P_3 = P_2 + P_1P_3 \\qquad (X + XY = X)`} />
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">3</span>
			<h2>Product of sums</h2>
		</div>

		<div class="formula">
			<h3>Group the zeros, then De Morgan</h3>
			<p class="note">
				The zeros of F are the ones of its complement. Minimizing them the same way gives a sum
				of products for the complement; De Morgan applied twice turns it into a product of sums for
				F, with every product becoming a sum and every literal flipped.
			</p>
			<Equation tex={`\\overline{F} = \\overline{A}B + C\\overline{D} \\ \\Rightarrow\\ F = \\overline{\\overline{A}B + C\\overline{D}} = (A + \\overline{B})(\\overline{C} + D)`} />
			<p class="note">
				<strong>How to use:</strong> both forms are correct; pick whichever has fewer gates or
				matches the parts at hand (sum of products maps to NAND-NAND, product of sums to NOR-NOR).
			</p>
		</div>
	</section>

	<section class="panel">
		<div class="panel-head">
			<span class="num">4</span>
			<h2>From expression to gates</h2>
		</div>

		<div class="formula">
			<h3>Two-level logic</h3>
			<p class="note">
				Sum of products: one AND gate per product term (a single-literal term needs none), one OR
				gate for the sum, and one inverter per variable that appears complemented, shared by every
				term that uses it. Product of sums is the same with AND and OR swapped.
			</p>
			<Equation tex={`\\text{gates} = \\text{inverters} + \\text{first level} + 1`} />
			<p class="note">
				<strong>How to use:</strong> in the tool's drawing a dot is a connection and a plain crossing
				is not. Putting a bubble on every first-level output and every second-level input changes
				nothing (they cancel in pairs) and turns AND-OR into NAND-NAND, OR-AND into NOR-NOR.
			</p>
		</div>
	</section>
</article>

<style>
	.lead {
		font-size: 1.05rem;
		color: var(--textDim);
		margin-bottom: 1.8rem;
	}

	.formula {
		margin-bottom: 1.6rem;
	}

	.formula:last-child {
		margin-bottom: 0;
	}

	.formula h3 {
		margin-bottom: 0.4rem;
	}
</style>
