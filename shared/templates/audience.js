// The sets that exist for a VIEWER rather than for a venue.
//
// Every other file in this folder answers "what kind of place is this" — a
// bistro, a warehouse, an estate agent. Sorted by who is actually standing in
// front of the screen, the catalog was one long block of adults 20-65: two sets
// touched under-25s (a secondary-school board and a campus board), three sat in
// places where older people wait (a pharmacy, a waiting room, a citizens'
// office) and were typographically identical to the office dashboards, and
// nothing at all addressed a child.
//
// So these six are chosen to fill exactly that: 3-6, 6-10, 13-19, children with
// their parents, 75+, and 60+. They use the two audience themes from
// slide-themes.css — playful-bright for the young sets, clarity-light for the
// old ones — both light-ground, because light text on a dark field is the
// harder read for an ageing eye and for a bright room, and both audiences are
// in bright rooms.
//
// TWO RULES ARE DELIBERATE HERE AND NOWHERE ELSE IN THE CATALOG:
//
//   No ticker on the two 60+/75+ sets. A ticker is the catalog's most-used
//   element and it is the wrong element here: reading moving text needs the
//   text held stable across saccades, which is exactly what declines. A day
//   room is also the one place with the time to page through slides instead.
//
//   Fewer rows, longer durations. A table of six lines is a fine board for a
//   staffroom and an unreadable one at 3 metres for someone who reads at half
//   the speed the designer does. These sets carry three or four.

import { registerTemplate } from './registry.js';
import { L, S, W, headline, paragraph, tickerBar, cornerClock, onWeekday, inDays } from './lib.js';

// Audience words in every set's tags, so "Kinder", "children", "Senioren" and
// "seniors" find them in the store search — tags already feed the haystack, and
// the age dimension is invisible in the category chips by design (a nursery is
// still Education, a day centre is still Health).
const KIDS = [L('children', 'Kinder'), L('kids', 'Kita')];
const TEENS = [L('teenagers', 'Jugendliche'), L('youth', 'Jugend')];
const SENIORS = [L('seniors', 'Senioren'), L('accessible', 'barrierearm'), L('large type', 'Großschrift')];

// ---------------------------------------------------------------------------
// 3-6 — nursery
// ---------------------------------------------------------------------------
registerTemplate({
  id: 'edu-kita',
  category: 'education',
  accent: '#9a3412',
  name: L('Nursery day board', 'Kita-Tagestafel'),
  description: L(
    'For the corridor where parents drop off and collect: the greeting, the shape of the day in pictures for the children, what is for lunch, and the notices the parents need.',
    'Für den Flur zwischen Bringen und Abholen: die Begrüßung, der Tagesablauf in Bildern für die Kinder, das Mittagessen und die Hinweise, die die Eltern brauchen.'),
  tags: [...KIDS, L('nursery', 'Kindergarten'), L('day plan', 'Tagesablauf'), L('lunch', 'Mittagessen')],
  defaults: { theme: 'playful-bright', transition: 'fade', duration: 16 },
  build: () => [
    S({
      name: L('Good morning', 'Guten Morgen'),
      theme: 'playful-bright',
      duration: 14,
      widgets: [
        W('greeting', [5, 12, 90, 58], {
          venue: L('Sunshine Nursery', 'Kita Sonnenschein'),
          welcomeTo: L('welcome to', 'willkommen in der'),
          subtitle: L('Today the Bear group is outside all morning', 'Heute ist die Bärengruppe den ganzen Vormittag draußen'),
          greetMorning: L('Good morning', 'Guten Morgen'),
          greetAfternoon: L('Good afternoon', 'Guten Tag'),
          greetEvening: L('Good evening', 'Guten Abend'),
          greetNight: L('Good night', 'Gute Nacht'),
          hourMorning: 5, hourAfternoon: 12, hourEvening: 17, hourNight: 22,
          timezone: 'Europe/Berlin', showDate: true, showTime: false, locale: '',
          textScale: 195, theme: 'playful-bright',
        }, { anim: 'fade-up', duration: 700 }),
        cornerClock({ theme: 'playful-bright', display: 'weekday', rect: [5, 76, 90, 16], align: 'center', textScale: 375 }),
      ],
    }),
    S({
      name: L('Our day', 'Unser Tag'),
      theme: 'playful-bright',
      duration: 20,
      widgets: [
        W('steps', [4, 6, 92, 88], {
          heading: L('Our day', 'Unser Tag'),
          steps: [
            { title: L('Morning circle', 'Morgenkreis'), desc: L('We sing and say hello', 'Wir singen und sagen Hallo'), icon: 'sparkles' },
            { title: L('Free play', 'Freispiel'), desc: L('Inside or in the garden', 'Drinnen oder im Garten'), icon: 'star' },
            { title: L('Lunch', 'Mittagessen'), desc: L('All together at the big table', 'Alle zusammen am großen Tisch'), icon: 'coffee' },
            { title: L('Quiet time', 'Ruhezeit'), desc: L('Story and a rest', 'Geschichte und ausruhen'), icon: 'heart' },
            { title: L('Home time', 'Abholzeit'), desc: L('From half past two', 'Ab halb drei'), icon: 'home' },
          ],
          layout: 'horizontal', numberStyle: 'icon', showConnector: true, showDesc: true,
          spotlight: 0, autoAdvanceSec: 0, textScale: 100, theme: 'playful-bright',
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('Lunch this week', 'Essen diese Woche'),
      theme: 'playful-bright',
      duration: 18,
      widgets: [
        W('menu', [4, 4, 92, 92], {
          rows: [
            { section: L('Monday', 'Montag'), name: L('Pasta with tomato sauce', 'Nudeln mit Tomatensoße'), price: 0, desc: '', tags: 'vegetarian', image: '' },
            { section: L('Tuesday', 'Dienstag'), name: L('Potato soup with bread', 'Kartoffelsuppe mit Brot'), price: 0, desc: '', tags: 'vegan', image: '' },
            { section: L('Wednesday', 'Mittwoch'), name: L('Pancakes with apple sauce', 'Pfannkuchen mit Apfelmus'), price: 0, desc: '', tags: 'vegetarian', image: '' },
            { section: L('Thursday', 'Donnerstag'), name: L('Rice with vegetables', 'Reis mit Gemüse'), price: 0, desc: '', tags: 'vegan', image: '' },
            { section: L('Friday', 'Freitag'), name: L('Fish fingers and potatoes', 'Fischstäbchen mit Kartoffeln'), price: 0, desc: '', tags: '', image: '' },
          ],
          currency: 'EUR', currencyPosition: 'after', hideZeroDecimals: true,
          // No prices: lunch is in the monthly fee, and a column of "0,00 €"
          // is the kind of detail that turns a warm board into a form.
          showPrices: false, showImages: false, columns: '2', sectionFilter: '',
          footnote: L('Allergens are on the notice board by the office',
            'Allergene hängen am Aushang neben dem Büro'),
          textScale: 175, locale: '', theme: 'playful-bright',
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('For parents', 'Für die Eltern'),
      theme: 'playful-bright',
      duration: 18,
      widgets: [
        W('text', [5, 6, 90, 24], headline(
          L('For parents', 'Für die Eltern'),
          { theme: 'playful-bright', textScale: 395 })),
        W('text', [5, 32, 90, 60], paragraph(L(
          '<p><strong>Parents’ evening</strong> — Thursday, 19:30, in the big room.</p><p><strong>Spare clothes</strong> — please check the bag, the garden is muddy.</p><p><strong>Closed</strong> — the week between Christmas and New Year.</p>',
          '<p><strong>Elternabend</strong> — Donnerstag, 19:30 Uhr, im großen Raum.</p><p><strong>Wechselkleidung</strong> — bitte den Beutel prüfen, der Garten ist matschig.</p><p><strong>Schließtage</strong> — die Woche zwischen Weihnachten und Neujahr.</p>'),
        { theme: 'playful-bright', valign: 'top', textScale: 220 }), { anim: 'fade-up', delay: 150, duration: 600 }),
      ],
    }),
  ],
});

// ---------------------------------------------------------------------------
// 6-10 — primary school
// ---------------------------------------------------------------------------
registerTemplate({
  id: 'edu-primary',
  category: 'education',
  accent: '#9a3412',
  name: L('Primary school board', 'Grundschul-Tafel'),
  description: L(
    'The foyer board a seven-year-old can read on the way past: what is happening today, what is for lunch, the rule of the week and how long until the holidays.',
    'Die Tafel im Foyer, die ein Siebenjähriger im Vorbeigehen lesen kann: was heute ansteht, was es zu essen gibt, die Regel der Woche und wie lange es noch bis zu den Ferien ist.'),
  tags: [...KIDS, L('primary school', 'Grundschule'), L('timetable', 'Stundenplan'), L('holidays', 'Ferien')],
  defaults: { theme: 'playful-bright', transition: 'slide', duration: 16 },
  build: () => [
    S({
      name: L('Today', 'Heute'),
      theme: 'playful-bright',
      duration: 18,
      widgets: [
        W('text', [5, 6, 62, 18], headline(
          L('What’s on today', 'Was heute los ist'),
          { theme: 'playful-bright', textScale: 320 })),
        cornerClock({ theme: 'playful-bright', display: 'weekday', rect: [69, 6, 26, 18], align: 'right', textScale: 190 }),
        // Three columns, not five: a table a child reads standing up, not a
        // staff rota. Room and class are what they are looking for.
        W('data-table', [5, 28, 90, 66], {
          source: 'inline',
          headers: L('Class, What, Where', 'Klasse, Was, Wo'),
          align: 'lll',
          rows: [
            { c1: '1a', c2: L('Swimming', 'Schwimmen'), c3: L('Bus at 09:00', 'Bus um 09:00') },
            { c1: '2b', c2: L('Library visit', 'Büchereibesuch'), c3: L('Meet in the hall', 'Treffpunkt Aula') },
            { c1: '3a', c2: L('Music room instead of 204', 'Musikraum statt 204'), c3: L('Room change', 'Raumwechsel') },
            { c1: '4c', c2: L('Sports day practice', 'Training Sportfest'), c3: L('Playground', 'Schulhof') },
          ],
          dataUrl: '', refreshSec: 0, striped: true, autoAlignNumbers: false,
          density: 'comfortable', headerStyle: 'accent', textScale: 345,
          pageRows: 0, pageSec: 8,
          highlightRules: [{ keyword: L('Room change', 'Raumwechsel'), color: 'warn' }],
          theme: 'playful-bright',
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('Canteen', 'Mensa'),
      theme: 'playful-bright',
      duration: 18,
      widgets: [
        W('menu', [4, 4, 92, 92], {
          rows: [
            { section: L('Monday', 'Montag'), name: L('Spaghetti bolognese', 'Spaghetti Bolognese'), price: 3.20, desc: '', tags: '', image: '' },
            { section: L('Tuesday', 'Dienstag'), name: L('Vegetable curry with rice', 'Gemüsecurry mit Reis'), price: 3.20, desc: '', tags: 'vegan', image: '' },
            { section: L('Wednesday', 'Mittwoch'), name: L('Pancakes with apple sauce', 'Pfannkuchen mit Apfelmus'), price: 3.00, desc: '', tags: 'vegetarian', image: '' },
            { section: L('Thursday', 'Donnerstag'), name: L('Meatballs with mash', 'Frikadellen mit Kartoffelpüree'), price: 3.50, desc: '', tags: '', image: '' },
            { section: L('Friday', 'Freitag'), name: L('Pizza and salad', 'Pizza und Salat'), price: 3.50, desc: '', tags: 'vegetarian', image: '' },
          ],
          currency: 'EUR', currencyPosition: 'after', hideZeroDecimals: false,
          showPrices: true, showImages: false, columns: '2', sectionFilter: '',
          footnote: L('Order by Friday for the following week',
            'Bestellung bis Freitag für die Folgewoche'),
          textScale: 175, locale: '', theme: 'playful-bright',
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('Rule of the week', 'Regel der Woche'),
      theme: 'playful-bright',
      duration: 14,
      widgets: [
        W('text', [6, 10, 88, 26], headline(
          L('Rule of the week', 'Regel der Woche'),
          { theme: 'playful-bright', textScale: 395 })),
        W('text', [6, 38, 88, 48], paragraph(L(
          '<p>We walk in the corridor. Running is for the playground.</p>',
          '<p>Im Flur wird gegangen. Gerannt wird auf dem Schulhof.</p>'),
        { theme: 'playful-bright', valign: 'middle', textScale: 395 }), { anim: 'fade-up', delay: 150, duration: 600 }),
      ],
    }),
    S({
      name: L('Holidays', 'Ferien'),
      theme: 'playful-bright',
      duration: 14,
      widgets: [
        W('countdown', [5, 14, 90, 70], {
          target: { at: inDays(38), tz: 'Europe/Berlin' },
          heading: L('Days until the holidays', 'Tage bis zu den Ferien'),
          theme: 'playful-bright',
          expiredText: L('Holidays!', 'Ferien!'),
          units: 'auto', unitStyle: 'long', locale: '', showTarget: true,
          textScale: 150, urgentBelow: 0, urgentColor: '', finishedMode: 'text',
        }, { anim: 'fade-up', duration: 700 }),
      ],
    }),
  ],
});

// ---------------------------------------------------------------------------
// 13-19 — youth sports club
// ---------------------------------------------------------------------------
registerTemplate({
  id: 'sport-youth-club',
  category: 'fitness',
  accent: '#f0abfc',
  name: L('Youth club & team board', 'Jugend- & Vereinstafel'),
  description: L(
    'The screen in the clubhouse corridor: the countdown to the next fixture, the table, what training is on this week, and the notices nobody reads on paper.',
    'Der Bildschirm im Vereinsheim: Countdown zum nächsten Spiel, die Tabelle, das Training dieser Woche und die Aushänge, die auf Papier niemand liest.'),
  tags: [...TEENS, L('sports club', 'Sportverein'), L('table', 'Tabelle'), L('training', 'Training')],
  defaults: { theme: 'neon-cyber', transition: 'slide', duration: 15 },
  build: () => [
    S({
      name: L('Next fixture', 'Nächstes Spiel'),
      theme: 'neon-cyber',
      duration: 14,
      widgets: [
        W('countdown', [5, 10, 90, 56], {
          target: { at: inDays(4), tz: 'Europe/Berlin' },
          heading: L('Kick-off in', 'Anpfiff in'),
          theme: 'neon-cyber',
          expiredText: L('Now!', 'Jetzt!'),
          units: 'auto', unitStyle: 'short', locale: '', showTarget: true,
          textScale: 195, urgentBelow: 0, urgentColor: '', finishedMode: 'text',
        }, { anim: 'fade-up', duration: 700 }),
        W('text', [5, 68, 90, 18], paragraph(L(
          '<p>U17 against Nordstadt · home · meet 90 minutes before</p>',
          '<p>U17 gegen Nordstadt · Heimspiel · Treffen 90 Minuten vorher</p>'),
        { theme: 'neon-cyber', valign: 'middle', textScale: 145 }), { anim: 'fade-up', delay: 200, duration: 600 }),
      ],
    }),
    S({
      name: L('Table', 'Tabelle'),
      theme: 'neon-cyber',
      duration: 18,
      widgets: [
        W('leaderboard', [4, 5, 92, 90], {
          heading: L('League table', 'Tabelle'),
          subheading: L('After matchday 14', 'Nach dem 14. Spieltag'),
          rows: [
            { name: L('Nordstadt', 'Nordstadt'), value: 32, note: L('10 W · 2 D · 2 L', '10 S · 2 U · 2 N'), deltaPct: 0 },
            { name: L('Our team', 'Unsere Mannschaft'), value: 29, note: L('9 W · 2 D · 3 L', '9 S · 2 U · 3 N'), deltaPct: 0 },
            { name: L('Westend', 'Westend'), value: 24, note: L('7 W · 3 D · 4 L', '7 S · 3 U · 4 N'), deltaPct: 0 },
            { name: L('Sportfreunde', 'Sportfreunde'), value: 18, note: L('5 W · 3 D · 6 L', '5 S · 3 U · 6 N'), deltaPct: 0 },
            { name: L('Post SV', 'Post SV'), value: 11, note: L('3 W · 2 D · 9 L', '3 S · 2 U · 9 N'), deltaPct: 0 },
          ],
          source: 'inline', dataUrl: '', refreshSec: 0, sortOrder: 'desc', maxRows: 8,
          unit: L('pts', 'Pkt.'), unitPosition: 'after', numberFormat: 'integer', locale: '',
          showRank: true, medals: false, showBars: true,
          // No delta arrows: a points column is not a trend, and an arrow next
          // to it invites reading it as one.
          showDelta: false, showAvatars: false,
          highlightName: L('Our team', 'Unsere Mannschaft'),
          podium: false, textScale: 100, theme: 'neon-cyber',
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('Training', 'Training'),
      theme: 'neon-cyber',
      duration: 18,
      widgets: [
        W('calendar', [4, 5, 92, 90], {
          heading: L('Training this week', 'Training diese Woche'),
          view: 'week', maxItems: 12, hidePast: false, daysAhead: 7,
          weekDays: 5, perDayCap: 3,
          emptyText: L('No sessions', 'Kein Training'),
          roomName: '', showClock: false, icsUrl: '', refreshSec: 0, locale: '',
          theme: 'neon-cyber', textScale: 230,
          events: [
            { start: onWeekday(1, '17:00'), summary: L('U15 training', 'Training U15'), location: L('Pitch 2', 'Platz 2') },
            { start: onWeekday(1, '18:30'), summary: L('U17 training', 'Training U17'), location: L('Pitch 1', 'Platz 1') },
            { start: onWeekday(3, '17:00'), summary: L('U15 training', 'Training U15'), location: L('Pitch 2', 'Platz 2') },
            { start: onWeekday(3, '18:30'), summary: L('U17 training', 'Training U17'), location: L('Pitch 1', 'Platz 1') },
            { start: onWeekday(4, '16:30'), summary: L('Goalkeeper session', 'Torwarttraining'), location: L('Pitch 3', 'Platz 3') },
          ],
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('Notices', 'Aushänge'),
      theme: 'neon-cyber',
      duration: 16,
      widgets: [
        W('text', [5, 6, 55, 22], headline(
          L('Club notices', 'Aus dem Verein'),
          { theme: 'neon-cyber', textScale: 395 })),
        W('text', [5, 30, 55, 52], paragraph(L(
          '<p><strong>Kit</strong> — new shirts can be collected on Wednesdays.</p><p><strong>Membership fee</strong> — direct debit goes out at the end of the month.</p><p><strong>Summer camp</strong> — sign-up list is in the clubhouse.</p>',
          '<p><strong>Trikots</strong> — die neuen Trikots gibt es mittwochs.</p><p><strong>Beitrag</strong> — Lastschrift geht Ende des Monats raus.</p><p><strong>Sommercamp</strong> — Anmeldeliste hängt im Vereinsheim.</p>'),
        { theme: 'neon-cyber', valign: 'top', textScale: 185 }), { anim: 'fade-left', delay: 150, duration: 600 }),
        W('qr-code', [63, 12, 32, 70], {
          template: 'url', url: 'https://example.org/verein', text: '',
          wifiSsid: '', wifiPassword: '', wifiEnc: 'WPA', wifiHidden: false,
          vcardName: '', vcardPhone: '', vcardEmail: '', vcardOrg: '', vcardUrl: '',
          label: L('Team chat & fixtures', 'Team-Chat & Spielplan'),
          showDetails: false, layout: 'vertical', size: 380, moduleStyle: 'square',
          fgColor: '#000000', bgColor: '#ffffff', ecLevel: 'M', logoUrl: '', logoSize: 22,
          frameless: false, textScale: 345, theme: 'neon-cyber', textColor: '', accentColor: '',
        }, { anim: 'fade-left', delay: 250, duration: 600 }),
        tickerBar([
          L('Sports day — volunteers wanted', 'Sportfest — Helfer gesucht'),
          L('Clubhouse closed on Monday', 'Vereinsheim montags geschlossen'),
          L('New: girls’ team from age 12', 'Neu: Mädchenmannschaft ab 12'),
        ], { lead: L('Info', 'Info'), theme: 'neon-cyber', speed: 70 }),
      ],
    }),
  ],
});

// ---------------------------------------------------------------------------
// children + their parents — paediatric practice
// ---------------------------------------------------------------------------
registerTemplate({
  id: 'health-pediatrics',
  category: 'health',
  accent: '#9a3412',
  name: L('Paediatric waiting room', 'Kinderarzt-Wartezimmer'),
  description: L(
    'A waiting room with two audiences at once: the call board and a picture of what is about to happen for the child, the hours and the out-of-hours number for the parent.',
    'Ein Wartezimmer mit zwei Publikum gleichzeitig: die Aufruftafel und ein Bild davon, was gleich passiert, für das Kind — Sprechzeiten und Notdienst für die Eltern.'),
  tags: [...KIDS, L('paediatrics', 'Kinderarzt'), L('waiting room', 'Wartezimmer'), L('queue', 'Aufruf')],
  defaults: { theme: 'playful-bright', transition: 'fade', duration: 16 },
  build: () => [
    S({
      name: L('Now', 'Aufruf'),
      theme: 'playful-bright',
      duration: 20,
      widgets: [
        W('queue-call', [4, 5, 92, 90], {
          heading: L('It’s your turn', 'Du bist dran'),
          current: '14',
          counter: L('Room 2', 'Zimmer 2'),
          upcomingHeading: L('Nearly', 'Gleich'),
          upcoming: [
            { number: '15', counter: L('Room 2', 'Zimmer 2') },
            { number: '16', counter: L('Room 1', 'Zimmer 1') },
            { number: '17', counter: L('Room 3', 'Zimmer 3') },
          ],
          maxUpcoming: 3, layout: 'split', source: 'inline', dataUrl: '', refreshSec: 15,
          flashOnChange: true, waitLabel: '', waitMinutes: 0,
          footnote: L('Numbers are on your appointment card', 'Die Nummer steht auf deiner Karte'),
          textScale: 100, theme: 'playful-bright',
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('What happens', 'Was passiert'),
      theme: 'playful-bright',
      duration: 22,
      widgets: [
        // Written to the child, not about the child. A waiting room screen is
        // the one place a four-step explainer genuinely lowers the temperature.
        W('steps', [4, 6, 92, 88], {
          heading: L('What happens next', 'Was gleich passiert'),
          steps: [
            { title: L('We call your number', 'Wir rufen deine Nummer'), desc: L('It appears on this screen', 'Sie erscheint auf diesem Bildschirm'), icon: 'bell' },
            { title: L('We weigh and measure you', 'Wir wiegen und messen dich'), desc: L('You can keep your socks on', 'Socken darfst du anlassen'), icon: 'user' },
            { title: L('The doctor listens', 'Die Ärztin hört dich ab'), desc: L('The stethoscope is a bit cold', 'Das Stethoskop ist etwas kalt'), icon: 'heart' },
            { title: L('You’re done', 'Fertig'), desc: L('There is a sticker at the desk', 'An der Anmeldung gibt es einen Sticker'), icon: 'star' },
          ],
          layout: 'horizontal', numberStyle: 'icon', showConnector: true, showDesc: true,
          spotlight: 0, autoAdvanceSec: 0, textScale: 100, theme: 'playful-bright',
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('Opening hours', 'Sprechzeiten'),
      theme: 'playful-bright',
      duration: 16,
      widgets: [
        W('opening-hours', [4, 5, 58, 90], {
          heading: L('Opening hours', 'Sprechzeiten'),
          days: [
            { day: 'mon', from: '08:00', to: '12:00', from2: '15:00', to2: '18:00', closed: false },
            { day: 'tue', from: '08:00', to: '12:00', from2: '15:00', to2: '18:00', closed: false },
            { day: 'wed', from: '08:00', to: '12:00', from2: '', to2: '', closed: false },
            { day: 'thu', from: '08:00', to: '12:00', from2: '15:00', to2: '18:00', closed: false },
            { day: 'fri', from: '08:00', to: '13:00', from2: '', to2: '', closed: false },
            { day: 'sat', from: '', to: '', from2: '', to2: '', closed: true },
            { day: 'sun', from: '', to: '', from2: '', to2: '', closed: true },
          ],
          timezone: 'Europe/Berlin', locale: '', hour12: false, dayStyle: 'long',
          layout: 'list', showStatus: true, highlightToday: true,
          closedText: L('Closed', 'Geschlossen'),
          openLabel: L('Open now', 'Jetzt geöffnet'),
          closedLabel: L('Closed', 'Geschlossen'),
          note: L('Acute cases: please ring before you come',
            'Akute Fälle: bitte vorher anrufen'),
          textScale: 140, theme: 'playful-bright',
        }, { anim: 'fade-right', duration: 600 }),
        W('text', [65, 5, 31, 90], paragraph(L(
          '<h2>Out of hours</h2><p>Paediatric on-call service<br><strong>116 117</strong></p><p>Emergency<br><strong>112</strong></p>',
          '<h2>Außerhalb</h2><p>Kinderärztlicher Bereitschaftsdienst<br><strong>116 117</strong></p><p>Notfall<br><strong>112</strong></p>'),
        { theme: 'playful-bright', valign: 'middle', textScale: 255 }), { anim: 'fade-left', delay: 150, duration: 600 }),
      ],
    }),
    S({
      name: L('For parents', 'Für die Eltern'),
      theme: 'playful-bright',
      duration: 18,
      widgets: [
        W('text', [5, 6, 90, 20], headline(
          L('For parents', 'Für die Eltern'),
          { theme: 'playful-bright', textScale: 295 })),
        W('text', [5, 28, 90, 64], paragraph(L(
          '<p><strong>Vaccination clinic</strong> — Tuesdays 15:00–17:00, by appointment.</p><p><strong>Check-ups</strong> — please bring the yellow booklet.</p><p><strong>Prescriptions</strong> — order by phone before 11:00, collect the next day.</p>',
          '<p><strong>Impfsprechstunde</strong> — dienstags 15:00–17:00 Uhr, nach Termin.</p><p><strong>Vorsorge (U-Untersuchungen)</strong> — bitte das gelbe Heft mitbringen.</p><p><strong>Rezepte</strong> — telefonisch bis 11:00 Uhr, Abholung am Folgetag.</p>'),
        { theme: 'playful-bright', valign: 'top', textScale: 205 }), { anim: 'fade-up', delay: 150, duration: 600 }),
      ],
    }),
  ],
});

// ---------------------------------------------------------------------------
// 75+ — day centre / care home
// ---------------------------------------------------------------------------
registerTemplate({
  id: 'care-day-centre',
  category: 'health',
  accent: '#0b4f86',
  name: L('Day centre board', 'Tagespflege-Tafel'),
  description: L(
    'Built for the day room, not the office: the date large enough to settle the question, the programme in four lines, lunch, and when family may visit. No moving text anywhere.',
    'Für den Aufenthaltsraum gebaut, nicht fürs Büro: das Datum groß genug, um die Frage zu beantworten, das Programm in vier Zeilen, das Mittagessen und die Besuchszeiten. Nirgends Lauftext.'),
  tags: [...SENIORS, L('day care', 'Tagespflege'), L('care home', 'Pflegeheim'), L('programme', 'Tagesprogramm')],
  defaults: { theme: 'clarity-light', transition: 'fade', duration: 22 },
  build: () => [
    S({
      name: L('Today', 'Heute'),
      theme: 'clarity-light',
      duration: 20,
      widgets: [
        // The single most useful thing this screen does. Disorientation about
        // the day is ordinary here, and a wall clock does not answer it.
        W('clock', [5, 14, 90, 62], {
          timezone: 'Europe/Berlin', label: L('Today is', 'Heute ist'), locale: '',
          showOffset: false, display: 'date', style: 'digital', faceStyle: 'ticks',
          hour12: false, align: 'center', textScale: 100,
          showOpenBadge: false, openFrom: '08:00', openTo: '18:00', openText: '', closedText: '',
          theme: 'clarity-light',
        }, { anim: 'fade-up', duration: 700 }),
        cornerClock({ theme: 'clarity-light', display: 'weekday', rect: [5, 78, 90, 14], align: 'center', textScale: 385 }),
      ],
    }),
    S({
      name: L('Programme', 'Programm'),
      theme: 'clarity-light',
      duration: 26,
      widgets: [
        W('steps', [4, 6, 92, 88], {
          heading: L('Today’s programme', 'Unser Tagesprogramm'),
          steps: [
            { title: L('10:00 Exercise circle', '10:00 Bewegungsrunde'), desc: L('In the day room, seated', 'Im Aufenthaltsraum, im Sitzen'), icon: 'sparkles' },
            { title: L('12:00 Lunch', '12:00 Mittagessen'), desc: L('In the dining room', 'Im Speiseraum'), icon: 'coffee' },
            { title: L('14:30 Coffee and cake', '14:30 Kaffee und Kuchen'), desc: L('Today with the choir', 'Heute mit dem Chor'), icon: 'heart' },
            { title: L('16:00 Reading hour', '16:00 Lesestunde'), desc: L('By the window', 'Am Fenster'), icon: 'star' },
          ],
          // Vertical, not a row: four items across a wall means four narrow
          // columns of wrapped text, and wrapped text is the first thing to go.
          layout: 'vertical', numberStyle: 'icon', showConnector: true, showDesc: true,
          spotlight: 0, autoAdvanceSec: 0, textScale: 100, theme: 'clarity-light',
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('Lunch', 'Mittagessen'),
      theme: 'clarity-light',
      duration: 22,
      widgets: [
        W('text', [5, 5, 90, 16], headline(
          L('Lunch today', 'Mittagessen heute'),
          { theme: 'clarity-light', textScale: 185 })),
        // The note that belongs here is NOT in the menu's footnote field: a
        // footnote renders at about 2 % of slide height — 21 px — and this one
        // is an instruction people have to act on before 10:00. It gets its own
        // slide instead. Squeezing it in under the menu was tried and it cost
        // the menu a third of its size, which is the one thing this set is for:
        // at this type size a 1080p slide holds three dishes and a heading, and
        // a fourth element has to go somewhere else. That is what slides are.
        W('menu', [4, 24, 92, 72], {
          rows: [
            { section: L('Main', 'Hauptgang'), name: L('Roast beef with potatoes', 'Rinderbraten mit Kartoffeln'), price: 0, desc: L('and green beans', 'dazu grüne Bohnen'), tags: '', image: '' },
            { section: L('Main', 'Hauptgang'), name: L('Vegetable bake', 'Gemüseauflauf'), price: 0, desc: L('vegetarian', 'vegetarisch'), tags: 'vegetarian', image: '' },
            { section: L('Pudding', 'Nachtisch'), name: L('Stewed apple with cream', 'Apfelkompott mit Sahne'), price: 0, desc: '', tags: '', image: '' },
          ],
          currency: 'EUR', currencyPosition: 'after', hideZeroDecimals: true,
          showPrices: false, showImages: false, columns: '1', sectionFilter: '',
          footnote: '',
          textScale: 220, locale: '', theme: 'clarity-light',
        }, { anim: 'fade-up', delay: 150, duration: 600 }),
      ],
    }),
    S({
      name: L('Choosing', 'Essenswahl'),
      theme: 'clarity-light',
      duration: 16,
      widgets: [
        W('text', [6, 22, 88, 56], paragraph(L(
          '<p>Would you like the other dish?<br>Please tell us by <strong>10:00</strong>.</p>',
          '<p>Möchten Sie das andere Gericht?<br>Bitte bis <strong>10:00 Uhr</strong> Bescheid geben.</p>'),
        { theme: 'clarity-light', valign: 'middle', textScale: 395 }), { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('Visiting', 'Besuchszeiten'),
      theme: 'clarity-light',
      duration: 22,
      widgets: [
        W('opening-hours', [4, 5, 56, 90], {
          heading: L('Visiting hours', 'Besuchszeiten'),
          days: [
            { day: 'mon', from: '14:00', to: '18:00', from2: '', to2: '', closed: false },
            { day: 'tue', from: '14:00', to: '18:00', from2: '', to2: '', closed: false },
            { day: 'wed', from: '14:00', to: '18:00', from2: '', to2: '', closed: false },
            { day: 'thu', from: '14:00', to: '18:00', from2: '', to2: '', closed: false },
            { day: 'fri', from: '14:00', to: '18:00', from2: '', to2: '', closed: false },
            { day: 'sat', from: '10:00', to: '18:00', from2: '', to2: '', closed: false },
            { day: 'sun', from: '10:00', to: '18:00', from2: '', to2: '', closed: false },
          ],
          timezone: 'Europe/Berlin', locale: '', hour12: false, dayStyle: 'long',
          layout: 'list', showStatus: true, highlightToday: true,
          closedText: L('Closed', 'Geschlossen'),
          openLabel: L('Visitors welcome now', 'Besuch jetzt willkommen'),
          closedLabel: L('Outside visiting hours', 'Außerhalb der Besuchszeit'),
          note: '',
          textScale: 145, theme: 'clarity-light',
        }, { anim: 'fade-right', duration: 600 }),
        W('text', [63, 5, 33, 90], paragraph(L(
          '<h2>Reception</h2><p><strong>030 1234 560</strong></p><p>Weekdays 08:00–16:00</p><p>Ask for the day-care team.</p>',
          '<h2>Empfang</h2><p><strong>030 1234 560</strong></p><p>Werktags 08:00–16:00 Uhr</p><p>Fragen Sie nach der Tagespflege.</p>'),
        { theme: 'clarity-light', valign: 'middle', textScale: 265 }), { anim: 'fade-left', delay: 150, duration: 600 }),
      ],
    }),
  ],
});

// ---------------------------------------------------------------------------
// 60+ — neighbourhood / community centre
// ---------------------------------------------------------------------------
registerTemplate({
  id: 'public-community-centre',
  category: 'public',
  accent: '#0b4f86',
  name: L('Community centre board', 'Nachbarschaftstreff-Tafel'),
  description: L(
    'The board by the door of a community or seniors’ centre: what is on this week, the regular groups, when the office is staffed and who to ask. Large type, no moving text.',
    'Die Tafel neben der Tür im Nachbarschafts- oder Seniorentreff: was diese Woche läuft, die festen Gruppen, wann das Büro besetzt ist und wen man fragt. Große Schrift, kein Lauftext.'),
  tags: [...SENIORS, L('community centre', 'Nachbarschaftstreff'), L('groups', 'Gruppen'), L('events', 'Veranstaltungen')],
  defaults: { theme: 'clarity-light', transition: 'fade', duration: 22 },
  build: () => [
    S({
      name: L('This week', 'Diese Woche'),
      theme: 'clarity-light',
      duration: 24,
      widgets: [
        W('calendar', [4, 5, 92, 90], {
          heading: L('This week at the centre', 'Diese Woche bei uns'),
          view: 'week', maxItems: 10, hidePast: false, daysAhead: 7,
          weekDays: 5, perDayCap: 2,
          emptyText: L('Nothing on', 'Nichts geplant'),
          roomName: '', showClock: false, icsUrl: '', refreshSec: 0, locale: '',
          theme: 'clarity-light', textScale: 230,
          events: [
            { start: onWeekday(0, '10:00'), summary: L('Coffee morning', 'Frühstückstreff'), location: L('Large room', 'Großer Saal') },
            { start: onWeekday(1, '15:00'), summary: L('Chair exercise', 'Sitzgymnastik'), location: L('Large room', 'Großer Saal') },
            { start: onWeekday(2, '14:00'), summary: L('Digital help desk', 'Digital-Sprechstunde'), location: L('Room 1', 'Raum 1') },
            { start: onWeekday(3, '15:00'), summary: L('Singing group', 'Singkreis'), location: L('Large room', 'Großer Saal') },
            { start: onWeekday(4, '10:00'), summary: L('Walking group', 'Spaziergruppe'), location: L('Meet at the door', 'Treffpunkt Eingang') },
          ],
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('Regular groups', 'Feste Gruppen'),
      theme: 'clarity-light',
      duration: 24,
      widgets: [
        W('text', [5, 5, 90, 16], headline(
          L('Regular groups', 'Feste Gruppen'),
          { theme: 'clarity-light', textScale: 185 })),
        // Three columns and four rows. The rest of the catalog would put six
        // rows here and it would be the wrong board.
        W('data-table', [4, 24, 92, 72], {
          source: 'inline',
          headers: L('Group, When, Where', 'Gruppe, Wann, Wo'),
          align: 'lll',
          rows: [
            { c1: L('Chair exercise', 'Sitzgymnastik'), c2: L('Tue 15:00', 'Di 15:00'), c3: L('Large room', 'Großer Saal') },
            { c1: L('Singing group', 'Singkreis'), c2: L('Thu 15:00', 'Do 15:00'), c3: L('Large room', 'Großer Saal') },
            { c1: L('Card afternoon', 'Spielenachmittag'), c2: L('Fri 14:00', 'Fr 14:00'), c3: L('Room 1', 'Raum 1') },
            { c1: L('Digital help desk', 'Digital-Sprechstunde'), c2: L('Wed 14:00', 'Mi 14:00'), c3: L('Room 1', 'Raum 1') },
          ],
          dataUrl: '', refreshSec: 0, striped: true, autoAlignNumbers: false,
          density: 'comfortable', headerStyle: 'accent', textScale: 315,
          pageRows: 0, pageSec: 8, highlightRules: [],
          theme: 'clarity-light',
        }, { anim: 'fade-up', delay: 150, duration: 600 }),
      ],
    }),
    S({
      name: L('Office hours', 'Bürozeiten'),
      theme: 'clarity-light',
      duration: 22,
      widgets: [
        W('opening-hours', [4, 5, 56, 90], {
          heading: L('The office is staffed', 'Das Büro ist besetzt'),
          days: [
            { day: 'mon', from: '09:00', to: '12:00', from2: '', to2: '', closed: false },
            { day: 'tue', from: '09:00', to: '12:00', from2: '14:00', to2: '17:00', closed: false },
            { day: 'wed', from: '09:00', to: '12:00', from2: '', to2: '', closed: false },
            { day: 'thu', from: '09:00', to: '12:00', from2: '14:00', to2: '17:00', closed: false },
            { day: 'fri', from: '09:00', to: '12:00', from2: '', to2: '', closed: false },
            { day: 'sat', from: '', to: '', from2: '', to2: '', closed: true },
            { day: 'sun', from: '', to: '', from2: '', to2: '', closed: true },
          ],
          timezone: 'Europe/Berlin', locale: '', hour12: false, dayStyle: 'long',
          layout: 'list', showStatus: true, highlightToday: true,
          closedText: L('Closed', 'Geschlossen'),
          openLabel: L('Someone is here now', 'Jemand ist da'),
          closedLabel: L('Nobody in the office', 'Büro nicht besetzt'),
          note: L('Outside these hours the room is still open for the groups',
            'Außerhalb dieser Zeiten ist der Raum für die Gruppen trotzdem offen'),
          textScale: 145, theme: 'clarity-light',
        }, { anim: 'fade-right', duration: 600 }),
        W('text', [63, 5, 33, 90], paragraph(L(
          '<h2>Who to ask</h2><p><strong>030 1234 570</strong></p><p>Ms Ritter, centre manager</p><p>Or simply knock — Room 1.</p>',
          '<h2>Ansprechpartnerin</h2><p><strong>030 1234 570</strong></p><p>Frau Ritter, Leitung</p><p>Oder einfach klopfen — Raum 1.</p>'),
        { theme: 'clarity-light', valign: 'middle', textScale: 235 }), { anim: 'fade-left', delay: 150, duration: 600 }),
      ],
    }),
    S({
      name: L('Coming up', 'Demnächst'),
      theme: 'clarity-light',
      duration: 22,
      widgets: [
        W('text', [5, 6, 90, 18], headline(
          L('Coming up', 'Demnächst'),
          { theme: 'clarity-light', textScale: 235 })),
        W('text', [5, 28, 90, 64], paragraph(L(
          '<p><strong>Summer party</strong> — in three weeks, in the courtyard. Cake donations welcome.</p><p><strong>Outing</strong> — coach to the lake, sign up in the office.</p><p><strong>New</strong> — repair café, first Saturday of the month.</p>',
          '<p><strong>Sommerfest</strong> — in drei Wochen, im Innenhof. Kuchenspenden willkommen.</p><p><strong>Ausflug</strong> — Bus an den See, Anmeldung im Büro.</p><p><strong>Neu</strong> — Reparaturcafé, jeden ersten Samstag.</p>'),
        { theme: 'clarity-light', valign: 'top', textScale: 220 }), { anim: 'fade-up', delay: 150, duration: 600 }),
      ],
    }),
  ],
});

export {};
