# Datenquellen & Nutzungsbedingungen (privat vs. geschäftlich)

agentView Studio holt einige Inhalte **direkt im Browser** von externen
Diensten – Wetter, Kartenkacheln, Geocoding, Wechselkurse und RSS-Feeds. Diese
Dienste sind **nicht** Teil von agentView und unterliegen ihren **eigenen**
Bedingungen. Die Voreinstellungen sind auf **leichte, private Nutzung** ausgelegt.

> **QR-Codes** werden **lokal auf dem Gerät** erzeugt und die **Schriftarten**
> werden **selbst gehostet** – beide senden **keine** Anfragen an Dritte und sind
> privat wie geschäftlich unbedenklich.

Diese Seite ist die zentrale Referenz: Das README und die Info-Marker (ⓘ) in der
App verweisen hierher. Sie ergänzt die englische
[`THIRD-PARTY-NOTICES.md`](../THIRD-PARTY-NOTICES.md) (Lizenzen der Bibliotheken
und Daten).

> **Kurzfassung:** Die Standard-Endpunkte für **Wetter (Open-Meteo)**,
> **Karten (OpenStreetMap / Nominatim / CARTO)** und teils **Wechselkurse**
> sind für den **privaten** Gebrauch gedacht. Für den **geschäftlichen** Einsatz
> brauchst du in der Regel einen **eigenen Anbieter / eigenen API-Schlüssel /
> eine eigene Instanz** und musst die **vorgeschriebene Quellenangabe** anzeigen.

## Übersicht

| Dienst | Zweck (Widget) | Privat / Geschäftlich | Attribution (Pflicht?) | Anbieter-Bedingungen |
|---|---|---|---|---|
| **Open-Meteo** | Wetter | Privat: ja (kostenlos, ohne Schlüssel). Geschäftlich: eigener/kommerzieller Zugang bzw. Anbieter-Bedingungen prüfen | „Wetterdaten von Open-Meteo.com" (empfohlen, Daten CC-BY 4.0) | https://open-meteo.com/en/terms |
| **OpenStreetMap-Standardkacheln** (`osm`) | Karte | Privat: ja, aber strenge Tile-Policy. Geschäftlich/hohes Volumen: **eigener Tile-Anbieter** | „© OpenStreetMap contributors" – **Pflicht** | https://operations.osmfoundation.org/policies/tiles/ |
| **CARTO Basemaps** (`carto-dark`, `carto-light`) | Karte | Privat: ja. Geschäftlich: CARTO-Konto/-Bedingungen | „© OpenStreetMap contributors © CARTO" – **Pflicht** | https://carto.com/legal/ |
| **Nominatim** (OpenStreetMap) | Geocoding (Ort → Koordinaten, Suche) | Privat: ja (max. 1 Anfrage/Sek., App identifizieren). Geschäftlich/Massen: **eigene Instanz oder kommerzieller Geocoder** | „© OpenStreetMap contributors" – **Pflicht** | https://operations.osmfoundation.org/policies/nominatim/ |
| **ExchangeRate-API** (offener Endpunkt `open.er-api.com`) | Währung / Wechselkurse | Privat: ja (ohne Schlüssel, ratenbegrenzt). Geschäftlich: **eigener API-Schlüssel** empfohlen | Sichtbarer Link auf exchangerate-api.com – **Pflicht beim offenen Endpunkt** | https://www.exchangerate-api.com/docs/free |
| **RSS-/Atom-Feeds der Verlage** | RSS / News | Inhalte gehören dem **jeweiligen Verlag**; nur CORS-fähige Feeds funktionieren | je nach Verlag (Quelle/Logo oft erwünscht) | Bedingungen des jeweiligen Feeds prüfen |

**Lokal / selbst gehostet (keine externen Anfragen):** QR-Codes werden auf dem
Gerät erzeugt; Schriftarten (Inter, Inter Tight, JetBrains Mono, Playfair
Display, alle SIL OFL 1.1) liegen als `woff2` im Repo unter `fonts/`.

## Details

### Wetter — Open-Meteo
Das Wetter-Widget ruft `api.open-meteo.com` ohne API-Schlüssel auf. Die Daten
stehen unter **CC-BY 4.0**; die kostenlose Nutzung ist für nicht-kommerzielle
Zwecke vorgesehen. Empfohlene Quellenangabe: **„Wetterdaten von Open-Meteo.com"**
(das Widget zeigt sie an). Für einen **geschäftlichen** Dauerbetrieb bitte die
Anbieter-Bedingungen prüfen bzw. einen kommerziellen Zugang nutzen – im Widget
lässt sich dafür ein **eigener API-Schlüssel** hinterlegen.

### Karten — OpenStreetMap & CARTO
Das Karten-Widget bietet drei Kachelstile: `osm` (OpenStreetMap-Standard),
`carto-dark` und `carto-light` (CARTO). Die zugrundeliegenden **Kartendaten**
stammen von OpenStreetMap und stehen unter der **ODbL**. Die Quellenangabe
**„© OpenStreetMap contributors"** (bei CARTO zusätzlich **„© CARTO"**) ist
**verpflichtend** und wird auf jeder Karte sichtbar gehalten.

Die öffentlichen Kachel-Server (OSM-Standard und CARTO) haben **Nutzungs-
richtlinien** mit Mengen- und Zweckbeschränkungen. Für **geschäftliche** oder
stark frequentierte Displays nutze bitte einen **eigenen bzw. kommerziellen
Kachel-Anbieter** – das Widget erlaubt dafür eine **eigene Tile-URL + eigene
Quellenangabe**.

### Geocoding — Nominatim
Die Ortssuche (Adresse/Ort → Koordinaten, Reverse-Geocoding) nutzt
`nominatim.openstreetmap.org`. Die **Nominatim Usage Policy** erlaubt **maximal
eine Anfrage pro Sekunde**, verlangt eine identifizierbare Anwendung und
**verbietet Massenabfragen** auf dem öffentlichen Endpunkt. Für **geschäftliche**
oder umfangreiche Nutzung: **eigene Nominatim-Instanz** oder ein **kommerzieller
Geocoding-Dienst**. Quellenangabe „© OpenStreetMap contributors" ist Pflicht.

### Währung — ExchangeRate-API
Das Währungs-Widget nutzt den **offenen Endpunkt** `open.er-api.com` (ohne
Schlüssel). Dieser ist **ratenbegrenzt** und verlangt eine **sichtbare
Quellenangabe / einen Link auf exchangerate-api.com** (das Widget zeigt sie an).
Für den **geschäftlichen** Einsatz empfiehlt sich ein **eigener API-Schlüssel**
(höhere Limits, definierte Bedingungen).

### QR-Codes — lokal erzeugt
Das QR-Widget erzeugt QR-Codes **vollständig auf dem Gerät** über eine im Repo
mitgelieferte **MIT-Bibliothek** (`shared/vendor/qrcode.js`, Kazuhiko Arase
v1.4.4). Es wird **kein externer Dienst** kontaktiert – der QR-Inhalt (z. B.
WLAN-Passwort, vCard) **verlässt das Gerät nicht**. Privat wie geschäftlich
unbedenklich.

### RSS / News
Die RSS- und News-Widgets laden **direkt** die Feeds der jeweiligen Verlage.
Technisch funktionieren nur Feeds, die **Cross-Origin-Lesezugriffe (CORS)
erlauben** (eine kuratierte Liste liegt in `shared/data/rss-feeds.js`; jeder
Eintrag trägt ein `commercial`-Kennzeichen `ok`/`caution` für den Info-Marker).
**Rechtlich** gehören die Inhalte dem jeweiligen **Verlag**: Vor der Anzeige auf
öffentlichen oder geschäftlichen Bildschirmen bitte die **Nutzungsbedingungen des
einzelnen Feeds** prüfen (Anzeige von Überschriften, Auszügen, Logos,
Verlinkung der Quelle).

### Schriftarten — selbst gehostet
Die Oberfläche und die Slide-Themes verwenden **Inter**, **Inter Tight**,
**JetBrains Mono** und **Playfair Display**. Die Schriften werden **selbst
gehostet** (`woff2` unter `fonts/`, eingebunden über `styles/fonts.css`) – es
gehen **keine Anfragen an Google Fonts oder einen anderen externen Font-Host**.
Die Schriftdateien stehen unter der **SIL Open Font License 1.1** und dürfen
privat wie geschäftlich genutzt werden.

## Datenschutz (DSGVO): externe APIs & IP-Adressen

Mehrere Widgets holen ihre Inhalte **zur Laufzeit** von externen Diensten. Dabei
kontaktiert der Browser des **anzeigenden Geräts** den Anbieter und überträgt
dessen **IP-Adresse** (sie landet im Server-Log des Anbieters).

Zur Einordnung:

- Betroffen ist die IP des **Editor-Rechners** (beim Bauen einer Slide) bzw. des
  **Display-Geräts** (im Player) — **nicht** die IP des Publikums vor dem
  Bildschirm. Digital Signage überträgt keine Besucher-IPs.
- Es sind meist schlichte Daten-APIs (IP im Log, keine Cookies/kein Tracking).
  Verhältnismäßig ist daher **Transparenz**, kein Einwilligungs-Banner.

**Verantwortlich** ist der **Betreiber** des Studios bzw. der Displays
(DSGVO-Verantwortlicher). Er muss diese Übertragung in seiner
Datenschutzerklärung / im Verzeichnis von Verarbeitungstätigkeiten abbilden und
eine Rechtsgrundlage (Art. 6 DSGVO) prüfen.

### Betreiberpflichten (Impressum / Datenschutz)

Wer eine **öffentlich erreichbare Instanz** dieses Studios betreibt (z. B. unter
einer eigenen Domain), ist deren **Diensteanbieter** im Sinne des **§ 5 DDG** und
**DSGVO-Verantwortlicher**. Daraus folgt:

- **Impressum (§ 5 DDG):** ein leicht erkennbarer, mit einem Klick erreichbarer,
  ständig verfügbarer „Impressum"-Hinweis. Mehrere eigene (Sub-)Domains desselben
  Betreibers dürfen auf ein **zentrales** Impressum verweisen.
- **Datenschutzerklärung (Art. 13 DSGVO):** muss die **tatsächliche** Verarbeitung
  *dieser* Instanz beschreiben — insbesondere die oben gelisteten **IP-Übertragungen
  an Dritt-Dienste** (Open-Meteo, OSM/CARTO, Nominatim, ExchangeRate, RSS) sowie die
  Speicherung des agentView-API-Keys/Session-Tokens im `localStorage` (`avs_conn`).
  Ein Verweis auf eine fremde/zentrale Datenschutzseite genügt nur, wenn diese
  **genau diese Verarbeitung** mit abdeckt.

> **Wichtig für Forks / Self-Hosting:** Diese Pflichten treffen den **Betreiber**,
> nicht den Quellcode. Der Quellcode liefert deshalb **bewusst keine** Impressum-/
> Datenschutz-Seiten und keinen fest verdrahteten Rechtslink aus. Die optionalen
> Menü-Links sind in [`admin/legal-links.js`](../admin/legal-links.js) **an den
> Hostnamen gebunden** und erscheinen nur auf einer dort eingetragenen öffentlichen
> Deployment-Domain — auf einem Fork/Self-Host erscheint **nichts**, bis du deinen
> **eigenen** Hostnamen mit deinen **eigenen** Seiten einträgst. Liefere niemals die
> Rechtstexte eines anderen Betreibers als deine eigenen aus.

**Welches Widget überträgt die IP an wen:**

| Widget | Empfänger der IP | Anmerkung |
|---|---|---|
| Live Weather | Open-Meteo | feste Datenquelle |
| Map / Karte | OpenStreetMap- / CARTO-Tile-Server | je Kachel; beim Geocoding zusätzlich Nominatim |
| Currency / Währung | ExchangeRate-API | feste Datenquelle |
| RSS Feed, News with Photos | die konfigurierten Publisher-Feeds | je Feed |
| Live JSON, Chart, Data Table, KPI Cards | der vom Betreiber **konfigurierte Endpunkt** | Betreiber wählt die URL |
| Image, Image Gallery, Video, PDF, Web Page, Embed, YouTube/Vimeo, Live Stream, Audio Visualizer | der geladene **URL-/Asset-Host** | Betreiber wählt die Quelle |
| QR Code | — | lokal erzeugt, keine Übertragung |

**Was die Software dafür tut (Privacy by Design):**

- **Keine Dritt-CDN-Aufrufe** für Programmbibliotheken (alles self-hosted unter
  `shared/vendor/`, siehe `THIRD-PARTY-NOTICES.md`).
- **Datensparsame Editor-Vorschau:** Live-Widgets zeigen im Editor zunächst einen
  Platzhalter und holen **erst auf Klick** Live-Daten — bis dahin wird **keine
  IP** übertragen.
- **Hinweis im Inspector:** Bei einem ausgewählten Live-Widget steht, an welchen
  Anbieter die Geräte-IP beim Rendern geht.
- Auf dem **Display** rendern Live-Widgets bewusst direkt live (das ist der Zweck
  einer Anzeige) — hier greift die Betreiber-Verantwortung.

## Checkliste für den geschäftlichen Einsatz

- [ ] Wetter: Open-Meteo-Bedingungen geprüft / ggf. eigenen API-Schlüssel hinterlegen.
- [ ] Karte: **eigenen** Kachel-Anbieter (eigene Tile-URL) statt der öffentlichen
      OSM-/CARTO-Endpunkte; „© OpenStreetMap contributors" (+ „© CARTO") sichtbar lassen.
- [ ] Geocoding: **eigene Nominatim-Instanz** oder kommerziellen Geocoder.
- [ ] Währung: **eigenen ExchangeRate-API-Schlüssel**; Quellenangabe anzeigen.
- [ ] RSS: Bedingungen **jedes** genutzten Feeds geprüft.
- [x] QR-Codes: lokal erzeugt – nichts zu tun.
- [x] Schriftarten: selbst gehostet – keine Google-Anfragen.
- [ ] **DSGVO:** IP-Übertragung der Live-Widgets in der eigenen
      Datenschutzerklärung abbilden (siehe Abschnitt „Datenschutz (DSGVO)").
