# 🎬 Sosáč + Streamuj.tv pro Stremio

Neoficiální komunitní doplněk pro Stremio, který propojuje katalogy a metadata se zdroji **Sosáč / Streamuj.tv**.

Addon používá IMDb ID (`tt...`) tam, kde je možné titul správně spárovat, a podporuje katalogy, metadata, streamy i titulky.

## 🚀 Provoz

Produkční server běží na **Oracle Cloud (Ubuntu ARM)**:

```text
Internet → Nginx → PM2 → Node.js addon :7000
```

Konfigurační stránka je dostupná na `/configure` a stav serveru na `/health`.

## ✨ Hlavní funkce

- 🎬 filmy a seriály ze Sosáče
- 🔗 IMDb / Cinemeta propojení
- 🧠 fallback párování podle názvu a roku
- 🇨🇿 🇸🇰 🇬🇧 více jazykových variant zvuku
- 📺 více kvalit streamu
- 💬 CZ/SK titulky
- 🎞️ převod SRT → WebVTT
- 🖼️ Cinemeta metadata + Sosáč fallback
- ⚡ cache katalogů, metadat, mapování a titulků

## 🗂️ Katalogy

- 🔥 Oblíbené
- 🆕 Nové
- ⭐ Nejlépe hodnocené
- 🎙️ S dabingem
- 💬 S titulky
- 🔎 Hledat

## 🧩 Jak addon funguje

```text
Stremio / Cinemeta / Trakt
          │
          │ IMDb ID
          ▼
      stremio.sosac
          │
          ├── Cinemeta → metadata
          ├── Sosáč → katalogy a interní ID
          └── Streamuj.tv → streamy a titulky
                              │
                              ├── video URL → přímo do Stremia
                              └── titulky → server → WebVTT → Stremio
```

## 💬 Titulky

Addon podporuje standardní Stremio `subtitles` resource i titulky připojené ke streamům.

Titulky se připravují na serveru a Stremio dostane veřejnou HTTPS adresu ve tvaru:

```text
https://<server>/subtitle-file/v1/<hash>.vtt
```

## 🔒 Soukromí

Konfigurační stránka ukládá nastavení do instalační URL pomocí Base64URL.

**Base64 není šifrování.** Instalační URL proto nesdílej veřejně.

## 🛠️ Lokální spuštění

Požadavek: **Node.js 20+**

```bash
npm install
npm start
```

Lokálně:

```text
http://localhost:7000/configure
http://localhost:7000/health
```

## ☁️ Oracle Cloud

Server používá:

- Ubuntu 24.04 ARM
- Node.js
- PM2
- Nginx
- Let's Encrypt / Certbot pro HTTPS

Addon běží pod PM2 jako:

```text
stremio-sosac
```

## 📁 Struktura projektu

```text
addon.js
api/
  sosac.js
  streamuj.js
  cinemeta.js
  subtitle-files.js
public/
  configure.html
```

## 📚 Reference

- Sosáč official Kodi repository
- kodi-czsk / plugin.video.sosac.ph
- Matt5454 / Sosio
- CaseyCZ / stremio.sosac.subtitles
- Stremio Addon SDK
- Cinemeta
- Sosáč.tv
- Streamuj.tv

## ⚠️ Upozornění

Tento projekt je neoficiální komunitní addon a není oficiálně spojen se službami Stremio, Sosáč.tv, Streamuj.tv, Cinemeta ani Trakt.

Repozitář nehostuje video obsah. Dostupnost streamů, metadat a titulků závisí na externích službách.
