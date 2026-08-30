// Offices, plants and warehouses — screens that face employees rather than
// customers, so the currency is numbers, shifts and safety rather than prices.

import { registerTemplate } from './registry.js';
import { L, S, W, headline, paragraph, tickerBar, cornerClock, FEEDS, PLACES, daysAgo, at, onWeekday } from './lib.js';

registerTemplate({
  id: 'corp-reception',
  category: 'corporate',
  accent: '#38bdf8',
  name: L('Reception & visitors', 'Empfang & Besucher'),
  description: L(
    'The front desk loop: a named welcome for today’s visitors, the meeting-room agenda, WiFi as a QR code and the way to the meeting floor.',
    'Die Empfangsschleife: namentliche Begrüßung der heutigen Gäste, Raumbelegung, WLAN als QR-Code und der Weg zur Besprechungsetage.'),
  tags: [L('reception', 'Empfang'), L('visitors', 'Besucher'), L('meeting rooms', 'Besprechungsräume'), 'WiFi'],
  defaults: { theme: 'corporate-blue', transition: 'fade', duration: 12 },
  build: () => [
    S({
      name: L('Welcome', 'Willkommen'),
      theme: 'corporate-blue',
      transition: 'zoom',
      widgets: [
        W('greeting', [5, 10, 90, 42], {
          venue: L('our headquarters', 'unserer Zentrale'),
          welcomeTo: L('welcome to', 'willkommen in'),
          subtitle: '',
          timezone: 'Europe/Berlin', showDate: true, showTime: true,
          locale: '', textScale: 310, theme: 'corporate-blue',
        }, { anim: 'fade-up', duration: 700 }),
        W('data-table', [10, 54, 80, 34], {
          source: 'inline',
          headers: L('Time, Guest, Host, Room', 'Zeit, Gast, Gastgeber, Raum'),
          align: 'llll',
          rows: [
            { c1: '09:30', c2: L('Maria Lindqvist — Nordwind AG', 'Maria Lindqvist — Nordwind AG'), c3: 'S. Bauer', c4: '2.14' },
            { c1: '11:00', c2: L('Tom Ricci — Ricci Logistics', 'Tom Ricci — Ricci Logistik'), c3: 'A. Klein', c4: '3.02' },
            { c1: '14:00', c2: L('Auditor — TÜV', 'Prüfer — TÜV'), c3: 'K. Hoffmann', c4: L('Lab', 'Labor') },
          ],
          dataUrl: '', refreshSec: 0, striped: false, autoAlignNumbers: false,
          density: 'comfortable', headerStyle: 'accent', textScale: 400,
          pageRows: 0, pageSec: 8, highlightRules: [], theme: 'corporate-blue',
        }, { anim: 'fade-up', delay: 250, duration: 600 }),
      ],
    }),
    S({
      name: L('Meeting rooms', 'Raumbelegung'),
      theme: 'corporate-blue',
      duration: 14,
      widgets: [
        W('calendar', [4, 6, 92, 82], {
          heading: L('Room 2.14 — today', 'Raum 2.14 — heute'),
          view: 'now-next', maxItems: 6, hidePast: true, daysAhead: 1,
          weekDays: 'work', perDayCap: 0, emptyText: L('Free all day', 'Ganztägig frei'),
          roomName: '2.14', showClock: true,
          icsUrl: '', refreshSec: 900, locale: '', theme: 'corporate-blue', textScale: 100,
          events: [
            { start: at(0, '09:30'), summary: L('Supplier meeting', 'Lieferantengespräch'), location: '2.14' },
            { start: at(0, '11:00'), summary: L('Product review', 'Produkt-Review'), location: '2.14' },
            { start: at(0, '14:00'), summary: L('Audit preparation', 'Audit-Vorbereitung'), location: '2.14' },
          ],
        }, { anim: 'fade', duration: 500 }),
      ],
    }),
    S({
      name: L('Guest WiFi', 'Gäste-WLAN'),
      theme: 'corporate-blue',
      duration: 12,
      widgets: [
        W('text', [6, 16, 44, 42], paragraph(
          L('<h2>Guest WiFi</h2><p>Scan the code — no password to type in, no note to lose.</p>',
            '<h2>Gäste-WLAN</h2><p>Code scannen — kein Passwort abtippen, kein Zettel, der verloren geht.</p>'),
          { theme: 'corporate-blue', textScale: 270 }), { anim: 'fade-right', duration: 600 }),
        W('qr-code', [54, 10, 40, 78], {
          template: 'wifi', url: '', text: '',
          wifiSsid: 'Company-Guest', wifiPassword: 'Welcome-2026', wifiEnc: 'WPA', wifiHidden: false,
          vcardName: '', vcardPhone: '', vcardEmail: '', vcardOrg: '', vcardUrl: '',
          label: L('Guest network', 'Gästenetz'),
          showDetails: true, layout: 'vertical', size: 480, moduleStyle: 'rounded',
          fgColor: '#000000', bgColor: '#ffffff', ecLevel: 'Q', logoUrl: '', logoSize: 22,
          frameless: false, textScale: 305, theme: 'corporate-blue', textColor: '', accentColor: '',
        }, { anim: 'scale', delay: 200, duration: 600 }),
      ],
    }),
    S({
      name: L('Wayfinding', 'Wegweiser'),
      theme: 'minimal-dark',
      duration: 12,
      widgets: [
        W('steps', [4, 10, 92, 72], {
          heading: L('To the meeting floor', 'Zur Besprechungsetage'),
          steps: [
            { title: L('Sign in', 'Anmelden'), desc: L('Reception issues your visitor badge.', 'Der Empfang stellt Ihren Besucherausweis aus.'), icon: 'user' },
            { title: L('Lift A', 'Aufzug A'), desc: L('Behind the reception desk, on the right.', 'Hinter dem Empfang, rechts.'), icon: 'arrow' },
            { title: L('Second floor', 'Zweite Etage'), desc: L('Rooms 2.01 – 2.20, follow the blue line.', 'Räume 2.01 – 2.20, der blauen Linie folgen.'), icon: 'map-pin' },
          ],
          layout: 'horizontal', numberStyle: 'circle', showConnector: true, showDesc: true,
          spotlight: 0, autoAdvanceSec: 0, textScale: 120, theme: 'minimal-dark',
        }, { anim: 'fade-up', duration: 600 }),
        tickerBar([
          L('Visitors must be accompanied at all times', 'Besucher werden durchgehend begleitet'),
          L('Emergency exits are marked in green', 'Fluchtwege sind grün gekennzeichnet'),
        ], { theme: 'minimal-dark', speed: 55 }),
      ],
    }),
  ],
});

registerTemplate({
  id: 'corp-team-dashboard',
  category: 'corporate',
  accent: '#8b5cf6',
  name: L('Team dashboard', 'Team-Dashboard'),
  description: L(
    'The wall screen for an engineering or sales floor: sprint numbers, a team leaderboard, the shared calendar and a tech news feed.',
    'Der Wandbildschirm fürs Team: Sprint-Zahlen, ein Team-Ranking, der gemeinsame Kalender und ein Tech-Newsfeed.'),
  tags: ['KPI', L('sprint', 'Sprint'), L('leaderboard', 'Ranking'), L('team', 'Team')],
  defaults: { theme: 'dark-minimal', transition: 'dissolve', duration: 14 },
  build: () => [
    S({
      name: L('Sprint', 'Sprint'),
      theme: 'dark-minimal',
      widgets: [
        W('text', [5, 5, 58, 20], headline(
          L('Sprint 42 — day 6 of 10', 'Sprint 42 — Tag 6 von 10'),
          { theme: 'dark-minimal', textScale: 395 })),
        cornerClock({ theme: 'dark-minimal', display: 'time', rect: [75, 5, 20, 20], textScale: 105 }),
        W('kpi-cards', [5, 27, 61, 66], {
          cards: [
            { label: L('Story points done', 'Story Points erledigt'), value: 34, target: 55, unit: '', deltaPct: 12, history: '0, 5, 11, 18, 26, 34', goodIsDown: '' },
            { label: L('Open bugs', 'Offene Bugs'), value: 7, target: 5, unit: '', deltaPct: -22, history: '14, 13, 11, 10, 9, 7', goodIsDown: 1 },
            { label: L('Build time', 'Build-Dauer'), value: 4.2, target: 5, unit: 'min', deltaPct: -9, history: '6.1, 5.8, 5.2, 4.9, 4.5, 4.2', goodIsDown: 1 },
            { label: L('Deploys this week', 'Deploys diese Woche'), value: 18, target: 15, unit: '', deltaPct: 20, history: '9, 11, 12, 14, 16, 18', goodIsDown: '' },
          ],
          source: 'inline', dataUrl: '', refreshSec: 0,
          columns: '2', density: 'comfortable',
          showDelta: true, showSparkline: true, showTarget: true,
          numberFormat: 'full', locale: '', textScale: 100, theme: 'dark-minimal',
        }, { anim: 'fade-up', duration: 600 }),
        W('progress', [69, 27, 26, 66], {
          label: L('Sprint burn-down', 'Sprint-Fortschritt'),
          value: 62, target: 100, unit: '%',
          source: 'inline', dataUrl: '', refreshSec: 60,
          style: 'ring', showValue: true, animate: true,
          align: 'center', labelPos: 'below', labelEmphasis: true,
          color: '#8b5cf6', locale: '', textScale: 100, labelScale: 100, valueScale: 100,
          useThresholds: true, invertThresholds: false, thresholdWarn: 50, thresholdGood: 80,
          colorLow: '#ef4444', colorMid: '#f59e0b', colorHigh: '#22c55e',
          theme: 'dark-minimal',
        }, { anim: 'scale', delay: 200, duration: 600 }),
      ],
    }),
    S({
      name: L('Burn-down', 'Burn-down'),
      theme: 'dark-minimal',
      duration: 12,
      widgets: [
        W('chart', [5, 10, 90, 80], {
          kind: 'line', source: 'inline',
          data: [
            { label: L('Mon', 'Mo'), value: 55 }, { label: L('Tue', 'Di'), value: 50 },
            { label: L('Wed', 'Mi'), value: 44 }, { label: L('Thu', 'Do'), value: 37 },
            { label: L('Fri', 'Fr'), value: 29 }, { label: L('Mon', 'Mo'), value: 21 },
          ],
          dataUrl: '', refreshSec: 0, sortOrder: 'none', theme: 'dark-minimal',
          xLabel: '', yLabel: L('Remaining', 'Verbleibend'), yMax: 60,
          goalValue: 0, goalLabel: '', showLegend: false, showValues: false,
          seriesLabel: L('Remaining points', 'Verbleibende Punkte'),
          valueFormat: 'full', locale: '', valueUnit: '', palette: [],
        }, { anim: 'fade', delay: 350, duration: 600 }),
      ],
    }),
    S({
      name: L('Leaderboard', 'Ranking'),
      theme: 'gradient-purple',
      duration: 14,
      widgets: [
        W('leaderboard', [5, 6, 90, 84], {
          heading: L('Code reviews this month', 'Code-Reviews diesen Monat'),
          subheading: L('Thank you, reviewers', 'Danke an alle Reviewer'),
          rows: [
            { name: 'A. Lovelace', value: 64, note: L('avg. 3 h response', 'Ø 3 Std. Reaktion'), deltaPct: 12, avatar: '' },
            { name: 'G. Hopper', value: 58, note: L('avg. 4 h response', 'Ø 4 Std. Reaktion'), deltaPct: 5, avatar: '' },
            { name: 'K. Johnson', value: 47, note: '', deltaPct: -3, avatar: '' },
            { name: 'L. Torvalds', value: 39, note: '', deltaPct: 8, avatar: '' },
            { name: 'B. Liskov', value: 31, note: '', deltaPct: 2, avatar: '' },
            { name: 'D. Ritchie', value: 24, note: '', deltaPct: -6, avatar: '' },
          ],
          source: 'inline', dataUrl: '', refreshSec: 300,
          sortOrder: 'desc', maxRows: 6, unit: '', unitPosition: 'after',
          numberFormat: 'standard', locale: '',
          showRank: true, medals: true, showBars: true, showDelta: true, showAvatars: false,
          highlightName: '', podium: true, textScale: 100, theme: 'gradient-purple',
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('Calendar', 'Kalender'),
      theme: 'minimal-dark',
      duration: 14,
      widgets: [
        W('calendar', [4, 6, 92, 84], {
          heading: L('This week', 'Diese Woche'),
          // Anchored to the week the grid draws — see onWeekday() in lib.js.
          view: 'week', maxItems: 10, hidePast: false, daysAhead: 7,
          weekDays: 'work', perDayCap: 3, emptyText: '', roomName: '', showClock: false,
          icsUrl: '', refreshSec: 900, locale: '', theme: 'minimal-dark', textScale: 250,
          events: [
            { start: onWeekday(0, '09:15'), summary: L('Daily standup', 'Daily Standup'), location: '' },
            { start: onWeekday(1, '13:00'), summary: L('Sprint review', 'Sprint-Review'), location: L('Room 3.02', 'Raum 3.02') },
            { start: onWeekday(2, '10:00'), summary: L('Architecture guild', 'Architektur-Runde'), location: '' },
            { start: onWeekday(3, '16:00'), summary: L('Release window', 'Release-Fenster'), location: '' },
            { start: onWeekday(4, '11:30'), summary: L('Retro & planning', 'Retro & Planung'), location: L('Room 3.02', 'Raum 3.02') },
          ],
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('Tech news', 'Tech-News'),
      theme: 'dark-minimal',
      duration: 18,
      widgets: [
        W('rss', [4, 6, 92, 78], {
          dataMode: 'live', url: [FEEDS.deTech], theme: 'dark-minimal', textScale: 100,
          showDesc: true, showDate: true, dateFormat: 'relative', locale: '',
          mode: 'paginate', pageSec: 7, tickerSpeed: 80, maxItems: 8, refreshSec: 300,
        }),
        tickerBar([
          L('Incident channel: #ops-alerts', 'Incident-Kanal: #ops-alerts'),
          L('On call this week: A. Lovelace', 'Rufbereitschaft diese Woche: A. Lovelace'),
        ], { theme: 'dark-minimal' }),
      ],
    }),
  ],
});

registerTemplate({
  id: 'corp-internal-news',
  category: 'corporate',
  accent: '#c4b5fd',
  name: L('Internal communications', 'Interne Kommunikation'),
  description: L(
    'A company-news loop with a human face: a message from management, the people page, an anniversary countdown and a rolling ticker of small news.',
    'Eine Firmen-News-Schleife mit Gesicht: Botschaft der Geschäftsführung, Personalseite, Jubiläums-Countdown und ein Laufband mit kleinen Meldungen.'),
  tags: [L('internal', 'Intern'), L('company news', 'Firmennews'), L('people', 'Menschen'), L('anniversary', 'Jubiläum')],
  defaults: { theme: 'gradient-purple', transition: 'slide-up', duration: 14 },
  build: () => [
    S({
      name: L('Message', 'Botschaft'),
      theme: 'gradient-purple',
      duration: 16,
      widgets: [
        W('quote', [6, 10, 88, 78], {
          quote: L('We finished the year with the strongest order book in the company’s history — thank you, all of you.',
            'Wir schließen das Jahr mit dem stärksten Auftragsbestand der Firmengeschichte ab — danke, an euch alle.'),
          author: L('Sabine Bauer, CEO', 'Sabine Bauer, Geschäftsführung'),
          source: L('All-hands, this morning', 'All-Hands, heute Morgen'),
          portrait: '', layout: 'fullscreen', markStyle: 'classic', textScale: 130,
          quotes: [], rotateSecs: 12, theme: 'gradient-purple',
        }, { anim: 'reveal', duration: 800 }),
      ],
    }),
    S({
      name: L('People', 'Menschen'),
      theme: 'minimal-dark',
      duration: 16,
      widgets: [
        W('data-table', [4, 6, 92, 82], {
          source: 'inline',
          headers: L('Since, Name, Team, Note', 'Seit, Name, Team, Hinweis'),
          align: 'llll',
          rows: [
            { c1: L('New', 'Neu'), c2: 'Jonas Rieder', c3: L('Production', 'Fertigung'), c4: L('Welcome aboard', 'Herzlich willkommen') },
            { c1: L('New', 'Neu'), c2: 'Aylin Demir', c3: L('Quality', 'Qualität'), c4: L('Welcome aboard', 'Herzlich willkommen') },
            { c1: '10 J.', c2: 'Petra Schuster', c3: L('Logistics', 'Logistik'), c4: L('Anniversary', 'Jubiläum') },
            { c1: '25 J.', c2: 'Hans Obermeier', c3: L('Maintenance', 'Instandhaltung'), c4: L('Anniversary', 'Jubiläum') },
            { c1: L('Exam passed', 'Prüfung bestanden'), c2: 'Mia Kern', c3: L('Apprentice', 'Ausbildung'), c4: L('Congratulations', 'Glückwunsch') },
          ],
          dataUrl: '', refreshSec: 0, striped: true, autoAlignNumbers: false,
          density: 'comfortable', headerStyle: 'accent', textScale: 270,
          pageRows: 0, pageSec: 8,
          highlightRules: [
            { keyword: L('Anniversary', 'Jubiläum'), color: 'accent' },
            { keyword: L('Congratulations', 'Glückwunsch'), color: 'good' },
          ],
          theme: 'minimal-dark',
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('Anniversary', 'Jubiläum'),
      theme: 'gradient-purple',
      duration: 12,
      widgets: [
        W('countdown', [8, 14, 84, 60], {
          target: { at: Date.now() + 45 * 86400000, tz: 'Europe/Berlin' },
          heading: L('50 years of the company — party in', '50 Jahre Firma — Feier in'),
          theme: 'gradient-purple',
          expiredText: L('Today we celebrate!', 'Heute wird gefeiert!'),
          units: 'dhm', unitStyle: 'full', locale: '', showTarget: true,
          textScale: 180, urgentBelow: 72, urgentColor: '', finishedMode: 'text',
        }, { anim: 'scale', duration: 700 }),
        tickerBar([
          L('Save the date — invitations go out next week', 'Save the date — Einladungen kommen nächste Woche'),
          L('Family members are welcome', 'Familienangehörige sind herzlich eingeladen'),
        ], { theme: 'gradient-purple', speed: 60 }),
      ],
    }),
  ],
});

registerTemplate({
  id: 'industry-safety-board',
  category: 'industry',
  accent: '#fbbf24',
  name: L('Shop-floor safety board', 'Sicherheitstafel Produktion'),
  description: L(
    'The board at the plant entrance: days without an accident with a record to beat, the safety rules as steps, shift KPIs and a standing alert slot.',
    'Die Tafel am Werkseingang: unfallfreie Tage mit Rekordmarke, die Sicherheitsregeln als Schritte, Schicht-Kennzahlen und ein fester Platz für Störmeldungen.'),
  tags: [L('safety', 'Arbeitssicherheit'), L('shop floor', 'Produktion'), L('shift', 'Schicht'), 'KPI'],
  defaults: { theme: 'industrial-steel', transition: 'wipe', duration: 12 },
  build: () => [
    S({
      name: L('Days without accident', 'Unfallfreie Tage'),
      theme: 'industrial-steel',
      duration: 12,
      widgets: [
        W('days-since', [5, 8, 90, 72], {
          since: { at: daysAgo(148), tz: 'Europe/Berlin' },
          heading: L('Days without a lost-time accident', 'Tage ohne meldepflichtigen Unfall'),
          showDate: true, locale: '', unitSingular: '', unitPlural: '',
          recordDays: 312, milestoneEvery: 50, goodAbove: 100, goodColor: '',
          textScale: 95, theme: 'industrial-steel',
        }, { anim: 'rise', duration: 700 }),
        tickerBar([
          L('Report every near miss — that is how the streak survives',
            'Jeden Beinahe-Unfall melden — nur so hält die Serie'),
          L('First aid: hall 2, next to the tool store', 'Erste Hilfe: Halle 2, neben der Werkzeugausgabe'),
        ], { theme: 'industrial-steel', speed: 60, uppercase: false }),
      ],
    }),
    S({
      name: L('Five rules', 'Fünf Regeln'),
      theme: 'industrial-steel',
      duration: 18,
      widgets: [
        W('steps', [4, 6, 92, 84], {
          heading: L('Five rules that keep us whole', 'Fünf Regeln, die uns heil halten'),
          steps: [
            { title: L('PPE on', 'PSA an'), desc: L('Helmet, glasses, shoes — before the yellow line.', 'Helm, Brille, Schuhe — vor der gelben Linie.'), icon: 'check' },
            { title: L('Lock out', 'Freischalten'), desc: L('No maintenance on a machine that can still start.', 'Keine Wartung an einer Maschine, die anlaufen kann.'), icon: 'alert' },
            { title: L('Clear routes', 'Wege frei'), desc: L('Escape routes and fire equipment stay unblocked.', 'Fluchtwege und Löschmittel bleiben frei.'), icon: 'arrow' },
            { title: L('Speak up', 'Ansprechen'), desc: L('Stop the job. Nobody is ever blamed for stopping.', 'Arbeit stoppen. Niemand wird fürs Stoppen kritisiert.'), icon: 'alert' },
            { title: L('Report', 'Melden'), desc: L('Near miss, defect, spill — report the same shift.', 'Beinahe-Unfall, Defekt, Leckage — noch in der Schicht melden.'), icon: 'bell' },
          ],
          layout: 'vertical', numberStyle: 'square', showConnector: true, showDesc: true,
          spotlight: 0, autoAdvanceSec: 0, textScale: 95, theme: 'industrial-steel',
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('Shift figures', 'Schichtzahlen'),
      theme: 'industrial-steel',
      duration: 14,
      widgets: [
        W('kpi-cards', [4, 6, 92, 52], {
          cards: [
            { label: L('Output today', 'Ausbringung heute'), value: 4820, target: 5200, unit: L('pcs', 'Stk'), deltaPct: 3.4, history: '4100, 4300, 4450, 4600, 4700, 4820', goodIsDown: '' },
            { label: L('Scrap rate', 'Ausschussquote'), value: 1.8, target: 1.5, unit: '%', deltaPct: -0.4, history: '2.6, 2.4, 2.2, 2.1, 1.9, 1.8', goodIsDown: 1 },
            { label: 'OEE', value: 78, target: 85, unit: '%', deltaPct: 2.1, history: '71, 72, 74, 75, 77, 78', goodIsDown: '' },
            { label: L('Unplanned stops', 'Ungeplante Stopps'), value: 3, target: 2, unit: '', deltaPct: -25, history: '8, 7, 6, 5, 4, 3', goodIsDown: 1 },
          ],
          source: 'inline', dataUrl: '', refreshSec: 0,
          columns: '4', density: 'compact',
          showDelta: true, showSparkline: true, showTarget: true,
          numberFormat: 'full', locale: '', textScale: 210, theme: 'industrial-steel',
        }, { anim: 'fade-up', duration: 600 }),
        W('data-table', [4, 62, 92, 32], {
          source: 'inline',
          headers: L('Line, Shift, Status, Since', 'Linie, Schicht, Status, Seit'),
          align: 'llll',
          rows: [
            { c1: L('Line 1', 'Linie 1'), c2: L('Early', 'Früh'), c3: L('RUNNING', 'LÄUFT'), c4: '06:02' },
            { c1: L('Line 2', 'Linie 2'), c2: L('Early', 'Früh'), c3: L('RUNNING', 'LÄUFT'), c4: '06:00' },
            { c1: L('Line 3', 'Linie 3'), c2: L('Early', 'Früh'), c3: L('SETUP', 'RÜSTEN'), c4: '10:45' },
            { c1: L('Packing', 'Verpackung'), c2: L('Early', 'Früh'), c3: L('STOPPED', 'STÖRUNG'), c4: '11:12' },
          ],
          dataUrl: '', refreshSec: 0, striped: true, autoAlignNumbers: false,
          density: 'compact', headerStyle: 'accent', textScale: 400,
          pageRows: 0, pageSec: 8,
          highlightRules: [
            { keyword: L('STOPPED', 'STÖRUNG'), color: 'bad' },
            { keyword: L('SETUP', 'RÜSTEN'), color: 'warn' },
          ],
          theme: 'industrial-steel',
        }, { anim: 'fade', delay: 250, duration: 500 }),
      ],
    }),
    S({
      name: L('Disruption', 'Störung'),
      theme: 'industrial-steel',
      duration: 10,
      widgets: [
        W('text', [0, 0, 100, 100], {
          ...paragraph(L(
            '<h2>Packing line stopped</h2><p>Maintenance on site. Pallets go to the buffer in hall 3 until further notice.</p>',
            '<h2>Verpackungslinie steht</h2><p>Instandhaltung ist vor Ort. Paletten bis auf Weiteres in den Puffer Halle 3.</p>'),
          { theme: 'industrial-steel', maxWidth: 'comfortable' }),
          priority: 'urgent', pulse: true,
          textScale: 255,
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
  ],
});

registerTemplate({
  id: 'industry-logistics',
  category: 'industry',
  accent: '#f59e0b',
  name: L('Warehouse & logistics', 'Lager & Logistik'),
  description: L(
    'The gate and warehouse board: today’s dock schedule, picking performance per team, stock alerts and the weather that decides whether the yard works.',
    'Die Tafel an Tor und Lager: Rampenplan des Tages, Kommissionierleistung je Team, Bestandswarnungen und das Wetter, das über den Hofbetrieb entscheidet.'),
  tags: [L('warehouse', 'Lager'), L('dock', 'Rampe'), L('picking', 'Kommissionierung'), L('logistics', 'Logistik')],
  defaults: { theme: 'industrial-steel', transition: 'push', duration: 14 },
  build: () => [
    S({
      name: L('Dock schedule', 'Rampenplan'),
      theme: 'industrial-steel',
      duration: 18,
      widgets: [
        W('text', [5, 5, 58, 20], headline(
          L('Dock schedule — today', 'Rampenplan — heute'),
          { theme: 'industrial-steel', textScale: 395 })),
        cornerClock({ theme: 'industrial-steel', display: 'time', rect: [75, 5, 20, 20], textScale: 105 }),
        W('data-table', [5, 27, 90, 68], {
          source: 'inline',
          headers: L('Slot, Dock, Carrier, Type, Status', 'Zeit, Tor, Spediteur, Art, Status'),
          align: 'lllll',
          rows: [
            { c1: '06:30', c2: '1', c3: 'Nordwind Trans', c4: L('Inbound', 'Wareneingang'), c5: L('DONE', 'ERLEDIGT') },
            { c1: '08:00', c2: '2', c3: 'Ricci Logistics', c4: L('Outbound', 'Warenausgang'), c5: L('LOADING', 'LÄDT') },
            { c1: '09:30', c2: '1', c3: 'Alpen Spedition', c4: L('Inbound', 'Wareneingang'), c5: L('WAITING', 'WARTET') },
            { c1: '11:00', c2: '3', c3: 'Baltic Freight', c4: L('Outbound', 'Warenausgang'), c5: L('PLANNED', 'GEPLANT') },
            { c1: '13:15', c2: '2', c3: 'Nordwind Trans', c4: L('Outbound', 'Warenausgang'), c5: L('PLANNED', 'GEPLANT') },
            { c1: '15:45', c2: '1', c3: L('Own fleet', 'Eigener Fuhrpark'), c4: L('Inbound', 'Wareneingang'), c5: L('PLANNED', 'GEPLANT') },
          ],
          dataUrl: '', refreshSec: 0, striped: true, autoAlignNumbers: false,
          density: 'comfortable', headerStyle: 'accent', textScale: 335,
          pageRows: 0, pageSec: 8,
          highlightRules: [
            { keyword: L('LOADING', 'LÄDT'), color: 'accent' },
            { keyword: L('WAITING', 'WARTET'), color: 'warn' },
          ],
          theme: 'industrial-steel',
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('Picking performance', 'Kommissionierleistung'),
      theme: 'industrial-steel',
      duration: 14,
      widgets: [
        W('leaderboard', [4, 6, 92, 84], {
          heading: L('Lines picked — this shift', 'Positionen kommissioniert — diese Schicht'),
          subheading: L('Early shift', 'Frühschicht'),
          rows: [
            { name: L('Team A — aisles 1–8', 'Team A — Gänge 1–8'), value: 412, note: L('2 pickers', '2 Kommissionierer'), deltaPct: 6.2, avatar: '' },
            { name: L('Team B — aisles 9–16', 'Team B — Gänge 9–16'), value: 388, note: L('2 pickers', '2 Kommissionierer'), deltaPct: 1.8, avatar: '' },
            { name: L('Team C — bulk', 'Team C — Sperrgut'), value: 264, note: L('1 picker', '1 Kommissionierer'), deltaPct: -4.1, avatar: '' },
            { name: L('Team D — returns', 'Team D — Retouren'), value: 198, note: '', deltaPct: 3.0, avatar: '' },
          ],
          source: 'inline', dataUrl: '', refreshSec: 300,
          sortOrder: 'desc', maxRows: 6, unit: '', unitPosition: 'after',
          numberFormat: 'standard', locale: '',
          showRank: true, medals: true, showBars: true, showDelta: true, showAvatars: false,
          highlightName: '', podium: false, textScale: 100, theme: 'industrial-steel',
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('Stock alerts', 'Bestandswarnungen'),
      theme: 'minimal-dark',
      duration: 12,
      widgets: [
        W('kpi-cards', [4, 8, 92, 56], {
          cards: [
            { label: L('Below minimum', 'Unter Mindestbestand'), value: 12, target: 0, unit: L('SKUs', 'Artikel'), deltaPct: 20, history: '4, 6, 7, 9, 10, 12', goodIsDown: 1 },
            { label: L('Open orders', 'Offene Bestellungen'), value: 38, target: 40, unit: '', deltaPct: -5, history: '46, 44, 42, 41, 39, 38', goodIsDown: 1 },
            { label: L('Space used', 'Platzauslastung'), value: 87, target: 90, unit: '%', deltaPct: 1.2, history: '80, 82, 83, 85, 86, 87', goodIsDown: 1 },
          ],
          source: 'inline', dataUrl: '', refreshSec: 0,
          columns: '3', density: 'comfortable',
          showDelta: true, showSparkline: true, showTarget: true,
          numberFormat: 'full', locale: '', textScale: 210, theme: 'minimal-dark',
        }, { anim: 'fade-up', duration: 600 }),
        W('text', [5, 66, 90, 26], {
          ...paragraph(L(
            '<p><strong>Cycle count in aisle 12 today, 14:00.</strong> Please do not pick from bins 12-40 to 12-58 during the count.</p>',
            '<p><strong>Inventur in Gang 12 heute, 14:00 Uhr.</strong> Aus den Plätzen 12-40 bis 12-58 während der Zählung bitte nicht kommissionieren.</p>'),
          { theme: 'minimal-dark', textScale: 165 }),
          priority: 'warning',
        }, { anim: 'fade-up', delay: 250, duration: 600 }),
      ],
    }),
    S({
      name: L('Yard weather', 'Wetter im Hof'),
      theme: 'gradient-blue',
      duration: 10,
      widgets: [
        W('weather', [4, 6, 92, 84], {
          dataMode: 'live', location: PLACES.hamburg, unit: 'C', windUnit: 'kmh', apiKey: '',
          refreshSec: 900, locale: '', timeFormat: 'auto',
          showCity: true, showTemp: true, showIcon: true, showDescription: true,
          showHiLo: true, showStats: true, showWindVector: true, showPrecip: true,
          showSunrise: false, showForecast: true, forecastDays: 3, showHourly: true, hourlyHours: 12,
          showAlerts: true, showUv: false, colorTemperature: true,
          design: 'dashboard', theme: 'gradient-blue', textScale: 95, iconSet: 'auto',
          textColor: '', accentColor: '',
        }, { anim: 'fade', duration: 500 }),
      ],
    }),
  ],
});
