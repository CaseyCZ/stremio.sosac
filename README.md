<p align="center">
  <img src="readme-header.svg" alt="Stremio Sosáč by CaseyCZ" width="100%" />
</p>

<p align="center">
  <a href="README.md"><img src="https://img.shields.io/badge/CZ-%C4%8Ce%C5%A1tina-38BDF8?style=for-the-badge&labelColor=0284C7" alt="Čeština" /></a>
  <a href="README_EN.md"><img src="https://img.shields.io/badge/EN-English-172033?style=for-the-badge&labelColor=111827" alt="English" /></a>
</p>

<p align="center">
  Neoficiální komunitní addon pro <strong>Stremio</strong> zaměřený na katalogy, metadata a přehrávání obsahu ze <strong>Sosáč / Streamuj.tv</strong>.
</p>

<p align="center">
  <a href="https://130.61.49.108/configure"><img src="https://img.shields.io/badge/Konfigurace%20addonu-OTEV%C5%98%C3%8DT-38BDF8?style=for-the-badge&labelColor=0284C7" alt="Otevřít konfiguraci" /></a>
  <a href="https://github.com/CaseyCZ/stremio.sosac.subtitles"><img src="https://img.shields.io/badge/Sos%C3%A1%C4%8D%20Subtitles-GITHUB-38BDF8?style=for-the-badge&labelColor=0284C7" alt="Sosáč Subtitles" /></a>
  <a href="https://caseycz.github.io/"><img src="https://img.shields.io/badge/CaseyCZ%20Website-OTEV%C5%98%C3%8DT-38BDF8?style=for-the-badge&labelColor=0284C7" alt="CaseyCZ Website" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FCaseyCZ%2Fstremio.sosac%2FMaster%2Fpackage.json&query=%24.version&label=VERZE&color=38BDF8&labelColor=111827&prefix=v&style=flat-square" alt="Aktuální verze" />
  <img src="https://img.shields.io/badge/Stremio-Addon-111827?style=flat-square&logo=stremio&logoColor=38BDF8" alt="Stremio addon" />
  <img src="https://img.shields.io/badge/CaseyCZ-Project-111827?style=flat-square&logoColor=38BDF8" alt="CaseyCZ project" />
</p>

## Rychlá instalace

1. Otevři **Konfiguraci addonu** tlačítkem nahoře.
2. Vyber jazyk metadat.
3. Zadej přihlašovací údaje pro zdroje, které používáš.
4. Klikni na **Vygenerovat instalační odkaz**.
5. Odkaz zkopíruj nebo addon rovnou otevři ve Stremiu.

> Instalační odkaz může obsahovat citlivé údaje. Nesdílej ho veřejně ani na screenshotech.

## Co addon umí

| Funkce | Popis |
| --- | --- |
| 🎬 **Filmy a seriály** | Katalogy a přehrávání obsahu ze Sosáč / Streamuj.tv. |
| 🔍 **Vyhledávání** | Vlastní katalogy a hledání titulů přímo ve Stremiu. |
| 🔗 **Metadata** | Propojení s IMDb / Cinemeta a doplnění informací o titulu. |
| 🇨🇿 **Jazykové varianty** | Dostupné CZ, SK a další zvukové varianty podle zdroje. |
| 📺 **Více kvalit** | Nabídka dostupných kvalit streamu. |
| 🖼️ **Plakáty a popisy** | Přehlednější zobrazení titulů ve Stremiu. |
| ⚡ **Cache** | Rychlejší opakované načítání již zpracovaných dat. |

## Dva samostatné addony

Video a titulky jsou rozdělené do dvou samostatných projektů:

<table>
  <thead><tr><th>Addon</th><th>Účel</th><th>Odkaz</th></tr></thead>
  <tbody>
    <tr><td><strong>Stremio Sosáč</strong></td><td>Katalogy, metadata a video streamy.</td><td><a href="https://130.61.49.108/configure"><img src="https://img.shields.io/badge/Konfigurace-OTEV%C5%98%C3%8DT-38BDF8?style=flat-square&labelColor=0284C7" alt="Konfigurace hlavního addonu" /></a></td></tr>
    <tr><td><strong>Sosáč Subtitles</strong></td><td>Samostatný addon pro titulky.</td><td><a href="https://github.com/CaseyCZ/stremio.sosac.subtitles"><img src="https://img.shields.io/badge/GitHub-REPO-38BDF8?style=flat-square&labelColor=0284C7&logo=github&logoColor=white" alt="Repozitář titulků" /></a></td></tr>
  </tbody>
</table>

## Kompatibilita

Addon je určený pro běžné Stremio klienty na **PC, Webu, Androidu / Google TV a Apple zařízeních**. Dostupné funkce se mohou lišit podle konkrétního klienta a přehrávače.

## Soukromí a přihlášení

Konfigurační stránka vytvoří instalační odkaz s nastavením uloženým jako **Base64URL**.

**Base64URL není šifrování.** Instalační odkaz může obsahovat citlivé přihlašovací údaje a neměl by se veřejně sdílet, zapisovat do logů ani zveřejňovat na screenshotech.

## Technologie

<p>
  <img src="https://img.shields.io/badge/JavaScript-111827?style=flat-square&logo=javascript&logoColor=38BDF8" alt="JavaScript" />
  <img src="https://img.shields.io/badge/Node.js-111827?style=flat-square&logo=nodedotjs&logoColor=38BDF8" alt="Node.js" />
  <img src="https://img.shields.io/badge/Stremio%20SDK-111827?style=flat-square&logo=stremio&logoColor=38BDF8" alt="Stremio SDK" />
  <img src="https://img.shields.io/badge/API-111827?style=flat-square&logoColor=38BDF8" alt="API" />
  <img src="https://img.shields.io/badge/GitHub-111827?style=flat-square&logo=github&logoColor=38BDF8" alt="GitHub" />
</p>

## Reference

- [Sosáč official Kodi repository](https://sosac.tv/sosacRepo/)
- [kodi-czsk / plugin.video.sosac.ph](https://github.com/kodi-czsk/plugin.video.sosac.ph)
- [Matt5454 / Sosio](https://github.com/Matt5454/Sosio)
- [Stremio Addon SDK / dokumentace](https://stremio.github.io/stremio-addon-guide/)
- [Sosáč.tv](https://sosac.tv/)
- [Streamuj.tv](https://www.streamuj.tv/)

## Upozornění

Projekt je neoficiální komunitní addon a není oficiálně spojen ani podporován službami **Stremio, Sosáč.tv, Streamuj.tv, Cinemeta ani Trakt**.

Repozitář nehostuje video obsah. Dostupnost streamů a metadat závisí na externích službách.

## CaseyCZ

<p align="center">
  <a href="https://caseycz.github.io/"><img src="https://img.shields.io/badge/CaseyCZ%20Website-OTEV%C5%98%C3%8DT-38BDF8?style=for-the-badge&labelColor=0284C7" alt="CaseyCZ Website" /></a>
  <a href="https://www.buymeacoffee.com/caseycz"><img src="https://img.shields.io/badge/Podpo%C5%99it%20CaseyCZ-Buy%20Me%20a%20Coffee-38BDF8?style=for-the-badge&labelColor=0284C7&logo=buymeacoffee&logoColor=white" alt="Podpořit CaseyCZ" /></a>
</p>