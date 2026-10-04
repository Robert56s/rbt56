import { error } from '@sveltejs/kit';
import { typeBySlug } from '$lib/transistors/types';

// One page per transistor type; the content lives in
// src/lib/transistors/types/, so only the slug travels with the page.
export function load({ params }) {
	if (!typeBySlug(params.type)) error(404, 'There is no such transistor type in the guide.');
	return { slug: params.type };
}
