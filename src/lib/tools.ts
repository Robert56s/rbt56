export interface Tool {
	name: string;
	href: string;
	summary: string;
	tags: string[];
	state: 'live' | 'wip';
}

export const tools: Tool[] = [
	{
		name: 'Stereo L/R',
		href: '/tools/stereo/',
		summary:
			'Two tracks in, one stereo file out: the first on the left channel, the second on the right.',
		tags: ['audio', 'mp3', 'wav'],
		state: 'live'
	}
];
