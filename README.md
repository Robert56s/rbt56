# rbt56

Personal site, a toolbox. Every tool runs entirely in the browser: nothing is
uploaded, there is no server at all, just static files.

| Tool | Path | What it does |
| --- | --- | --- |
| Stereo L/R | `/tools/stereo` | Takes two audio or video files and writes one stereo file, the first on the left channel, the second on the right. Exports WAV 16 or 24 bit, or MP3. |

## Development

```
npm install
npm run dev
npm run build     # static output in build/
npm run check     # types and markup
```

## How it works

- SvelteKit with `adapter-static`, so the build is a plain folder of files.
- Decoding uses the browser's `decodeAudioData`, which is why the accepted
  formats vary a little between browsers. Chrome is the most permissive.
- Mixing happens in an `OfflineAudioContext` through a `ChannelMergerNode`: the
  left source feeds channel 0, the right one channel 1.
- WAV is written by hand in `src/lib/audio/wav.ts`.
- MP3 goes through `@breezystack/lamejs`, chunked so the page never freezes.

## Adding a tool

1. Create `src/routes/tools/<name>/+page.svelte`.
2. Add the entry to `src/lib/tools.ts`, it then shows up on the home page on its
   own. The top bar link is declared separately in `src/routes/+layout.svelte`.
