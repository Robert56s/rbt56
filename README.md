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
npm run build     # server bundle in build/
npm run preview   # serves the build locally
```

## Running it on the VPS

Pull, install, build, restart. Nothing is uploaded by hand, `build/` is generated
on the server and stays out of git.

```
git pull
npm ci
npm run build
pm2 restart rbt56
```

`npm ci` has to install the dev dependencies too, since the build happens on the
server.

First time on a fresh server, after the build:

```
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

`pm2 startup` prints a command to paste back with sudo, which is what makes the
app come up again after a reboot. Port and environment live in
`ecosystem.config.cjs`.

## How it works

- SvelteKit in plain JavaScript with `adapter-node`, so the build is a small
  node server.
- Decoding uses the browser's `decodeAudioData`, which is why the accepted
  formats vary a little between browsers. Chrome is the most permissive.
- Mixing happens in an `OfflineAudioContext` through a `ChannelMergerNode`: the
  left source feeds channel 0, the right one channel 1.
- WAV is written by hand in `src/lib/audio/wav.js`.
- MP3 goes through `@breezystack/lamejs`, chunked so the page never freezes.

## Adding a tool

1. Create `src/routes/tools/<name>/+page.svelte`.
2. Add the entry to `src/lib/tools.ts`, it then shows up on the home page on its
   own. The top bar link is declared separately in `src/routes/+layout.svelte`.
