# 🎬 Sosáč + Streamuj.tv pro Stremio

Neoficiální komunitní doplněk pro [Stremio](https://www.stremio.com/), který propojuje katalogy a metadata se zdroji **Sosáč / Streamuj.tv**.

Addon je zaměřený na české a slovenské uživatele. Používá **IMDb ID (`tt...`)** tam, kde je možné titul správně spárovat, takže se může lépe propojit s položkami z Cinemety, Traktu, vyhledávání Stremia, knihovny a historie sledování.

> Projekt nehostuje video soubory. Video streamy jsou přehrávány přímo ze zdroje Streamuj.tv. Server addonu zajišťuje pouze Stremio API, párování titulů, metadata a přípravu titulků.

## 🚀 Rychlá instalace

👉 **[Otevřít konfiguraci addonu](https://stremio-sosac-w8dk.onrender.com/configure)**

1. Otevři konfigurační stránku.
2. Vyber jazyk metadat / rozhraní.
3. Zadej přihlašovací údaje pro **Sosáč** a **Streamuj.tv**.
4. Klikni na **Vygenerovat instalační odkaz**.
5. Klikni na **Nainstalovat do Stremia** a potvrď instalaci.

👉 [Stremio – Downloads](https://www.stremio.com/downloads)

## ✨ Hlavní funkce

- 🎬 **Filmy a seriály ze Sosáče** – katalogy, vyhledávání, detail titulu a epizody.
- 🔗 **IMDb / Cinemeta propojení** – při dostupném IMDb ID používá addon standardní `tt...` identifikátor Stremia.
- 🧠 **Fallback párování podle názvu a roku** – pokud IMDb ID v Sosáči chybí, addon se pokusí najít odpovídající titul přes Cinemetu.
- 🇨🇿 🇸🇰 🇬🇧 **Více jazykových variant zvuku** – addon zachovává dostupné jazykové větve Streamuj.tv.
- 📺 **Více kvalit streamu** – podle zdroje například SD, HD, 1080p nebo další dostupné varianty.
- 💬 **CZ/SK titulky** – subtitle tracky se načítají ze Streamuj.tv a připravují jako veřejné HTTPS WebVTT soubory.
- 🎞️ **Převod SRT → WebVTT** – kvůli lepší kompatibilitě mezi různými Stremio klienty.
- 🖼️ **Cinemeta metadata + Sosáč fallback** – pokud Cinemeta nemá obrázek, addon se pokusí použít artwork ze Sosáče.
- ⚡ **Cache a omezení zbytečných API požadavků** – opakované katalogy, metadata a mapování se drží dočasně v paměti serveru.
- 🌐 **Hosting na Renderu** – addon běží jako lehká API vrstva; samotné video přes Render neprochází.

## 🗂️ Katalogy

Aktuální manifest obsahuje katalogy pro filmy a seriály v tomto pořadí:

- 🔥 Oblíbené
- 🆕 Nové
- ⭐ Nejlépe hodnocené
- 🎙️ S dabingem
- 💬 S titulky – podle dostupnosti dat Sosáče / Streamuj.tv
- 🔎 Hledat

Některé seriálové seznamy Sosáč poskytuje jako seznam epizod, nikoli jako klasický seznam seriálů. Addon proto musí tyto odpovědi převádět do formátu vhodného pro Stremio.

## 🧩 Jak addon funguje

```text
Stremio / Cinemeta / Trakt
          │
          │ IMDb ID (tt...)
          ▼
      stremio.sosac
          │
          ├── Cinemeta → metadata, plakáty, série a epizody
          │
          ├── Sosáč → katalogy, české/slovenské informace,
          │           interní ID a Streamuj link ID
          │
          └── Streamuj.tv → dostupné audio / kvality / titulky
                              │
                              ├── video URL → přímo do Stremia
                              └── titulky → Render → WebVTT → Stremio
```

Cílem je, aby stejný titul používal stejné IMDb ID bez ohledu na to, zda ho uživatel otevře z katalogu addonu, Cinemety, Traktu nebo jiného kompatibilního katalogu.

## 💬 Titulky

Addon podporuje standardní Stremio `subtitles` resource i titulky připojené přímo k našim streamům.

Titulky se nepřesměrovávají přes `127.0.0.1`, ale připravují se na serveru a Stremio dostane veřejnou HTTPS adresu ve tvaru:

```text
https://.../subtitle-file/v1/<hash>.vtt
```

To omezuje závislost na lokálním Stremio streaming serveru a zlepšuje kompatibilitu mezi Desktopem, Webem, Android/Google TV a Apple zařízeními.

## ⚡ Výkon a cache

Addon je navržený tak, aby zbytečně nezatěžoval Sosáč, Cinemetu, Streamuj.tv ani hosting na Renderu.

Používá například:

- krátkodobou cache katalogů a detailů,
- dlouhodobější cache IMDb ↔ Sosáč mapování,
- sdílení souběžných stejných požadavků,
- krátkou cache Streamuj API odpovědí,
- lokální cache již připravených WebVTT titulků.

Video data nejsou proxyována přes Render – addon vrací klientovi přímou URL streamu.

## 🔒 Soukromí a přihlašovací údaje

Konfigurační stránka vygeneruje instalační URL obsahující konfiguraci zakódovanou pomocí **Base64URL**.

**Base64 není šifrování.** Instalační URL proto může obsahovat citlivé přihlašovací údaje v podobě, kterou lze zpětně dekódovat.

- instalační URL **nikdy nesdílej veřejně**,
- nevkládej ji do veřejných issue, screenshotů ani logů,
- používej pouze HTTPS,
- na sdíleném zařízení zacházej s instalačním odkazem jako s heslem.

Addon nemá vlastní databázi uživatelských účtů. Přihlašovací údaje se používají pouze pro komunikaci se službami, které addon potřebuje pro získání dostupného obsahu.

## 🛠️ Lokální spuštění

Požadavek: **Node.js 20+**

```bash
npm install
npm start
```

Potom otevři:

```text
http://localhost:7000/configure
```

Zdravotní stav serveru:

```text
http://localhost:7000/health
```

## 📁 Struktura projektu

```text
addon.js
api/
  sosac.js            # Sosáč katalogy, filmy, seriály a epizody
  streamuj.js         # Streamuj.tv streamy, kvality, audio a titulky
  cinemeta.js         # Cinemeta metadata a IMDb párování
  subtitle-files.js   # stažení, převod, cache a servírování WebVTT
public/
  configure.html      # webová konfigurace addonu
render.yaml            # deployment na Render
```

## 📚 Zdroje a reference

Při vývoji byly jako technické reference použity veřejně dostupné projekty, API struktury a dokumentace:

- **Sosáč official Kodi repository** – https://sosac.tv/sosacRepo/
- **kodi-czsk / plugin.video.sosac.ph** – https://github.com/kodi-czsk/plugin.video.sosac.ph
- **Matt5454 / Sosio** – https://github.com/Matt5454/Sosio
- **Původní samostatný subtitle addon** – https://github.com/CaseyCZ/stremio.sosac.subtitles
- **Stremio Addon SDK / dokumentace** – https://stremio.github.io/stremio-addon-guide/
- **Cinemeta** – metadata používaná ekosystémem Stremio
- **Sosáč.tv / Sosáč API** – zdroj katalogových a obsahových informací
- **Streamuj.tv** – zdroj dostupných stream variant a titulků

## 🙏 Poděkování

Velké díky patří:

- autorům a správcům **Sosáče** za službu a dlouhodobý vývoj Kodi doplňků,
- týmu **kodi-czsk** a všem přispěvatelům projektu `plugin.video.sosac.ph` za veřejně dostupnou implementaci a technické informace,
- **Matt5454** za projekt **Sosio**, který byl užitečnou referencí při pochopení struktury Streamuj.tv a Stremio streamů,
- vývojářům **Stremio** za otevřený addon ekosystém a dokumentaci,
- komunitě, která addon testuje na různých platformách a pomáhá odhalovat rozdíly mezi jednotlivými Stremio klienty.

## ⚠️ Upozornění

Tento projekt je **neoficiální komunitní addon** a není oficiálně spojen ani podporován službami **Stremio, Sosáč.tv, Streamuj.tv, Cinemeta, Trakt** ani jejich provozovateli.

Repozitář neobsahuje ani nehostuje video obsah. Dostupnost streamů, metadat a titulků závisí na externích službách a může se kdykoliv změnit.

Používej addon v souladu s podmínkami jednotlivých služeb a s právními předpisy platnými ve tvé zemi.

---

### ❤️ Projekt

Pokud najdeš chybu nebo nefunkční titul / epizodu, je nejlepší přiložit **IMDb ID, název, sérii a číslo epizody** a část serverového logu bez přihlašovacích údajů a bez instalační URL.
