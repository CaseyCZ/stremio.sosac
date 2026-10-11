<p align="center">
  <img src="readme-header.svg" alt="Stremio Sosáč by CaseyCZ" width="100%" />
</p>

<p align="center">
  <a href="README.md"><img src="https://img.shields.io/badge/CZ-%C4%8Ce%C5%A1tina-172033?style=for-the-badge&labelColor=111827" alt="Czech" /></a>
  <img src="https://img.shields.io/badge/EN-English-38BDF8?style=for-the-badge&labelColor=0284C7" alt="English" />
</p>

<p align="center">
  An unofficial community <strong>Stremio</strong> add-on focused on catalogs, metadata and playback streams from <strong>Sosáč / Streamuj.tv</strong>.
</p>

<p align="center">
  <img src="https://img.shields.io/github/package-json/v/CaseyCZ/stremio.sosac?style=for-the-badge&label=VERSION&color=38BDF8&labelColor=0284C7" alt="Current Stremio Sosáč version" />
</p>

<p align="center">
  <a href="https://130.61.49.108/configure"><img src="https://img.shields.io/badge/Configure-Open-38BDF8?style=for-the-badge&labelColor=0284C7&logo=googlechrome&logoColor=white" alt="Open configuration" /></a>
</p>

## About

**Stremio Sosáč** brings catalogs, search, metadata, streams and available subtitles into Stremio. Video is still handed directly to the client from Streamuj.tv. Starting with **0.5.1**, subtitles have two modes: default **Hybrid**, which keeps the original SRT/VTT content and exposes it through a compatible URL with a file extension, and **Direct test**, which hands the original Streamuj subtitle URL directly to the client.

## Main features

- 🎬 movies and series from supported sources
- 🔍 search and custom catalogs inside Stremio
- 🖼️ metadata, posters and title descriptions
- 🇨🇿 Czech, Slovak and other available language variants
- 📺 selectable stream qualities
- 💬 default Hybrid subtitles with compatible `.srt` / `.vtt` URLs
- 🧪 optional Direct test mode for testing original Streamuj subtitle URLs
- ↗️ direct video playback without routing video through the add-on server
- ⚡ faster repeated loading
- 📱 support for common Stremio clients on desktop, web, Android / Google TV and Apple devices

## Related project

Starting with **0.5.1**, the main add-on includes both Hybrid and Direct test subtitle modes. The separate **Sosáč Subtitles** project remains available as an independent companion.

The two add-ons are **not technically linked**: each has its own manifest, configuration, cache and credentials stored in its installation URL. Settings and the selected subtitle mode are not shared automatically between them. They can be installed and tested independently.

<p>
  <a href="https://130.61.49.108:8443/configure"><img src="https://img.shields.io/badge/Sos%C3%A1%C4%8D%20Subtitles-Configure-38BDF8?style=for-the-badge&labelColor=0284C7" alt="Sosáč Subtitles configuration" /></a>
  <a href="https://github.com/CaseyCZ/stremio.sosac.subtitles"><img src="https://img.shields.io/badge/Sos%C3%A1%C4%8D%20Subtitles-GitHub-38BDF8?style=for-the-badge&labelColor=0284C7&logo=github&logoColor=white" alt="Sosáč Subtitles GitHub" /></a>
</p>

## Versioning

`package.json` is the single source of truth for the version number. The manifest and `/health` read it directly, the configuration page loads it from `/health`, and the README badge reads it automatically from `package.json`. A release version no longer needs to be edited in several places manually.

Use `npm run release:patch`, `npm run release:minor` or `npm run release:major` to change the version; npm updates `package-lock.json` at the same time.

## Important

This is an unofficial community add-on and is not officially affiliated with or supported by Stremio, Sosáč.tv or Streamuj.tv. This repository does not host video content and source availability may change.

## Support

<p align="center">
  <a href="https://www.buymeacoffee.com/caseycz"><img src="https://img.shields.io/badge/Support%20CaseyCZ-Buy%20Me%20a%20Coffee-38BDF8?style=for-the-badge&labelColor=0284C7&logo=buymeacoffee&logoColor=white" alt="Support CaseyCZ" /></a>
</p>

<p align="center">
  <a href="https://www.buymeacoffee.com/caseycz"><img src="https://caseycz.github.io/support-qr.svg" width="150" alt="Buy Me a Coffee CaseyCZ QR code" /></a><br>
  <sub>Scan the QR code or click the button.</sub>
</p>

<p align="center">
  <a href="https://caseycz.github.io/"><img src="https://img.shields.io/badge/CaseyCZ%20Website-Open-172033?style=flat-square&labelColor=111827" alt="CaseyCZ Website" /></a>
</p>