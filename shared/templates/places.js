// Schools, hotels, gyms and estate agents — venues whose screens are read by
// people who are passing through rather than working there.

import { registerTemplate } from './registry.js';
import { L, S, W, headline, paragraph, backdrop, tickerBar, cornerClock, FEEDS, PLACES, inDays, at } from './lib.js';

registerTemplate({
  id: 'edu-school-board',
  category: 'education',
  accent: '#5eead4',
  name: L('School info board', 'Schulinfotafel'),
  description: L(
    'The board in the school foyer: substitutions for today, the canteen menu of the week, upcoming dates and a countdown to the holidays.',
    'Die Tafel im Schulfoyer: Vertretungsplan für heute, der Speiseplan der Woche, Termine und ein Countdown bis zu den Ferien.'),
  tags: [L('school', 'Schule'), L('substitution', 'Vertretungsplan'), L('canteen', 'Mensa'), L('holidays', 'Ferien')],
  defaults: { theme: 'medical-calm', transition: 'slide', duration: 15 },
  build: () => [
    S({
      name: L('Substitutions', 'Vertretungsplan'),
      theme: 'medical-calm',
      duration: 22,
      widgets: [
        W('text', [5, 5, 58, 20], headline(
          L('Substitutions — today', 'Vertretungsplan — heute'),
          { theme: 'medical-calm', textScale: 395 })),
        cornerClock({ theme: 'medical-calm', display: 'weekday', rect: [65, 5, 30, 20], align: 'right', textScale: 150 }),
        W('data-table', [5, 27, 90, 68], {
          source: 'inline',
          headers: L('Lesson, Class, Subject, Room, Note', 'Std., Klasse, Fach, Raum, Hinweis'),
          align: 'lllll',
          rows: [
            { c1: '1', c2: '7b', c3: L('Maths', 'Mathe'), c4: '204', c5: L('Ms Weber for Mr Klein', 'Fr. Weber für Hr. Klein') },
            { c1: '2', c2: '7b', c3: L('Maths', 'Mathe'), c4: '204', c5: L('Ms Weber for Mr Klein', 'Fr. Weber für Hr. Klein') },
            { c1: '3', c2: '9a', c3: L('English', 'Englisch'), c4: L('CANCELLED', 'ENTFÄLLT'), c5: L('Go home early', 'Unterrichtsschluss') },
            { c1: '4', c2: '10c', c3: L('Chemistry', 'Chemie'), c4: L('Lab 2', 'Labor 2'), c5: L('Room change', 'Raumänderung') },
            { c1: '5', c2: '5a', c3: L('Sport', 'Sport'), c4: L('Gym B', 'Halle B'), c5: L('Gym A occupied', 'Halle A belegt') },
            { c1: '6', c2: '8b', c3: L('History', 'Geschichte'), c4: '112', c5: L('Supervised study', 'Betreute Stillarbeit') },
          ],
          dataUrl: '', refreshSec: 0, striped: true, autoAlignNumbers: false,
          density: 'comfortable', headerStyle: 'accent', textScale: 335,
          pageRows: 0, pageSec: 8,
          highlightRules: [
            { keyword: L('CANCELLED', 'ENTFÄLLT'), color: 'bad' },
            { keyword: L('Room change', 'Raumänderung'), color: 'warn' },
          ],
          theme: 'medical-calm',
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('Canteen', 'Mensa'),
      theme: 'bistro-warm',
      duration: 18,
      widgets: [
        W('menu', [4, 5, 92, 84], {
          rows: [
            { section: L('Monday', 'Montag'), name: L('Pasta with tomato sauce', 'Nudeln mit Tomatensauce'), price: 3.20, desc: L('with grated cheese', 'mit geriebenem Käse'), tags: 'vegetarian', image: '' },
            { section: L('Tuesday', 'Dienstag'), name: L('Chicken fricassee with rice', 'Hühnerfrikassee mit Reis'), price: 3.80, desc: '', tags: '', image: '' },
            { section: L('Wednesday', 'Mittwoch'), name: L('Lentil stew', 'Linseneintopf'), price: 3.20, desc: L('with bread roll', 'mit Brötchen'), tags: 'vegan', image: '' },
            { section: L('Thursday', 'Donnerstag'), name: L('Fish fingers with potatoes', 'Fischstäbchen mit Kartoffeln'), price: 3.80, desc: '', tags: '', image: '' },
            { section: L('Friday', 'Freitag'), name: L('Pizza margherita', 'Pizza Margherita'), price: 3.50, desc: L('Salad bar included', 'Salatbar inklusive'), tags: 'vegetarian', featured: 1, image: '' },
          ],
          currency: 'EUR', currencyPosition: 'after', hideZeroDecimals: false,
          showPrices: true, showImages: false, columns: '2', sectionFilter: '',
          footnote: L('Salad and dessert bar 1,20 € · allergens listed at the counter',
            'Salat- und Nachtischbar 1,20 € · Allergene an der Ausgabe'),
          textScale: 150, locale: '', theme: 'bistro-warm',
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('Dates', 'Termine'),
      theme: 'medical-calm',
      duration: 15,
      widgets: [
        W('calendar', [4, 6, 92, 84], {
          heading: L('Coming up', 'Demnächst'),
          view: 'agenda', maxItems: 6, hidePast: true, daysAhead: 0,
          weekDays: 'full', perDayCap: 0, emptyText: '', roomName: '', showClock: false,
          icsUrl: '', refreshSec: 900, locale: '', theme: 'medical-calm', textScale: 235,
          events: [
            { start: at(2, '19:00'), summary: L('Parents’ evening, year 7', 'Elternabend Jahrgang 7'), location: L('Assembly hall', 'Aula') },
            { start: at(6, '08:00'), summary: L('Project week starts', 'Projektwoche beginnt'), location: '' },
            { start: at(11, '15:00'), summary: L('Sports day', 'Bundesjugendspiele'), location: L('Sports ground', 'Sportplatz') },
            { start: at(18, '18:00'), summary: L('School concert', 'Schulkonzert'), location: L('Assembly hall', 'Aula') },
          ],
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('Holidays', 'Ferien'),
      theme: 'gradient-blue',
      duration: 12,
      widgets: [
        W('countdown', [8, 16, 84, 56], {
          target: { at: inDays(38), tz: 'Europe/Berlin' },
          heading: L('Holidays start in', 'Die Ferien beginnen in'),
          theme: 'gradient-blue',
          expiredText: L('Enjoy the break!', 'Schöne Ferien!'),
          units: 'days', unitStyle: 'full', locale: '', showTarget: true,
          textScale: 195, urgentBelow: 0, urgentColor: '', finishedMode: 'text',
        }, { anim: 'scale', duration: 700 }),
        tickerBar([
          L('Lost property is kept next to the caretaker’s office', 'Fundsachen liegen beim Hausmeisterbüro'),
          L('Library open Mon–Thu until 16:00', 'Bibliothek Mo–Do bis 16:00 Uhr geöffnet'),
          L('Bus 42 leaves from the north gate', 'Bus 42 fährt am Nordtor ab'),
        ], { theme: 'gradient-blue', speed: 60 }),
      ],
    }),
  ],
});

registerTemplate({
  id: 'edu-campus-info',
  category: 'education',
  accent: '#c4b5fd',
  name: L('Campus information', 'Campus-Information'),
  description: L(
    'For a university foyer or library: lecture schedule, exam countdown, campus news and world clocks for international programmes.',
    'Für Foyer oder Bibliothek: Vorlesungsplan, Prüfungs-Countdown, Campus-News und Weltzeituhren für internationale Programme.'),
  tags: [L('campus', 'Campus'), L('university', 'Hochschule'), L('lectures', 'Vorlesungen'), L('exams', 'Prüfungen')],
  defaults: { theme: 'gradient-purple', transition: 'dissolve', duration: 14 },
  build: () => [
    S({
      name: L('Today’s lectures', 'Vorlesungen heute'),
      theme: 'gradient-purple',
      duration: 20,
      widgets: [
        W('data-table', [4, 6, 92, 84], {
          source: 'inline',
          headers: L('Time, Course, Lecturer, Room', 'Zeit, Veranstaltung, Dozent:in, Raum'),
          align: 'llll',
          rows: [
            { c1: '08:15', c2: L('Analysis II', 'Analysis II'), c3: 'Prof. Dr. Reinhardt', c4: 'HS 1' },
            { c1: '10:00', c2: L('Databases', 'Datenbanken'), c3: 'Prof. Dr. Adeyemi', c4: 'HS 3' },
            { c1: '12:15', c2: L('Software engineering', 'Software Engineering'), c3: 'Dr. Costa', c4: L('Lab 2.11', 'Labor 2.11') },
            { c1: '14:00', c2: L('Statistics tutorial', 'Statistik-Übung'), c3: 'M. Sc. Falk', c4: 'SR 04' },
            { c1: '16:00', c2: L('Guest lecture: AI in medicine', 'Gastvortrag: KI in der Medizin'), c3: L('Dr. Yilmaz, Charité', 'Dr. Yilmaz, Charité'), c4: L('Auditorium', 'Audimax') },
          ],
          dataUrl: '', refreshSec: 0, striped: true, autoAlignNumbers: false,
          density: 'comfortable', headerStyle: 'accent', textScale: 265,
          pageRows: 0, pageSec: 8,
          highlightRules: [{ keyword: L('Guest lecture', 'Gastvortrag'), color: 'accent' }],
          theme: 'gradient-purple',
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('Exams', 'Prüfungen'),
      theme: 'minimal-dark',
      duration: 12,
      widgets: [
        W('countdown', [6, 10, 88, 48], {
          target: { at: inDays(26), tz: 'Europe/Berlin' },
          heading: L('Exam period starts in', 'Die Prüfungsphase beginnt in'),
          theme: 'minimal-dark',
          expiredText: L('Good luck, everyone', 'Viel Erfolg euch allen'),
          units: 'dhm', unitStyle: 'full', locale: '', showTarget: true,
          textScale: 240, urgentBelow: 168, urgentColor: '#f59e0b', finishedMode: 'text',
        }, { anim: 'scale', duration: 700 }),
        W('steps', [6, 60, 88, 32], {
          heading: L('Before you register', 'Vor der Anmeldung'),
          steps: [
            { title: L('Check the module handbook', 'Modulhandbuch prüfen'), desc: '', icon: 'info' },
            { title: L('Register in the portal', 'Im Portal anmelden'), desc: L('Deadline: two weeks before', 'Frist: zwei Wochen vorher'), icon: 'check-circle' },
            { title: L('Bring your student card', 'Studierendenausweis mitbringen'), desc: '', icon: 'user' },
          ],
          layout: 'horizontal', numberStyle: 'plain', showConnector: true, showDesc: true,
          spotlight: 0, autoAdvanceSec: 0, textScale: 245, theme: 'minimal-dark',
        }, { anim: 'fade-up', delay: 250, duration: 600 }),
      ],
    }),
    S({
      name: L('Campus news', 'Campus-News'),
      theme: 'editorial-mono',
      duration: 18,
      widgets: [
        W('news-photos', [3, 4, 94, 84], {
          dataMode: 'live', url: [FEEDS.science], refreshSec: 600, maxItems: 6,
          theme: 'editorial-mono', textScale: 100, cardLayout: 'image-top', columns: 3,
          showDesc: true, showDate: true, showSource: true, locale: '',
          mode: 'paginate', pageSec: 9,
        }),
        tickerBar([
          L('Swap this feed for your university’s own news URL',
            'Diesen Feed durch die News-URL Ihrer Hochschule ersetzen'),
        ], { theme: 'editorial-mono' }),
      ],
    }),
    S({
      name: L('Partner universities', 'Partnerhochschulen'),
      theme: 'dark-minimal',
      duration: 12,
      widgets: [
        W('world-clock', [4, 10, 92, 70], {
          zones: [
            { label: L('Munich', 'München'), tz: 'Europe/Berlin' },
            { label: 'Boston', tz: 'America/New_York' },
            { label: 'São Paulo', tz: 'America/Sao_Paulo' },
            { label: 'Seoul', tz: 'Asia/Seoul' },
          ],
          display: 'time-date', dateFormat: 'weekday-short', hour12: false, locale: '',
          showOffset: true, showRelative: false, showDayNight: true,
          layout: 'row', highlightFirst: true, textScale: 130, theme: 'dark-minimal',
        }, { anim: 'fade-up', duration: 600 }),
        W('text', [4, 82, 92, 14], paragraph(
          L('<p>Exchange office, room 1.05 — walk-in hours Tuesday and Thursday, 10:00–12:00.</p>',
            '<p>International Office, Raum 1.05 — offene Sprechstunde Dienstag und Donnerstag, 10:00–12:00 Uhr.</p>'),
          { theme: 'dark-minimal', textScale: 75, valign: 'middle' })),
      ],
    }),
  ],
});

registerTemplate({
  id: 'hotel-lobby',
  category: 'hospitality',
  accent: '#f0abfc',
  name: L('Hotel lobby', 'Hotellobby'),
  description: L(
    'A lobby loop with manners: a greeting that follows the clock, today’s events and function rooms, weather for the guests’ day out, and world clocks behind the desk.',
    'Eine Lobby-Schleife mit Stil: Begrüßung nach Tageszeit, Veranstaltungen und Tagungsräume des Tages, Wetter für den Ausflug und Weltzeituhren hinter der Rezeption.'),
  tags: [L('hotel', 'Hotel'), L('lobby', 'Lobby'), L('events', 'Veranstaltungen'), L('guests', 'Gäste')],
  defaults: { theme: 'gradient-purple', transition: 'fade', duration: 12 },
  build: () => [
    S({
      name: L('Welcome', 'Willkommen'),
      theme: 'gradient-purple',
      transition: 'dissolve',
      widgets: [
        W('image', [0, 0, 100, 100], backdrop('', 58), { z: 0, loop: 'kenburns' }),
        W('greeting', [6, 20, 88, 56], {
          venue: L('the Grand Hotel', 'dem Grand Hotel'),
          welcomeTo: L('welcome to', 'willkommen im'),
          subtitle: L('Breakfast 06:30 – 10:30 · Spa 07:00 – 22:00 · Bar until 01:00',
            'Frühstück 06:30 – 10:30 · Spa 07:00 – 22:00 · Bar bis 01:00'),
          timezone: 'Europe/Berlin', showDate: true, showTime: true,
          locale: '', textScale: 220, theme: 'gradient-purple',
        }, { z: 1, anim: 'fade-up', duration: 800 }),
      ],
    }),
    S({
      name: L('Today’s events', 'Veranstaltungen heute'),
      theme: 'gradient-purple',
      duration: 16,
      widgets: [
        W('text', [5, 5, 90, 20], headline(
          L('Today in the house', 'Heute im Haus'),
          { theme: 'gradient-purple', font: 'serif', textScale: 300 })),
        W('data-table', [5, 27, 90, 68], {
          source: 'inline',
          headers: L('Time, Event, Room, Host', 'Zeit, Veranstaltung, Raum, Gastgeber'),
          align: 'llll',
          rows: [
            { c1: '09:00', c2: L('Nordwind AG — strategy workshop', 'Nordwind AG — Strategie-Workshop'), c3: L('Salon Mozart', 'Salon Mozart'), c4: L('Ms Lindqvist', 'Fr. Lindqvist') },
            { c1: '12:30', c2: L('Rotary lunch', 'Rotary-Mittagessen'), c3: L('Restaurant, terrace', 'Restaurant, Terrasse'), c4: '' },
            { c1: '15:00', c2: L('Wedding — Meier & Costa', 'Hochzeit — Meier & Costa'), c3: L('Ballroom', 'Ballsaal'), c4: '' },
            { c1: '19:30', c2: L('Piano evening', 'Klavierabend'), c3: L('Lobby bar', 'Lobbybar'), c4: L('Open to all guests', 'Für alle Gäste offen') },
          ],
          dataUrl: '', refreshSec: 0, striped: false, autoAlignNumbers: false,
          density: 'comfortable', headerStyle: 'accent', textScale: 335,
          pageRows: 0, pageSec: 8, highlightRules: [], theme: 'gradient-purple',
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('Weather', 'Wetter'),
      theme: 'gradient-blue',
      duration: 12,
      widgets: [
        W('weather', [4, 6, 60, 84], {
          dataMode: 'live', location: PLACES.vienna, unit: 'C', windUnit: 'kmh', apiKey: '',
          refreshSec: 900, locale: '', timeFormat: 'auto',
          showCity: true, showTemp: true, showIcon: true, showDescription: true,
          showHiLo: true, showStats: false, showWindVector: false, showPrecip: true,
          showSunrise: true, showForecast: true, forecastDays: 4, showHourly: false, hourlyHours: 12,
          showAlerts: false, showUv: true, colorTemperature: true,
          design: 'hero', theme: 'gradient-blue', textScale: 100, iconSet: 'auto',
          textColor: '', accentColor: '',
        }, { anim: 'fade', duration: 500 }),
        W('markdown', [66, 10, 30, 76], {
          body: L(
            '### Out & about\n\n- **Old town walk** — 15 min on foot\n- **Museum quarter** — tram 2, 4 stops\n- **Vineyards** — bus 38A from the door\n\nAsk the concierge for tickets.',
            '### Rund ums Haus\n\n- **Altstadt-Spaziergang** — 15 Min. zu Fuß\n- **Museumsquartier** — Tram 2, 4 Stationen\n- **Weinberge** — Bus 38A direkt vor der Tür\n\nTickets an der Rezeption.'),
          sourceUrl: '', refreshSec: 0, theme: 'gradient-blue', textScale: 275,
          align: 'left', valign: 'top', columns: '1', autoScroll: false, scrollSec: 30,
        }, { anim: 'fade-left', delay: 200, duration: 600 }),
      ],
    }),
    S({
      name: L('World clocks', 'Weltzeit'),
      theme: 'dark-minimal',
      duration: 10,
      widgets: [
        W('world-clock', [4, 16, 92, 60], {
          zones: [
            { label: L('Here', 'Hier'), tz: 'Europe/Berlin' },
            { label: 'London', tz: 'Europe/London' },
            { label: 'New York', tz: 'America/New_York' },
            { label: 'Tokyo', tz: 'Asia/Tokyo' },
            { label: 'Dubai', tz: 'Asia/Dubai' },
          ],
          display: 'time', dateFormat: 'weekday-short', hour12: false, locale: '',
          showOffset: false, showRelative: false, showDayNight: true,
          layout: 'row', highlightFirst: true, textScale: 160, theme: 'dark-minimal',
        }, { anim: 'fade-up', duration: 600 }),
        tickerBar([
          L('Check-out 11:00 · late check-out on request', 'Check-out 11:00 Uhr · Late Check-out auf Anfrage'),
          L('Airport shuttle every hour from the main entrance', 'Flughafenshuttle stündlich ab Haupteingang'),
        ], { theme: 'dark-minimal', speed: 55 }),
      ],
    }),
  ],
});

registerTemplate({
  id: 'hotel-meeting-room',
  category: 'hospitality',
  accent: '#38bdf8',
  name: L('Meeting room door sign', 'Türschild Besprechungsraum'),
  description: L(
    'A portrait door display: what is running now, what comes next, and a free/busy state anyone can read from ten metres away.',
    'Ein Türdisplay im Hochformat: was gerade läuft, was als Nächstes kommt und ein Frei/Belegt-Status, den man aus zehn Metern liest.'),
  tags: [L('room', 'Raum'), L('door sign', 'Türschild'), L('portrait', 'Hochformat'), L('booking', 'Buchung')],
  canvas: { w: 1080, h: 1920, fit: 'fill' },
  defaults: { theme: 'corporate-blue', transition: 'fade', duration: 20 },
  build: () => [
    S({
      name: L('Now & next', 'Jetzt & danach'),
      theme: 'corporate-blue',
      duration: 30,
      widgets: [
        W('text', [6, 3, 88, 8], headline(
          L('Salon Mozart', 'Salon Mozart'), { theme: 'corporate-blue', textScale: 260 })),
        W('calendar', [4, 12, 92, 60], {
          heading: '',
          view: 'now-next', maxItems: 4, hidePast: true, daysAhead: 1,
          weekDays: 'work', perDayCap: 0,
          emptyText: L('Free — walk in', 'Frei — einfach nutzen'),
          roomName: L('Salon Mozart', 'Salon Mozart'), showClock: true,
          icsUrl: '', refreshSec: 300, locale: '', theme: 'corporate-blue', textScale: 110,
          events: [
            { start: at(0, '09:00'), summary: L('Strategy workshop — Nordwind AG', 'Strategie-Workshop — Nordwind AG'), location: L('Salon Mozart', 'Salon Mozart') },
            { start: at(0, '13:00'), summary: L('Board meeting', 'Vorstandssitzung'), location: L('Salon Mozart', 'Salon Mozart') },
            { start: at(0, '16:30'), summary: L('Supplier review', 'Lieferantengespräch'), location: L('Salon Mozart', 'Salon Mozart') },
          ],
        }, { anim: 'fade', duration: 500 }),
        W('qr-code', [22, 74, 56, 20], {
          template: 'url', url: 'https://agentview.de', text: '',
          wifiSsid: '', wifiPassword: '', wifiEnc: 'WPA', wifiHidden: false,
          vcardName: '', vcardPhone: '', vcardEmail: '', vcardOrg: '', vcardUrl: '',
          label: L('Book this room', 'Diesen Raum buchen'),
          showDetails: false, layout: 'horizontal', size: 480, moduleStyle: 'rounded',
          fgColor: '#000000', bgColor: '#ffffff', ecLevel: 'M', logoUrl: '', logoSize: 22,
          frameless: true, textScale: 140, theme: 'corporate-blue', textColor: '', accentColor: '',
        }, { anim: 'fade-up', delay: 250, duration: 600 }),
        tickerBar([
          L('Please leave the room as you found it', 'Bitte den Raum so hinterlassen, wie Sie ihn vorgefunden haben'),
          L('Technical support: extension 400', 'Technischer Support: Durchwahl 400'),
        ], { rect: [0, 95, 100, 5], theme: 'corporate-blue', speed: 45, textScale: 120 }),
      ],
    }),
  ],
});

registerTemplate({
  id: 'fitness-studio-board',
  category: 'fitness',
  accent: '#22c55e',
  name: L('Gym & studio board', 'Studio-Board'),
  description: L(
    'For the training floor: today’s class schedule, a members’ leaderboard, a warm-up routine as steps and a challenge countdown.',
    'Für die Trainingsfläche: Kursplan des Tages, Mitglieder-Ranking, ein Aufwärmprogramm als Schrittfolge und ein Challenge-Countdown.'),
  tags: [L('gym', 'Fitness'), L('classes', 'Kurse'), L('leaderboard', 'Ranking'), L('challenge', 'Challenge')],
  defaults: { theme: 'neon-cyber', transition: 'zoom', duration: 13 },
  build: () => [
    S({
      name: L('Class schedule', 'Kursplan'),
      theme: 'neon-cyber',
      duration: 20,
      widgets: [
        W('text', [5, 5, 58, 20], headline(
          L('Classes today', 'Kurse heute'), { theme: 'neon-cyber', textScale: 395 })),
        cornerClock({ theme: 'neon-cyber', display: 'time', rect: [75, 5, 20, 20], textScale: 105 }),
        W('data-table', [5, 27, 90, 68], {
          source: 'inline',
          headers: L('Time, Class, Trainer, Studio, Spots', 'Zeit, Kurs, Trainer:in, Studio, Plätze'),
          align: 'llllr',
          rows: [
            { c1: '07:00', c2: L('Morning HIIT', 'Morgen-HIIT'), c3: 'Nina', c4: '1', c5: L('FULL', 'VOLL') },
            { c1: '09:30', c2: L('Power yoga', 'Power-Yoga'), c3: 'Marco', c4: '2', c5: '4' },
            { c1: '12:15', c2: L('Express abs', 'Bauch express'), c3: 'Nina', c4: '1', c5: '9' },
            { c1: '17:00', c2: L('Spinning', 'Indoor Cycling'), c3: 'Jules', c4: '3', c5: '2' },
            { c1: '18:30', c2: L('Functional strength', 'Functional Strength'), c3: 'Sam', c4: '1', c5: '11' },
            { c1: '20:00', c2: L('Stretch & unwind', 'Stretch & Entspannung'), c3: 'Marco', c4: '2', c5: '15' },
          ],
          dataUrl: '', refreshSec: 0, striped: true, autoAlignNumbers: true,
          density: 'comfortable', headerStyle: 'accent', textScale: 335,
          pageRows: 0, pageSec: 8,
          highlightRules: [{ keyword: L('FULL', 'VOLL'), color: 'bad' }],
          theme: 'neon-cyber',
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('Leaderboard', 'Ranking'),
      theme: 'neon-cyber',
      duration: 15,
      widgets: [
        W('leaderboard', [4, 5, 92, 86], {
          heading: L('Rowing challenge', 'Ruder-Challenge'),
          subheading: L('Metres this month', 'Meter diesen Monat'),
          rows: [
            { name: 'Lena K.', value: 84200, note: L('12 sessions', '12 Einheiten'), deltaPct: 9.1, avatar: '' },
            { name: 'Tobias R.', value: 79800, note: L('11 sessions', '11 Einheiten'), deltaPct: 4.4, avatar: '' },
            { name: 'Feride A.', value: 71300, note: L('14 sessions', '14 Einheiten'), deltaPct: 12.0, avatar: '' },
            { name: 'Marc D.', value: 65900, note: '', deltaPct: -2.0, avatar: '' },
            { name: 'Ines B.', value: 58400, note: '', deltaPct: 6.5, avatar: '' },
            { name: 'Paul S.', value: 51100, note: '', deltaPct: 1.2, avatar: '' },
          ],
          source: 'inline', dataUrl: '', refreshSec: 600,
          sortOrder: 'desc', maxRows: 6, unit: 'm', unitPosition: 'after',
          numberFormat: 'compact', locale: '',
          showRank: true, medals: true, showBars: true, showDelta: true, showAvatars: false,
          highlightName: '', podium: true, textScale: 100, theme: 'neon-cyber',
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('Warm-up', 'Aufwärmen'),
      theme: 'neon-cyber',
      duration: 24,
      widgets: [
        W('steps', [4, 8, 92, 80], {
          heading: L('Five minutes before you lift', 'Fünf Minuten vor dem ersten Satz'),
          steps: [
            { title: L('2 min bike', '2 Min. Rad'), desc: L('Easy pace, get the blood moving.', 'Lockeres Tempo, Kreislauf in Gang bringen.'), icon: 'heart' },
            { title: L('Mobility', 'Mobilität'), desc: L('Shoulders, hips, ankles — ten each.', 'Schultern, Hüfte, Sprunggelenke — je zehn.'), icon: 'sparkles' },
            { title: L('Activation', 'Aktivierung'), desc: L('Band pull-aparts and glute bridges.', 'Band-Pull-Aparts und Glute Bridges.'), icon: 'check' },
            { title: L('Ramp-up set', 'Aufwärmsatz'), desc: L('50 % of your working weight, twice.', '50 % des Arbeitsgewichts, zweimal.'), icon: 'arrow' },
          ],
          layout: 'horizontal', numberStyle: 'circle', showConnector: true, showDesc: true,
          spotlight: 1, autoAdvanceSec: 6, textScale: 100, theme: 'neon-cyber',
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('Challenge', 'Challenge'),
      theme: 'neon-cyber',
      duration: 12,
      widgets: [
        W('countdown', [6, 10, 88, 46], {
          target: { at: inDays(12), tz: 'Europe/Berlin' },
          heading: L('Summer challenge ends in', 'Die Sommer-Challenge endet in'),
          theme: 'neon-cyber',
          expiredText: L('Results are in!', 'Die Ergebnisse sind da!'),
          units: 'dhm', unitStyle: 'short', locale: '', showTarget: false,
          textScale: 250, urgentBelow: 48, urgentColor: '#f0abfc', finishedMode: 'text',
        }, { anim: 'scale', duration: 700 }),
        W('progress', [22, 58, 56, 30], {
          label: L('Studio goal: 5 million metres', 'Studioziel: 5 Millionen Meter'),
          value: 3_640_000, target: 5_000_000, unit: 'm',
          source: 'inline', dataUrl: '', refreshSec: 300,
          style: 'bar', showValue: true, animate: true,
          align: 'center', labelPos: 'above', labelEmphasis: true,
          color: '#22c55e', locale: '', textScale: 375, labelScale: 90, valueScale: 110,
          useThresholds: false, invertThresholds: false, thresholdWarn: 70, thresholdGood: 90,
          colorLow: '#ef4444', colorMid: '#f59e0b', colorHigh: '#22c55e',
          theme: 'neon-cyber',
        }, { anim: 'fade-up', delay: 250, duration: 600 }),
      ],
    }),
  ],
});

registerTemplate({
  id: 'realestate-window',
  category: 'realestate',
  accent: '#fdba74',
  name: L('Estate agency window', 'Immobilien-Schaufenster'),
  description: L(
    'The 24/7 shop window: a property of the week with the key figures, a photo tour, the neighbourhood on a map and a QR code to the full listing.',
    'Das Schaufenster rund um die Uhr: Objekt der Woche mit Eckdaten, Fototour, die Lage auf der Karte und ein QR-Code zum vollständigen Exposé.'),
  tags: [L('property', 'Immobilie'), L('shop window', 'Schaufenster'), L('listing', 'Exposé'), L('map', 'Karte')],
  defaults: { theme: 'editorial-mono', transition: 'dissolve', duration: 12 },
  build: () => [
    S({
      name: L('Property of the week', 'Objekt der Woche'),
      theme: 'editorial-mono',
      widgets: [
        W('image', [0, 0, 58, 100], backdrop('', 20), { z: 0, loop: 'kenburns' }),
        W('text', [61, 8, 36, 30], paragraph(
          L('<h2>Loft with roof terrace</h2><p>Munich · Haidhausen</p>',
            '<h2>Loft mit Dachterrasse</h2><p>München · Haidhausen</p>'),
          { theme: 'editorial-mono', valign: 'middle', textScale: 285 }), { z: 1, anim: 'fade-left', duration: 600 }),
        // Two facts, not four. Four cards in a 36 %-wide column pushed the
        // labels below reading size — and "Year built" is not a KPI: as a
        // number it even collected a thousands separator and advertised the
        // year 1,998. Rooms and year move to the caption, where they read.
        W('kpi-cards', [61, 38, 36, 40], {
          cards: [
            { label: L('Living space', 'Wohnfläche'), value: 128, target: 0, unit: 'm²', deltaPct: '', history: '', goodIsDown: '' },
            { label: L('Price', 'Kaufpreis'), value: 895000, target: 0, unit: '€', deltaPct: '', history: '', goodIsDown: '' },
          ],
          source: 'inline', dataUrl: '', refreshSec: 0,
          columns: '1', density: 'compact',
          showDelta: false, showSparkline: false, showTarget: false,
          numberFormat: 'full', locale: '', textScale: 210, theme: 'editorial-mono',
        }, { z: 2, anim: 'fade-left', delay: 200, duration: 600 }),
        W('text', [61, 80, 36, 14], paragraph(
          L('<p>4 rooms · built 1998 · energy certificate B</p>',
            '<p>4 Zimmer · Baujahr 1998 · Energieausweis B</p>'),
          { theme: 'editorial-mono', textScale: 180 }), { z: 3 }),
      ],
    }),
    S({
      name: L('Photo tour', 'Fototour'),
      theme: 'editorial-mono',
      duration: 24,
      widgets: [
        W('image-gallery', [0, 0, 100, 100], {
          urls: [], perImageSec: 5, fit: 'cover',
          kenBurns: true, kenBurnsIntensity: 'subtle',
          transition: 'fade', transitionMs: 800,
          shuffle: false, reshuffleEachLoop: false,
          showCaptions: true, showProgress: 'counter',
        }),
      ],
    }),
    S({
      name: L('Location', 'Lage'),
      theme: 'minimal-dark',
      duration: 14,
      widgets: [
        W('map', [0, 0, 60, 100], {
          location: {
            lat: 48.129, lng: 11.598, zoom: 15,
            markers: [{ lat: 48.129, lng: 11.598, label: L('The property', 'Das Objekt'), icon: 'home' }],
          },
          style: 'carto-light', fitMarkers: false, tileFilter: 'none',
          caption: L('Haidhausen · 6 min to Ostbahnhof', 'Haidhausen · 6 Min. zum Ostbahnhof'),
          tourSec: 0, lockInteraction: true, tileUrl: '', tileAttribution: '',
        }),
        W('markdown', [63, 10, 34, 78], {
          body: L(
            '### The neighbourhood\n\n- **Schools** — primary 400 m, grammar school 1.1 km\n- **Transport** — S-Bahn 6 min, tram at the door\n- **Everyday** — supermarket, bakery, chemist within 300 m\n- **Green** — Ostpark 900 m\n\nViewings by appointment.',
            '### Die Lage\n\n- **Schulen** — Grundschule 400 m, Gymnasium 1,1 km\n- **Verkehr** — S-Bahn 6 Min., Tram vor der Tür\n- **Alltag** — Supermarkt, Bäcker, Apotheke in 300 m\n- **Grün** — Ostpark 900 m\n\nBesichtigung nach Vereinbarung.'),
          sourceUrl: '', refreshSec: 0, theme: 'minimal-dark', textScale: 245,
          align: 'left', valign: 'top', columns: '1', autoScroll: false, scrollSec: 30,
        }, { anim: 'fade-left', duration: 600 }),
      ],
    }),
    S({
      name: L('Full listing', 'Exposé'),
      theme: 'editorial-mono',
      duration: 12,
      widgets: [
        W('text', [6, 16, 44, 46], paragraph(
          L('<h2>The full listing</h2><p>Floor plans, energy certificate and viewing dates — scan and read it on your phone, any time of day.</p>',
            '<h2>Das ganze Exposé</h2><p>Grundrisse, Energieausweis und Besichtigungstermine — scannen und bequem am Handy lesen, rund um die Uhr.</p>'),
          { theme: 'editorial-mono', textScale: 235 }), { anim: 'fade-right', duration: 600 }),
        W('qr-code', [54, 10, 40, 78], {
          template: 'url', url: 'https://agentview.de', text: '',
          wifiSsid: '', wifiPassword: '', wifiEnc: 'WPA', wifiHidden: false,
          vcardName: '', vcardPhone: '', vcardEmail: '', vcardOrg: '', vcardUrl: '',
          label: L('Scan for the listing', 'Exposé scannen'),
          showDetails: false, layout: 'vertical', size: 480, moduleStyle: 'square',
          fgColor: '#000000', bgColor: '#ffffff', ecLevel: 'Q', logoUrl: '', logoSize: 22,
          frameless: false, textScale: 305, theme: 'editorial-mono', textColor: '', accentColor: '',
        }, { anim: 'scale', delay: 200, duration: 600 }),
      ],
    }),
  ],
});
