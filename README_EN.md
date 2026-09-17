<p align="center">
  <img src="readme-header.svg" alt="Stremio Sosáč by CaseyCZ" width="100%" />
</p>

<p align="center">
  <a href="README.md"><img src="https://img.shields.io/badge/CZ-%C4%8Ce%C5%A1tina-172033?style=for-the-badge&labelColor=111827" alt="Czech" /></a>
  <a href="README_EN.md"><img src="https://img.shields.io/badge/EN-English-38BDF8?style=for-the-badge&labelColor=0284C7" alt="English" /></a>
</p>

<p align="center">
  An unofficial community <strong>Stremio</strong> add-on focused on catalogs, metadata and playback streams from <strong>Sosáč / Streamuj.tv</strong>.
</p>

<p align="center">
  <a href="https://130.61.49.108/configure"><img src="https://img.shields.io/badge/Addon%20Configuration-OPEN-38BDF8?style=for-the-badge&labelColor=0284C7" alt="Open configuration" /></a>
  <a href="https://github.com/CaseyCZ/stremio.sosac.subtitles"><img src="https://img.shields.io/badge/Sos%C3%A1%C4%8D%20Subtitles-GITHUB-38BDF8?style=for-the-badge&labelColor=0284C7" alt="Sosáč Subtitles" /></a>
  <a href="https://caseycz.github.io/"><img src="https://img.shields.io/badge/CaseyCZ%20Website-OPEN-38BDF8?style=for-the-badge&labelColor=0284C7" alt="CaseyCZ Website" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FCaseyCZ%2Fstremio.sosac%2FMaster%2Fpackage.json&query=%24.version&label=VERSION&color=38BDF8&labelColor=111827&prefix=v&style=flat-square" alt="Current version" />
  <img src="https://img.shields.io/badge/Stremio-Addon-111827?style=flat-square&logo=stremio&logoColor=38BDF8" alt="Stremio add-on" />
  <img src="https://img.shields.io/badge/CaseyCZ-Project-111827?style=flat-square" alt="CaseyCZ project" />
</p>

## Quick installation

1. Open **Addon Configuration** using the button above.
2. Choose the metadata language.
3. Enter credentials for the sources you use.
4. Click **Generate installation link**.
5. Copy the link or open it directly in Stremio.

> The installation link may contain sensitive data. Do not share it publicly or include it in screenshots.

## Features

| Feature | Description |
| --- | --- |
| 🎬 **Movies & series** | Catalogs and playback streams from Sosáč / Streamuj.tv. |
| 🔍 **Search** | Custom catalogs and title search directly in Stremio. |
| 🔗 **Metadata** | IMDb / Cinemeta integration and title information. |
| 🇨🇿 **Audio variants** | Czech, Slovak and other available audio variants depending on source. |
| 📺 **Multiple qualities** | Shows available playback qualities. |
| 🖼️ **Posters & descriptions** | Cleaner title presentation inside Stremio. |
| ⚡ **Cache** | Faster repeated loading of processed data. |

## Two separate add-ons

Video playback and subtitles are maintained as two separate projects:

<table>
  <thead><tr><th>Add-on</th><th>Purpose</th><th>Link</th></tr></thead>
  <tbody>
    <tr><td><strong>Stremio Sosáč</strong></td><td>Catalogs, metadata and video streams.</td><td><a href="https://130.61.49.108/configure"><img src="https://img.shields.io/badge/Configure-OPEN-38BDF8?style=flat-square&labelColor=0284C7" alt="Configure main add-on" /></a></td></tr>
    <tr><td><strong>Sosáč Subtitles</strong></td><td>Separate subtitle add-on.</td><td><a href="https://github.com/CaseyCZ/stremio.sosac.subtitles"><img src="https://img.shields.io/badge/GitHub-REPO-38BDF8?style=flat-square&labelColor=0284C7&logo=github&logoColor=white" alt="Subtitle repository" /></a></td></tr>
  </tbody>
</table>

## Compatibility

Designed for common Stremio clients on **PC, Web, Android / Google TV and Apple devices**. Available behavior may differ depending on the client and player.

## Privacy & credentials

The configuration page generates an installation link with settings stored as **Base64URL**.

**Base64URL is not encryption.** The installation link may contain sensitive login data and should not be shared publicly, logged, or included in screenshots.

## Technology

<p>
  <img src="https://img.shields.io/badge/JavaScript-111827?style=flat-square&logo=javascript&logoColor=38BDF8" alt="JavaScript" />
  <img src="https://img.shields.io/badge/Node.js-111827?style=flat-square&logo=nodedotjs&logoColor=38BDF8" alt="Node.js" />
  <img src="https://img.shields.io/badge/Stremio%20SDK-111827?style=flat-square&logo=stremio&logoColor=38BDF8" alt="Stremio SDK" />
  <img src="https://img.shields.io/badge/API-111827?style=flat-square" alt="API" />
  <img src="https://img.shields.io/badge/GitHub-111827?style=flat-square&logo=github&logoColor=38BDF8" alt="GitHub" />
</p>

## References

- [Sosáč official Kodi repository](https://sosac.tv/sosacRepo/)
- [kodi-czsk / plugin.video.sosac.ph](https://github.com/kodi-czsk/plugin.video.sosac.ph)
- [Matt5454 / Sosio](https://github.com/Matt5454/Sosio)
- [Stremio Addon SDK documentation](https://stremio.github.io/stremio-addon-guide/)
- [Sosáč.tv](https://sosac.tv/)
- [Streamuj.tv](https://www.streamuj.tv/)

## Disclaimer

This is an unofficial community add-on and is not officially affiliated with or supported by **Stremio, Sosáč.tv, Streamuj.tv, Cinemeta or Trakt**.

This repository does not host video content. Stream and metadata availability depends on external services.

## CaseyCZ

<p align="center">
  <a href="https://caseycz.github.io/"><img src="https://img.shields.io/badge/CaseyCZ%20Website-OPEN-38BDF8?style=for-the-badge&labelColor=0284C7" alt="CaseyCZ Website" /></a>
  <a href="https://www.buymeacoffee.com/caseycz"><img src="https://img.shields.io/badge/Support%20CaseyCZ-Buy%20Me%20a%20Coffee-38BDF8?style=for-the-badge&labelColor=0284C7&logo=buymeacoffee&logoColor=white" alt="Support CaseyCZ" /></a>
</p>