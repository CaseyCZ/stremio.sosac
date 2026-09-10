# stremio.sosac

Nový konfigurovatelný Stremio addon pro obsah ze Sosáče / Streamuj.tv.

## Cíl

Addon má nabídnout filmy a seriály s českou, slovenskou a anglickou lokalizací, více variantami zvuku a titulků, metadata přes Cinemetu/TMDB, trailery a později doplňkové katalogy.

## Aktuální stav

První kostra projektu obsahuje:

- Express server pro Stremio endpointy
- konfigurovatelný manifest přes `/:cfg/manifest.json`
- webovou konfiguraci `/configure`
- volbu jazyka metadat: `cs`, `sk`, `en`
- samostatnou volbu preferovaných jazyků zvuku: `CZ`, `SK`, `EN`
- samostatnou volbu preferovaných titulků: `cze`, `slk`, `eng`
- připravené endpointy `catalog`, `meta`, `stream`, `subtitles`

## Důležité pravidlo jazyků

Jazyk metadat, zvuk a titulky jsou tři nezávislé věci.

Příklad konfigurace:

```json
{
  "uiLanguage": "cs",
  "audioLanguages": ["CZ", "SK", "EN"],
  "subtitleLanguages": ["cze", "slk", "eng"]
}
```

Stream resolver nebude zahazovat varianty jen proto, že existuje více jazyků. Výsledné streamy mají být seřazené podle uživatelské preference a jasně označené například:

- `🇨🇿 CZ • 1080p`
- `🇸🇰 SK • 1080p`
- `🇬🇧 EN • 720p`

Titulky mají být vracené jako samostatné Stremio subtitle objekty s unikátním `id`, `url` a ISO jazykovým kódem.

## Plánovaná architektura

```text
addon.js
api/
  sosac.js        # Sosáč katalogy, filmy, seriály, epizody
  streamuj.js     # streamy, jazykové a kvalitativní varianty
  cinemeta.js     # kompletní metadata a trailery podle IMDb ID
  tmdb.js         # CZ/SK/EN metadata a párování IMDb/TMDB
  csfd.js         # žebříčky / mapování katalogů
  trakt.js        # volitelná integrace Trakt
lib/
  config.js       # validace konfigurace
  language.js     # priority jazyků, normalizace CZ/SK/EN
  matcher.js      # párování titulů a roků
public/
  configure.html
```

## Metadata a trailery

Cílové pořadí zdrojů:

1. správné IMDb ID jako hlavní Stremio identifikátor (`tt...`)
2. Cinemeta pro kompletní metadata a `trailerStreams`
3. český/slovenský/anglický překlad přes Sosáč nebo TMDB podle konfigurace
4. Sosáč/Streamuj pouze jako zdroj dostupných streamů a titulků

Pozor: hodnota hodnocení IMDb nesmí být zaměněna za IMDb ID.

## Titulky

Addon bude vracet všechny dostupné požadované jazyky. Kde to konkrétní Stremio klient podporuje, lze využít lokální streaming server Stremia pro načtení a převod externího subtitle souboru. Kompatibilitu je potřeba testovat zvlášť na Desktop, Android/Google TV, Web/iOS a Apple TV.

## Roadmap

- [x] základ repozitáře
- [x] konfigurační stránka
- [x] volby CZ/SK/EN pro metadata
- [x] samostatné volby zvuku a titulků
- [ ] Sosáč API klient
- [ ] Streamuj resolver s více audio variantami
- [ ] subtitle resolver
- [ ] IMDb ID resolver
- [ ] Cinemeta metadata + trailery
- [ ] TMDB CZ/SK/EN overlay
- [ ] všechny Sosáč movie/series katalogy
- [ ] CSFD Nejlepší / Nejoblíbenější
- [ ] Trakt integrace
- [ ] cache a ochrana proti rate-limitům
- [ ] kompatibilitní testy Stremio klientů
- [ ] Docker / hosting konfigurace

## Lokální spuštění

```bash
npm install
npm start
```

Potom otevřít:

```text
http://localhost:7000/configure
```
