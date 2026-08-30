// Universal slide sets — the ones that fit any organisation, plus the blank
// start. Every template here is written so that a user who changes nothing
// still has a screen that says something true about their building.

import { registerTemplate } from './registry.js';
import { L, S, W, headline, paragraph, backdrop, tickerBar, cornerClock, FEEDS, PLACES, inDays, at, onWeekday } from './lib.js';

registerTemplate({
  id: 'blank',
  category: 'blank',
  accent: '#8b5cf6',
  name: L('Blank slide set', 'Leeres Folienset'),
  description: L(
    'One empty 16:9 slide. Build everything yourself from the widget library.',
    'Eine leere 16:9-Folie. Alles selbst aus der Widget-Bibliothek zusammenstellen.'),
  tags: [L('empty', 'leer'), L('from scratch', 'von Grund auf')],
  defaults: { theme: 'minimal-dark', transition: 'fade', duration: 10 },
  build: () => [S({ name: L('Slide 1', 'Folie 1'), widgets: [] })],
});

registerTemplate({
  id: 'generic-welcome-board',
  category: 'generic',
  accent: '#06b6d4',
  name: L('Welcome & info board', 'Willkommens- & Infotafel'),
  description: L(
    'The everyday lobby loop: a greeting that follows the time of day, live weather, opening hours, a news ticker and a QR code for your website.',
    'Die Alltagsschleife für den Eingang: Begrüßung passend zur Tageszeit, Live-Wetter, Öffnungszeiten, Nachrichten-Ticker und ein QR-Code zur Website.'),
  tags: [L('lobby', 'Empfang'), L('weather', 'Wetter'), L('news', 'Nachrichten'), 'QR'],
  defaults: { theme: 'gradient-blue', transition: 'fade', duration: 12 },
  build: () => [
    S({
      name: L('Welcome', 'Willkommen'),
      theme: 'gradient-blue',
      transition: 'zoom',
      widgets: [
        W('greeting', [6, 18, 88, 56], {
          venue: L('our office', 'unserem Haus'),
          welcomeTo: L('welcome to', 'willkommen in'),
          subtitle: L('Guest WiFi: “Guest” · password on request at reception',
            'Gäste-WLAN: „Guest“ · Passwort am Empfang'),
          timezone: 'Europe/Berlin',
          showDate: true, showTime: true, locale: '', textScale: 220,
          theme: 'gradient-blue',
        }, { anim: 'fade-up', duration: 700 }),
        cornerClock({ theme: 'gradient-blue', display: 'time', textScale: 150 }),
      ],
    }),
    S({
      name: L('Weather', 'Wetter'),
      theme: 'gradient-blue',
      duration: 10,
      widgets: [
        W('weather', [4, 6, 92, 82], {
          dataMode: 'live', location: PLACES.munich, unit: 'C', windUnit: 'kmh', apiKey: '',
          refreshSec: 900, locale: '', timeFormat: 'auto',
          showCity: true, showTemp: true, showIcon: true, showDescription: true,
          showHiLo: true, showStats: true, showWindVector: false, showPrecip: true,
          showSunrise: true, showForecast: true, forecastDays: 5, showHourly: false, hourlyHours: 12,
          showAlerts: true, showUv: false, colorTemperature: true,
          design: 'dashboard', theme: 'gradient-blue', textScale: 100, iconSet: 'auto',
        }, { anim: 'fade', duration: 600 }),
        tickerBar([
          L('Reception is staffed from 08:00 to 18:00', 'Der Empfang ist von 08:00 bis 18:00 besetzt'),
          L('Visitors: please sign in at the front desk', 'Besucher: bitte am Empfang anmelden'),
        ], { theme: 'gradient-blue', speed: 60 }),
      ],
    }),
    S({
      name: L('Opening hours', 'Öffnungszeiten'),
      theme: 'minimal-dark',
      duration: 12,
      widgets: [
        W('opening-hours', [8, 8, 84, 78], {
          heading: L('Opening hours', 'Öffnungszeiten'),
          days: [
            { day: 'mon', from: '08:00', to: '18:00', from2: '', to2: '', closed: false },
            { day: 'tue', from: '08:00', to: '18:00', from2: '', to2: '', closed: false },
            { day: 'wed', from: '08:00', to: '18:00', from2: '', to2: '', closed: false },
            { day: 'thu', from: '08:00', to: '18:00', from2: '', to2: '', closed: false },
            { day: 'fri', from: '08:00', to: '16:00', from2: '', to2: '', closed: false },
            { day: 'sat', from: '', to: '', from2: '', to2: '', closed: true },
            { day: 'sun', from: '', to: '', from2: '', to2: '', closed: true },
          ],
          timezone: 'Europe/Berlin', locale: '', hour12: false,
          dayStyle: 'long', layout: 'list', showStatus: true, highlightToday: true,
          closedText: L('Closed', 'Geschlossen'),
          openLabel: L('Open now', 'Jetzt geöffnet'),
          closedLabel: L('Closed', 'Geschlossen'),
          note: L('Public holidays closed', 'An Feiertagen geschlossen'),
          textScale: 95, theme: 'minimal-dark',
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('News', 'Nachrichten'),
      theme: 'editorial-mono',
      duration: 20,
      widgets: [
        W('news-photos', [3, 4, 94, 84], {
          dataMode: 'live', url: [FEEDS.deNews], refreshSec: 300, maxItems: 6,
          theme: 'editorial-mono', textScale: 100, cardLayout: 'auto', columns: 3,
          showDesc: true, showDate: true, showSource: false, locale: '',
          mode: 'paginate', pageSec: 9,
        }),
      ],
    }),
    S({
      name: L('Stay in touch', 'Bleiben Sie in Kontakt'),
      theme: 'minimal-dark',
      duration: 12,
      widgets: [
        W('text', [6, 14, 46, 60], headline(
          L('Everything else<br>is online', 'Alles Weitere<br>online'),
          { theme: 'minimal-dark', valign: 'middle', textScale: 355 }),
        { anim: 'fade-right', duration: 600 }),
        W('qr-code', [56, 14, 38, 68], {
          template: 'url', url: 'https://agentview.de', text: '',
          wifiSsid: '', wifiPassword: '', wifiEnc: 'WPA', wifiHidden: false,
          vcardName: '', vcardPhone: '', vcardEmail: '', vcardOrg: '', vcardUrl: '',
          label: L('Scan for our website', 'Scannen für unsere Website'),
          showDetails: false, layout: 'vertical', size: 480, moduleStyle: 'rounded',
          fgColor: '#000000', bgColor: '#ffffff', ecLevel: 'M', logoUrl: '', logoSize: 22,
          frameless: false, textScale: 320, theme: 'minimal-dark', textColor: '', accentColor: '',
        }, { anim: 'scale', delay: 250, duration: 600 }),
      ],
    }),
  ],
});

registerTemplate({
  id: 'generic-announcements',
  category: 'generic',
  accent: '#f59e0b',
  name: L('Announcements & notices', 'Ankündigungen & Aushänge'),
  description: L(
    'A notice board that reads at a glance: one urgent alert, a normal announcement, a bullet list of the week and a rolling ticker underneath.',
    'Ein schwarzes Brett, das auf einen Blick lesbar ist: eine dringende Meldung, eine normale Ankündigung, die Woche als Liste und ein Laufband darunter.'),
  tags: [L('notice board', 'Schwarzes Brett'), L('alert', 'Störung'), L('internal', 'intern')],
  defaults: { theme: 'minimal-dark', transition: 'slide-up', duration: 12 },
  build: () => [
    S({
      name: L('Urgent', 'Dringend'),
      theme: 'minimal-dark',
      duration: 10,
      widgets: [
        W('text', [0, 0, 100, 100], {
          ...paragraph(L(
            '<h2>Lift B out of service</h2><p>Maintenance until Friday 16:00. Please use lift A or the east staircase.</p>',
            '<h2>Aufzug B außer Betrieb</h2><p>Wartung bis Freitag 16:00 Uhr. Bitte Aufzug A oder das Osttreppenhaus benutzen.</p>'),
          { theme: 'minimal-dark', maxWidth: 'comfortable' }),
          priority: 'urgent', pulse: true,
          textScale: 235,
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('Information', 'Information'),
      theme: 'minimal-dark',
      duration: 12,
      widgets: [
        W('text', [0, 0, 100, 100], {
          ...paragraph(L(
            '<h2>New coffee machine in the kitchen</h2><p>Second floor, next to the copier. Short briefing on Wednesday at 10:00.</p>',
            '<h2>Neue Kaffeemaschine in der Küche</h2><p>Zweiter Stock, neben dem Kopierer. Kurze Einweisung am Mittwoch um 10:00 Uhr.</p>'),
          { theme: 'minimal-dark', maxWidth: 'comfortable' }),
          priority: 'info',
          textScale: 235,
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('This week', 'Diese Woche'),
      theme: 'dark-minimal',
      duration: 16,
      widgets: [
        W('markdown', [6, 8, 88, 80], {
          body: L(
            '## This week\n\n- **Monday** — Team meeting, 09:00, room 2.14\n- **Tuesday** — Fire drill, 11:00\n- **Wednesday** — Coffee briefing, 10:00\n- **Thursday** — Guests from the district office\n- **Friday** — Early close at 16:00\n\n> Questions? Ask at reception.',
            '## Diese Woche\n\n- **Montag** — Teambesprechung, 09:00, Raum 2.14\n- **Dienstag** — Feueralarmprobe, 11:00\n- **Mittwoch** — Kaffee-Einweisung, 10:00\n- **Donnerstag** — Besuch vom Landratsamt\n- **Freitag** — Früher Schluss um 16:00\n\n> Fragen? Einfach am Empfang melden.'),
          sourceUrl: '', refreshSec: 0, theme: 'dark-minimal', textScale: 160,
          align: 'left', valign: 'middle', columns: '1', autoScroll: false, scrollSec: 30,
        }, { anim: 'reveal', duration: 700 }),
      ],
    }),
    S({
      name: L('Ticker', 'Laufband'),
      theme: 'minimal-dark',
      duration: 14,
      widgets: [
        W('text', [5, 8, 90, 79], headline(
          L('Good to know', 'Gut zu wissen'), { theme: 'minimal-dark', textScale: 400 }),
        { anim: 'blur', duration: 700 }),
        tickerBar([
          L('Canteen: today’s soup is pumpkin', 'Kantine: heute Kürbissuppe'),
          L('Parking deck 2 closed on Saturday', 'Parkdeck 2 am Samstag gesperrt'),
          L('Please keep fire doors closed', 'Bitte Brandschutztüren geschlossen halten'),
          L('IT support: extension 4711', 'IT-Support: Durchwahl 4711'),
        ], { theme: 'minimal-dark', lead: L('NOTICE', 'HINWEIS'), uppercase: false }),
      ],
    }),
  ],
});

registerTemplate({
  id: 'generic-kpi-dashboard',
  category: 'generic',
  accent: '#38bdf8',
  name: L('Live KPI dashboard', 'Live-KPI-Dashboard'),
  description: L(
    'Four numbers that matter, a trend chart, a goal ring and a table — all wired to inline data you replace with a JSON URL when you are ready.',
    'Vier Zahlen, die zählen, ein Trendchart, ein Zielring und eine Tabelle — mit Beispieldaten, die Sie später gegen eine JSON-URL tauschen.'),
  tags: ['KPI', L('dashboard', 'Dashboard'), L('metrics', 'Kennzahlen'), 'JSON'],
  defaults: { theme: 'corporate-blue', transition: 'dissolve', duration: 14 },
  build: () => [
    S({
      name: L('Key figures', 'Kennzahlen'),
      theme: 'corporate-blue',
      widgets: [
        W('text', [5, 5, 58, 20], headline(
          L('Today at a glance', 'Heute auf einen Blick'),
          { theme: 'corporate-blue', valign: 'middle', textScale: 390 })),
        cornerClock({ theme: 'corporate-blue', display: 'time', rect: [75, 5, 20, 20], textScale: 105 }),
        W('kpi-cards', [5, 27, 90, 68], {
          cards: [
            { label: L('Revenue', 'Umsatz'), value: 124500, target: 150000, unit: '€', deltaPct: 4.2, history: '98, 102, 110, 108, 115, 120, 124', goodIsDown: '' },
            { label: L('Orders', 'Aufträge'), value: 842, target: 900, unit: '', deltaPct: 2.8, history: '712, 745, 760, 788, 802, 820, 842', goodIsDown: '' },
            { label: L('Response time', 'Reaktionszeit'), value: 42, target: 30, unit: 'min', deltaPct: -6.1, history: '58, 55, 51, 49, 47, 44, 42', goodIsDown: 1 },
            { label: 'NPS', value: 64, target: 70, unit: '', deltaPct: 2.0, history: '58, 60, 62, 61, 63, 63, 64', goodIsDown: '' },
          ],
          source: 'inline', dataUrl: '', refreshSec: 0,
          columns: '4', density: 'comfortable',
          showDelta: true, showSparkline: true, showTarget: true,
          numberFormat: 'compact', locale: '', textScale: 180, theme: 'corporate-blue',
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('Trend', 'Trend'),
      theme: 'corporate-blue',
      widgets: [
        W('chart', [4, 6, 60, 84], {
          kind: 'bar', source: 'inline',
          data: [
            { label: L('Mon', 'Mo'), value: 18 }, { label: L('Tue', 'Di'), value: 24 },
            { label: L('Wed', 'Mi'), value: 21 }, { label: L('Thu', 'Do'), value: 29 },
            { label: L('Fri', 'Fr'), value: 26 }, { label: L('Sat', 'Sa'), value: 12 },
          ],
          dataUrl: '', refreshSec: 0, sortOrder: 'none', theme: 'corporate-blue',
          xLabel: '', yLabel: L('Orders', 'Aufträge'), yMax: 0,
          goalValue: 25, goalLabel: L('Target', 'Ziel'),
          showLegend: false, showValues: true, seriesLabel: '', valueFormat: 'compact',
          locale: '', valueUnit: '', palette: [],
        }, { anim: 'rise', duration: 700 }),
        W('progress', [68, 6, 28, 40], {
          label: L('Monthly goal', 'Monatsziel'),
          value: 68, target: 100, unit: '%',
          source: 'inline', dataUrl: '', refreshSec: 60,
          style: 'ring', showValue: true, animate: true,
          align: 'center', labelPos: 'below', labelEmphasis: false,
          color: '#22c55e', locale: '', textScale: 120, labelScale: 100, valueScale: 100,
          useThresholds: true, invertThresholds: false, thresholdWarn: 60, thresholdGood: 85,
          colorLow: '#ef4444', colorMid: '#f59e0b', colorHigh: '#22c55e',
          theme: 'corporate-blue',
        }, { anim: 'scale', delay: 200, duration: 600 }),
        W('progress', [68, 50, 28, 40], {
          label: L('Open tickets closed', 'Tickets geschlossen'),
          value: 47, target: 60, unit: '',
          source: 'inline', dataUrl: '', refreshSec: 60,
          style: 'gauge', showValue: true, animate: true,
          align: 'center', labelPos: 'below', labelEmphasis: false,
          color: '#38bdf8', locale: '', textScale: 120, labelScale: 100, valueScale: 100,
          useThresholds: false, invertThresholds: false, thresholdWarn: 70, thresholdGood: 90,
          colorLow: '#ef4444', colorMid: '#f59e0b', colorHigh: '#22c55e',
          theme: 'corporate-blue',
        }, { anim: 'scale', delay: 350, duration: 600 }),
      ],
    }),
    S({
      name: L('Detail table', 'Detailtabelle'),
      theme: 'dark-minimal',
      duration: 16,
      widgets: [
        W('data-table', [4, 6, 92, 84], {
          source: 'inline',
          headers: L('Region, Owner, Pipeline, Status', 'Region, Verantwortlich, Pipeline, Status'),
          align: 'llrl',
          rows: [
            { c1: 'DACH', c2: 'M. Weber', c3: '412.000 €', c4: 'OK' },
            { c1: 'Benelux', c2: 'S. Jansen', c3: '286.500 €', c4: 'OK' },
            { c1: 'Nordics', c2: 'A. Lind', c3: '198.200 €', c4: L('AT RISK', 'KRITISCH') },
            { c1: 'UK & IE', c2: 'P. Doyle', c3: '241.900 €', c4: 'OK' },
            { c1: 'CEE', c2: 'K. Nowak', c3: '132.700 €', c4: L('AT RISK', 'KRITISCH') },
          ],
          dataUrl: '', refreshSec: 0, striped: true, autoAlignNumbers: true,
          density: 'comfortable', headerStyle: 'accent', textScale: 265,
          pageRows: 0, pageSec: 8,
          // Only the exception is tinted: a column where OK is green on four
          // rows out of five has no signal left for the fifth.
          highlightRules: [{ keyword: L('AT RISK', 'KRITISCH'), color: 'bad' }],
          theme: 'dark-minimal',
        }, { anim: 'fade', duration: 500 }),
      ],
    }),
  ],
});

registerTemplate({
  id: 'generic-event-countdown',
  category: 'generic',
  accent: '#c4b5fd',
  name: L('Event countdown', 'Event-Countdown'),
  description: L(
    'Build anticipation: a big countdown, the programme, the venue on a map and a QR code to register. Dates are set relative to today, so nothing is ever in the past.',
    'Vorfreude aufbauen: großer Countdown, Programm, Veranstaltungsort auf der Karte und QR-Code zur Anmeldung. Die Termine liegen relativ zu heute — nie in der Vergangenheit.'),
  tags: [L('event', 'Veranstaltung'), 'Countdown', L('programme', 'Programm'), L('map', 'Karte')],
  defaults: { theme: 'gradient-purple', transition: 'zoom-blur', duration: 12 },
  build: () => [
    S({
      name: L('Countdown', 'Countdown'),
      theme: 'gradient-purple',
      widgets: [
        W('countdown', [6, 12, 88, 66], {
          target: { at: inDays(21), tz: 'Europe/Berlin' },
          heading: L('Our open day starts in', 'Unser Tag der offenen Tür beginnt in'),
          theme: 'gradient-purple',
          expiredText: L('It’s today!', 'Heute ist es soweit!'),
          units: 'dhm', unitStyle: 'full', locale: '', showTarget: true,
          textScale: 160, urgentBelow: 24, urgentColor: '#f59e0b', finishedMode: 'text',
        }, { anim: 'scale', duration: 700 }),
        tickerBar([
          L('Free entry · no registration needed', 'Eintritt frei · keine Anmeldung nötig'),
          L('Guided tours every full hour', 'Führungen zu jeder vollen Stunde'),
        ], { theme: 'gradient-purple', speed: 55 }),
      ],
    }),
    S({
      name: L('Programme', 'Programm'),
      theme: 'gradient-purple',
      duration: 16,
      widgets: [
        W('calendar', [6, 6, 88, 84], {
          heading: L('Programme', 'Programm'),
          view: 'agenda', maxItems: 6, hidePast: true, daysAhead: 0,
          weekDays: 'full', perDayCap: 0, emptyText: '', roomName: '', showClock: false,
          icsUrl: '', refreshSec: 900, locale: '', theme: 'gradient-purple', textScale: 235,
          events: [
            { start: at(21, '10:00'), summary: L('Doors open', 'Türen öffnen'), location: L('Main entrance', 'Haupteingang') },
            { start: at(21, '10:30'), summary: L('Welcome address', 'Begrüßung'), location: L('Atrium', 'Atrium') },
            { start: at(21, '11:00'), summary: L('Guided tour', 'Führung'), location: L('Meeting point: reception', 'Treffpunkt: Empfang') },
            { start: at(21, '13:00'), summary: L('Lunch & networking', 'Mittagessen & Networking'), location: L('Canteen', 'Kantine') },
            { start: at(21, '15:00'), summary: L('Q&A with the team', 'Fragerunde mit dem Team'), location: L('Room 2.14', 'Raum 2.14') },
          ],
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('How to find us', 'So finden Sie uns'),
      theme: 'minimal-dark',
      duration: 14,
      widgets: [
        W('map', [0, 0, 62, 100], {
          location: {
            lat: 48.137, lng: 11.575, zoom: 14,
            markers: [{ lat: 48.137, lng: 11.575, label: L('Main entrance', 'Haupteingang'), icon: 'map-pin' }],
          },
          style: 'carto-dark', fitMarkers: false, tileFilter: 'none',
          caption: L('Marienplatz 1 · 80331 Munich', 'Marienplatz 1 · 80331 München'),
          tourSec: 0, lockInteraction: true, tileUrl: '', tileAttribution: '',
        }),
        W('text', [64, 8, 32, 34], paragraph(L(
          '<h2>Getting here</h2><p>U3 / U6 to Marienplatz.<br>Parking: Rindermarkt garage, 3 min walk.</p>',
          '<h2>Anfahrt</h2><p>U3 / U6 bis Marienplatz.<br>Parken: Tiefgarage Rindermarkt, 3 Min. Fußweg.</p>'),
        { theme: 'minimal-dark', valign: 'top', textScale: 215 }), { anim: 'fade-left', duration: 600 }),
        W('qr-code', [64, 44, 32, 50], {
          template: 'url', url: 'https://agentview.de', text: '',
          wifiSsid: '', wifiPassword: '', wifiEnc: 'WPA', wifiHidden: false,
          vcardName: '', vcardPhone: '', vcardEmail: '', vcardOrg: '', vcardUrl: '',
          label: L('Register here', 'Hier anmelden'),
          showDetails: false, layout: 'vertical', size: 380, moduleStyle: 'square',
          fgColor: '#000000', bgColor: '#ffffff', ecLevel: 'M', logoUrl: '', logoSize: 22,
          frameless: false, textScale: 345, theme: 'minimal-dark', textColor: '', accentColor: '',
        }, { anim: 'fade-left', delay: 200, duration: 600 }),
      ],
    }),
  ],
});

registerTemplate({
  id: 'generic-photo-story',
  category: 'generic',
  accent: '#fdba74',
  name: L('Photo story', 'Bildergeschichte'),
  description: L(
    'A cinematic loop built around your own pictures: a full-bleed title over a photo, a Ken Burns gallery and a closing quote. Drop images in and it is done.',
    'Eine cineastische Schleife um Ihre eigenen Bilder: Titel über einem randlosen Foto, eine Ken-Burns-Galerie und ein Schlusszitat. Bilder einsetzen — fertig.'),
  tags: [L('images', 'Bilder'), L('gallery', 'Galerie'), 'Ken Burns', L('story', 'Story')],
  defaults: { theme: 'dark-minimal', transition: 'dissolve', duration: 10 },
  build: () => [
    S({
      name: L('Title', 'Titel'),
      theme: 'dark-minimal',
      widgets: [
        W('image', [0, 0, 100, 100], backdrop('', 62), { z: 0, loop: 'kenburns' }),
        W('text', [5, 52, 62, 36], headline(
          L('A year<br>in pictures', 'Ein Jahr<br>in Bildern'),
          { theme: 'dark-minimal', valign: 'bottom', textScale: 395 }), { z: 1, anim: 'fade-up', duration: 800 }),
      ],
    }),
    S({
      name: L('Gallery', 'Galerie'),
      theme: 'dark-minimal',
      duration: 30,
      widgets: [
        W('image-gallery', [0, 0, 100, 100], {
          urls: [], perImageSec: 6, fit: 'cover',
          kenBurns: true, kenBurnsIntensity: 'medium',
          transition: 'fade', transitionMs: 900,
          shuffle: false, reshuffleEachLoop: false,
          showCaptions: true, showProgress: 'dots',
        }),
      ],
    }),
    S({
      name: L('Closing', 'Abspann'),
      theme: 'editorial-mono',
      duration: 12,
      widgets: [
        W('quote', [8, 14, 84, 72], {
          quote: L('We shape our buildings; thereafter they shape us.',
            'Wir formen unsere Gebäude; danach formen sie uns.'),
          author: 'Winston Churchill', source: '', portrait: '',
          layout: 'fullscreen', markStyle: 'classic', textScale: 140,
          quotes: [], rotateSecs: 12, theme: 'editorial-mono',
        }, { anim: 'reveal', duration: 800 }),
      ],
    }),
  ],
});

registerTemplate({
  id: 'generic-world-office',
  category: 'generic',
  accent: '#93c5fd',
  name: L('Global office board', 'Globale Bürotafel'),
  description: L(
    'For teams spread across timezones: world clocks, currency rates, a shared agenda and a business news feed.',
    'Für Teams über Zeitzonen hinweg: Weltzeituhren, Wechselkurse, gemeinsame Agenda und ein Wirtschafts-Newsfeed.'),
  tags: [L('timezones', 'Zeitzonen'), L('currency', 'Währungen'), L('remote', 'Remote'), L('agenda', 'Agenda')],
  defaults: { theme: 'dark-minimal', transition: 'push', duration: 12 },
  build: () => [
    S({
      name: L('World clocks', 'Weltzeit'),
      theme: 'dark-minimal',
      widgets: [
        W('world-clock', [4, 8, 92, 80], {
          zones: [
            { label: L('Munich', 'München'), tz: 'Europe/Berlin' },
            { label: 'London', tz: 'Europe/London' },
            { label: 'New York', tz: 'America/New_York' },
            { label: 'Singapore', tz: 'Asia/Singapore' },
          ],
          display: 'time-date', dateFormat: 'weekday-short', hour12: false, locale: '',
          showOffset: true, showRelative: false, showDayNight: true,
          layout: 'auto', highlightFirst: true, textScale: 115, theme: 'dark-minimal',
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('Rates', 'Kurse'),
      theme: 'corporate-blue',
      duration: 10,
      widgets: [
        W('currency', [6, 10, 88, 76], {
          dataMode: 'live', base: 'EUR', symbols: ['USD', 'GBP', 'CHF', 'SGD'],
          refreshSec: 3600, decimals: 'auto', locale: '', showName: true, trend: true,
          textScale: 100, theme: 'corporate-blue', textColor: '', accentColor: '',
        }, { anim: 'fade', duration: 500 }),
      ],
    }),
    S({
      name: L('Shared agenda', 'Gemeinsame Agenda'),
      theme: 'minimal-dark',
      duration: 14,
      widgets: [
        W('calendar', [4, 6, 92, 84], {
          heading: L('Company calendar', 'Firmenkalender'),
          // A week GRID draws the week it is looked at in, so hidePast is off and
          // the events are anchored to that week rather than to "today + n".
          view: 'week', maxItems: 8, hidePast: false, daysAhead: 7,
          weekDays: 'work', perDayCap: 3, emptyText: '', roomName: '', showClock: false,
          icsUrl: '', refreshSec: 900, locale: '', theme: 'minimal-dark', textScale: 250,
          events: [
            { start: onWeekday(0, '09:00'), summary: L('All-hands', 'All-Hands'), location: 'Zoom' },
            { start: onWeekday(2, '14:00'), summary: L('Design review', 'Design-Review'), location: L('Room 3.02', 'Raum 3.02') },
            { start: onWeekday(3, '11:00'), summary: L('Release window', 'Release-Fenster'), location: '' },
          ],
        }),
      ],
    }),
    S({
      name: L('Business news', 'Wirtschaftsnews'),
      theme: 'gradient-blue',
      duration: 18,
      widgets: [
        W('rss', [4, 6, 92, 78], {
          dataMode: 'live', url: [FEEDS.business], theme: 'gradient-blue', textScale: 100,
          showDesc: true, showDate: true, dateFormat: 'relative', locale: '',
          mode: 'paginate', pageSec: 8, tickerSpeed: 80, maxItems: 8, refreshSec: 300,
        }),
        tickerBar([
          L('Internal figures are on the intranet', 'Interne Zahlen im Intranet'),
          L('Quarterly call every first Monday, 15:00 CET', 'Quartals-Call jeden ersten Montag, 15:00 MEZ'),
        ], { theme: 'gradient-blue' }),
      ],
    }),
  ],
});
