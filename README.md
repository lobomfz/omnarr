# omnarr

a self-hosted media server that lets you mix video, audio, and subtitles from different sources into a single, auto-synced playback.

## goals

- replace Radarr, Sonarr, Prowlarr, Bazarr, and Plex with a single tool
- pick video from one source, audio from another, subtitles from a third. play them as one
- auto-download and sync subtitles in your preferred language
- watch in the browser or cast to a Chromecast
- multiple profiles with per-user language and track preferences
- resume where you left off, across devices
- actually work without requiring a PhD

## why

the \*arr stack is fragmented by design. each tool does one thing, and getting them to work together means configuring half a dozen services that barely talk to each other.

plex and jellyfin sit on the other end. they play what you give them, but they don't help you get it.

omnarr handles the full pipeline from search to playback as a single tool, and that's what makes things like cross-source sync possible. when omnarr owns the whole chain it can do things a collection of specialized tools can't.

this lets omnarr scan your files before playback, figure out what's inside each one and how to align them together, so when you hit play everything just works.

## current features (cli-only, no UI)

- search tmdb
- download movies and shows from torrents and streaming sources
- download subtitles tested against your actual files
- scan and index all files
- auto-sync audio and subtitles across sources
- transcode to h264
- export to mkv
- monitor download status
