// Places where people wait to be served: practices, pharmacies, citizen
// offices and workshops. All four run the same shape — a call board, a
// procedure explained in steps, hours, and something worth reading while
// waiting — so they share one file and one set of conventions.

import { registerTemplate } from './registry.js';
import { L, S, W, headline, paragraph, tickerBar, FEEDS, daysAgo } from './lib.js';

registerTemplate({
  id: 'health-waiting-room',
  category: 'health',
  accent: '#5eead4',
  name: L('Practice — waiting room', 'Praxis — Wartezimmer'),
  description: L(
    'A calm waiting-room loop: the call board with a wait-time estimate, how an appointment runs, the practice team, opening hours and a health tip.',
    'Eine ruhige Wartezimmer-Schleife: Aufruftafel mit Wartezeit, Ablauf des Termins, das Praxisteam, Sprechzeiten und ein Gesundheitstipp.'),
  tags: [L('practice', 'Praxis'), L('waiting room', 'Wartezimmer'), L('call', 'Aufruf'), L('doctor', 'Arzt')],
  defaults: { theme: 'medical-calm', transition: 'fade', duration: 14 },
  build: () => [
    S({
      name: L('Call board', 'Aufruf'),
      theme: 'medical-calm',
      duration: 25,
      widgets: [
        W('queue-call', [3, 4, 94, 84], {
          heading: L('Please come in', 'Bitte eintreten'),
          current: 'B-014', counter: L('Room 3 · Dr. Berger', 'Raum 3 · Dr. Berger'),
          upcomingHeading: L('Next up', 'Als Nächstes'),
          upcoming: [
            { number: 'B-015', counter: L('Room 1', 'Raum 1'), note: '' },
            { number: 'B-016', counter: L('Room 3', 'Raum 3'), note: '' },
            { number: 'A-071', counter: L('Blood sampling', 'Blutentnahme'), note: '' },
          ],
          maxUpcoming: 3, layout: 'split',
          source: 'inline', dataUrl: '', refreshSec: 15,
          flashOnChange: true,
          waitLabel: L('Current wait', 'Aktuelle Wartezeit'), waitMinutes: 15,
          footnote: L('Emergencies are always seen first — thank you for your patience.',
            'Notfälle werden immer vorgezogen — vielen Dank für Ihr Verständnis.'),
          textScale: 100, theme: 'medical-calm',
        }, { anim: 'fade', duration: 400 }),
      ],
    }),
    S({
      name: L('How your visit works', 'So läuft Ihr Besuch'),
      theme: 'medical-calm',
      duration: 16,
      widgets: [
        W('steps', [4, 8, 92, 78], {
          heading: L('How your visit works', 'So läuft Ihr Besuch ab'),
          steps: [
            { title: L('Check in', 'Anmelden'), desc: L('Insurance card at reception — you get a number.', 'Versichertenkarte am Empfang — Sie erhalten eine Nummer.'), icon: 'user' },
            { title: L('Wait', 'Warten'), desc: L('Your number appears on this screen.', 'Ihre Nummer erscheint auf diesem Bildschirm.'), icon: 'clock' },
            { title: L('Consultation', 'Behandlung'), desc: L('Please go to the room shown next to your number.', 'Bitte in den Raum neben Ihrer Nummer gehen.'), icon: 'check-circle' },
            { title: L('Reception again', 'Zurück zum Empfang'), desc: L('Prescriptions, referrals and the next appointment.', 'Rezepte, Überweisungen und der nächste Termin.'), icon: 'home' },
          ],
          layout: 'horizontal', numberStyle: 'icon', showConnector: true, showDesc: true,
          spotlight: 0, autoAdvanceSec: 0, textScale: 110, theme: 'medical-calm',
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('Consultation hours', 'Sprechzeiten'),
      theme: 'medical-calm',
      duration: 14,
      widgets: [
        W('opening-hours', [5, 6, 90, 70], {
          heading: L('Consultation hours', 'Sprechzeiten'),
          days: [
            { day: 'mon', from: '08:00', to: '12:00', from2: '15:00', to2: '18:00', closed: false },
            { day: 'tue', from: '08:00', to: '12:00', from2: '15:00', to2: '18:00', closed: false },
            { day: 'wed', from: '08:00', to: '12:00', from2: '', to2: '', closed: false },
            { day: 'thu', from: '08:00', to: '12:00', from2: '15:00', to2: '19:00', closed: false },
            { day: 'fri', from: '08:00', to: '13:00', from2: '', to2: '', closed: false },
            { day: 'sat', from: '', to: '', from2: '', to2: '', closed: true },
            { day: 'sun', from: '', to: '', from2: '', to2: '', closed: true },
          ],
          timezone: 'Europe/Berlin', locale: '', hour12: false,
          dayStyle: 'long', layout: 'list', showStatus: true, highlightToday: true,
          closedText: L('Closed', 'Geschlossen'),
          openLabel: L('Surgery open', 'Sprechstunde läuft'),
          closedLabel: L('Closed', 'Geschlossen'),
          note: L('Outside these hours: on-call service 116 117',
            'Außerhalb der Sprechzeiten: ärztlicher Bereitschaftsdienst 116 117'),
          textScale: 95, theme: 'medical-calm',
        }, { anim: 'fade-up', duration: 600 }),
        tickerBar([
          L('Please bring your insurance card to every visit', 'Bitte bringen Sie zu jedem Besuch Ihre Versichertenkarte mit'),
          L('Repeat prescriptions: order online, collect next day', 'Folgerezepte: online bestellen, am nächsten Tag abholen'),
          L('Cancel appointments at least 24 h in advance', 'Termine bitte mindestens 24 Std. vorher absagen'),
        ], { theme: 'medical-calm', speed: 55 }),
      ],
    }),
    S({
      name: L('Health tip', 'Gesundheitstipp'),
      theme: 'medical-calm',
      duration: 14,
      widgets: [
        W('markdown', [6, 8, 88, 80], {
          body: L(
            '## Vaccination reminder\n\n- **Flu jab** — recommended from October, ask at reception\n- **Tetanus** — booster every 10 years\n- **Travel advice** — book a separate appointment, 6 weeks before departure\n\n> Not sure what is due? We check your record during your next visit.',
            '## Impferinnerung\n\n- **Grippeimpfung** — empfohlen ab Oktober, fragen Sie am Empfang\n- **Tetanus** — Auffrischung alle 10 Jahre\n- **Reiseberatung** — eigener Termin, 6 Wochen vor Abreise\n\n> Unsicher, was ansteht? Wir prüfen Ihren Impfpass beim nächsten Besuch.'),
          sourceUrl: '', refreshSec: 0, theme: 'medical-calm', textScale: 160,
          align: 'left', valign: 'middle', columns: '1', autoScroll: false, scrollSec: 30,
        }, { anim: 'reveal', duration: 700 }),
      ],
    }),
  ],
});

registerTemplate({
  id: 'health-pharmacy',
  category: 'health',
  accent: '#22c55e',
  name: L('Pharmacy counter', 'Apotheken-Theke'),
  description: L(
    'Counter board for a pharmacy: the number being served, the emergency service rota, seasonal advice and a pollen/weather panel.',
    'Thekenanzeige für die Apotheke: aufgerufene Nummer, Notdienstplan, saisonale Hinweise und ein Wetter-Panel.'),
  tags: [L('pharmacy', 'Apotheke'), L('emergency service', 'Notdienst'), L('counter', 'Theke'), L('advice', 'Beratung')],
  defaults: { theme: 'medical-calm', transition: 'fade', duration: 13 },
  build: () => [
    S({
      name: L('Now serving', 'Aufruf'),
      theme: 'medical-calm',
      duration: 20,
      widgets: [
        W('queue-call', [3, 4, 94, 60], {
          heading: L('Now serving', 'Es bedient sich Nummer'),
          current: '27', counter: L('Counter 1', 'Kasse 1'),
          upcomingHeading: L('Next', 'Als Nächstes'),
          upcoming: [
            { number: '28', counter: L('Counter 2', 'Kasse 2'), note: '' },
            { number: '29', counter: '', note: L('Consultation room', 'Beratungsraum') },
          ],
          maxUpcoming: 2, layout: 'split',
          source: 'inline', dataUrl: '', refreshSec: 15,
          flashOnChange: true, waitLabel: '', waitMinutes: 0,
          footnote: '', textScale: 115, theme: 'medical-calm',
        }, { anim: 'fade', duration: 400 }),
        W('opening-hours', [3, 66, 94, 24], {
          heading: '',
          days: [
            { day: 'mon', from: '08:00', to: '18:30', from2: '', to2: '', closed: false },
            { day: 'tue', from: '08:00', to: '18:30', from2: '', to2: '', closed: false },
            { day: 'wed', from: '08:00', to: '18:30', from2: '', to2: '', closed: false },
            { day: 'thu', from: '08:00', to: '18:30', from2: '', to2: '', closed: false },
            { day: 'fri', from: '08:00', to: '18:30', from2: '', to2: '', closed: false },
            { day: 'sat', from: '09:00', to: '13:00', from2: '', to2: '', closed: false },
            { day: 'sun', from: '', to: '', from2: '', to2: '', closed: true },
          ],
          timezone: 'Europe/Berlin', locale: '', hour12: false,
          dayStyle: 'narrow', layout: 'grid', showStatus: false, highlightToday: true,
          closedText: '—', openLabel: '', closedLabel: '', note: '',
          textScale: 330, theme: 'medical-calm',
        }),
      ],
    }),
    S({
      name: L('Emergency service', 'Notdienst'),
      theme: 'minimal-dark',
      duration: 14,
      widgets: [
        W('text', [5, 5, 90, 20], headline(
          L('Emergency service tonight', 'Notdienst heute Nacht'),
          { theme: 'minimal-dark', textScale: 295 })),
        W('data-table', [5, 27, 90, 68], {
          source: 'inline',
          headers: L('Date, Pharmacy, Address, Phone', 'Datum, Apotheke, Adresse, Telefon'),
          align: 'llll',
          rows: [
            { c1: L('Tonight', 'Heute Nacht'), c2: L('Rose Pharmacy', 'Rosen-Apotheke'), c3: 'Hauptstr. 12', c4: '089 111 222' },
            { c1: L('Tomorrow', 'Morgen'), c2: L('Station Pharmacy', 'Bahnhof-Apotheke'), c3: 'Bahnhofplatz 3', c4: '089 333 444' },
            { c1: L('Saturday', 'Samstag'), c2: L('Park Pharmacy', 'Park-Apotheke'), c3: 'Parkweg 8', c4: '089 555 666' },
            { c1: L('Sunday', 'Sonntag'), c2: L('Market Pharmacy', 'Markt-Apotheke'), c3: 'Marktplatz 1', c4: '089 777 888' },
          ],
          dataUrl: '', refreshSec: 0, striped: true, autoAlignNumbers: false,
          density: 'comfortable', headerStyle: 'accent', textScale: 335,
          pageRows: 0, pageSec: 8,
          highlightRules: [
            { keyword: L('Tonight', 'Heute Nacht'), color: 'accent' },
          ],
          theme: 'minimal-dark',
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('Seasonal advice', 'Saisontipp'),
      theme: 'medical-calm',
      duration: 14,
      widgets: [
        W('steps', [5, 10, 90, 72], {
          heading: L('Beat the cold season', 'Gut durch die Erkältungszeit'),
          steps: [
            { title: L('Wash hands', 'Hände waschen'), desc: L('20 seconds, warm water, soap.', '20 Sekunden, warmes Wasser, Seife.'), icon: 'check' },
            { title: L('Ventilate', 'Lüften'), desc: L('Five minutes of full airing, three times a day.', 'Dreimal täglich fünf Minuten Stoßlüften.'), icon: 'wifi' },
            { title: L('Drink up', 'Viel trinken'), desc: L('Two litres a day keeps mucous membranes working.', 'Zwei Liter am Tag halten die Schleimhäute fit.'), icon: 'coffee' },
            { title: L('Ask us', 'Fragen Sie uns'), desc: L('We advise on what actually helps.', 'Wir beraten Sie, was wirklich hilft.'), icon: 'user' },
          ],
          layout: 'horizontal', numberStyle: 'icon', showConnector: false, showDesc: true,
          spotlight: 0, autoAdvanceSec: 0, textScale: 120, theme: 'medical-calm',
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
  ],
});

registerTemplate({
  id: 'public-citizen-office',
  category: 'public',
  accent: '#38bdf8',
  name: L('Citizen office', 'Bürgerbüro'),
  description: L(
    'The public-counter loop: which number is at which desk, what to bring, current wait times per service, and official notices.',
    'Die Schleife am Bürgerschalter: welche Nummer an welchem Platz, was mitzubringen ist, aktuelle Wartezeiten je Anliegen und amtliche Hinweise.'),
  tags: [L('authority', 'Behörde'), L('counter', 'Schalter'), L('queue', 'Aufruf'), L('wait time', 'Wartezeit')],
  defaults: { theme: 'corporate-blue', transition: 'fade', duration: 14 },
  build: () => [
    S({
      name: L('Counter board', 'Aufruftafel'),
      theme: 'corporate-blue',
      duration: 25,
      widgets: [
        W('queue-call', [2, 3, 96, 86], {
          heading: L('Now serving', 'Aufruf'),
          current: 'C-108', counter: L('Desk 4', 'Platz 4'),
          upcomingHeading: L('Called next', 'Als Nächstes aufgerufen'),
          upcoming: [
            { number: 'C-109', counter: L('Desk 2', 'Platz 2'), note: '' },
            { number: 'A-045', counter: L('Desk 1', 'Platz 1'), note: L('ID cards', 'Ausweise') },
            { number: 'B-023', counter: L('Desk 5', 'Platz 5'), note: L('Registration', 'Anmeldung') },
            { number: 'C-110', counter: L('Desk 3', 'Platz 3'), note: '' },
            { number: 'A-046', counter: '', note: '' },
            { number: 'B-024', counter: '', note: '' },
          ],
          maxUpcoming: 6, layout: 'board',
          source: 'inline', dataUrl: '', refreshSec: 15,
          flashOnChange: true, waitLabel: '', waitMinutes: 0,
          footnote: L('Please keep your ticket until you have been served',
            'Bitte behalten Sie Ihre Wartenummer bis zum Abschluss'),
          textScale: 145, theme: 'corporate-blue',
        }, { anim: 'fade', duration: 400 }),
      ],
    }),
    S({
      name: L('Wait times', 'Wartezeiten'),
      theme: 'corporate-blue',
      duration: 12,
      widgets: [
        W('kpi-cards', [4, 10, 92, 60], {
          cards: [
            { label: L('ID & passport', 'Ausweise & Pässe'), value: 12, target: 15, unit: 'min', deltaPct: -8, history: '22, 20, 18, 17, 15, 13, 12', goodIsDown: 1 },
            { label: L('Registration', 'An- & Ummeldung'), value: 25, target: 15, unit: 'min', deltaPct: 14, history: '14, 16, 18, 19, 22, 24, 25', goodIsDown: 1 },
            { label: L('Vehicle office', 'Kfz-Zulassung'), value: 8, target: 15, unit: 'min', deltaPct: -20, history: '18, 16, 14, 12, 10, 9, 8', goodIsDown: 1 },
            { label: L('Certificates', 'Beglaubigungen'), value: 5, target: 10, unit: 'min', deltaPct: 0, history: '6, 5, 5, 6, 5, 5, 5', goodIsDown: 1 },
          ],
          source: 'inline', dataUrl: '', refreshSec: 0,
          columns: '4', density: 'comfortable',
          showDelta: true, showSparkline: true, showTarget: true,
          numberFormat: 'full', locale: '', textScale: 210, theme: 'corporate-blue',
        }, { anim: 'fade-up', duration: 600 }),
        W('text', [4, 72, 92, 16], paragraph(
          L('<p>Wait times are estimates and update every few minutes. Booked appointments are always served first.</p>',
            '<p>Die Wartezeiten sind Schätzwerte und aktualisieren sich alle paar Minuten. Termine werden immer vorrangig bedient.</p>'),
          { theme: 'corporate-blue', textScale: 105, valign: 'top' })),
      ],
    }),
    S({
      name: L('What to bring', 'Was mitbringen'),
      theme: 'minimal-dark',
      duration: 16,
      widgets: [
        W('steps', [4, 8, 92, 78], {
          heading: L('Registering a new address', 'Wohnsitz anmelden'),
          steps: [
            { title: L('Book online', 'Termin buchen'), desc: L('Appointments cut the wait to almost nothing.', 'Mit Termin entfällt die Wartezeit fast vollständig.'), icon: 'check-circle' },
            { title: L('Bring your ID', 'Ausweis mitbringen'), desc: L('ID card or passport for every person moving.', 'Personalausweis oder Reisepass für jede anzumeldende Person.'), icon: 'user' },
            { title: L('Landlord confirmation', 'Wohnungsgeberbestätigung'), desc: L('Signed by the landlord, no older than two weeks.', 'Vom Vermieter unterschrieben, höchstens zwei Wochen alt.'), icon: 'home' },
            { title: L('Two weeks’ time', 'Zwei Wochen Zeit'), desc: L('Register within 14 days of moving in.', 'Anmeldung innerhalb von 14 Tagen nach Einzug.'), icon: 'clock' },
          ],
          layout: 'vertical', numberStyle: 'circle', showConnector: true, showDesc: true,
          spotlight: 0, autoAdvanceSec: 0, textScale: 100, theme: 'minimal-dark',
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('Notices', 'Amtliche Hinweise'),
      theme: 'minimal-dark',
      duration: 18,
      widgets: [
        W('rss', [4, 6, 92, 76], {
          dataMode: 'live', url: [FEEDS.deNews], theme: 'minimal-dark', textScale: 100,
          showDesc: true, showDate: true, dateFormat: 'date', locale: '',
          mode: 'paginate', pageSec: 8, tickerSpeed: 80, maxItems: 6, refreshSec: 600,
        }),
        tickerBar([
          L('Replace this feed with your municipality’s own news URL',
            'Diesen Feed durch die News-URL Ihrer Kommune ersetzen'),
          L('Cash desk closes 30 minutes before the counters', 'Die Kasse schließt 30 Minuten vor den Schaltern'),
        ], { theme: 'minimal-dark', speed: 55 }),
      ],
    }),
  ],
});

registerTemplate({
  id: 'auto-workshop',
  category: 'automotive',
  accent: '#fbbf24',
  name: L('Workshop reception', 'Werkstatt-Annahme'),
  description: L(
    'For the service reception: which vehicle is ready for collection, how a service appointment runs, a seasonal offer, and the safety streak on the shop floor.',
    'Für die Serviceannahme: welches Fahrzeug abholbereit ist, wie ein Servicetermin abläuft, ein Saisonangebot und die Unfallfrei-Zählung der Werkstatt.'),
  tags: [L('workshop', 'Werkstatt'), L('service', 'Service'), L('collection', 'Abholung'), L('vehicle', 'Fahrzeug')],
  defaults: { theme: 'industrial-steel', transition: 'slide', duration: 13 },
  build: () => [
    S({
      name: L('Ready for collection', 'Abholbereit'),
      theme: 'industrial-steel',
      duration: 20,
      widgets: [
        W('queue-call', [3, 4, 94, 84], {
          heading: L('Ready for collection', 'Abholbereit'),
          current: 'M-AB 1234', counter: L('Service desk 2', 'Annahme 2'),
          upcomingHeading: L('Ready shortly', 'In Kürze fertig'),
          upcoming: [
            { number: 'M-CD 5678', counter: '', note: L('~ 30 min', '~ 30 Min.') },
            { number: 'M-EF 9012', counter: '', note: L('~ 1 h', '~ 1 Std.') },
            { number: 'M-GH 3456', counter: '', note: L('waiting for parts', 'wartet auf Teile') },
          ],
          maxUpcoming: 3, layout: 'split',
          source: 'inline', dataUrl: '', refreshSec: 30,
          flashOnChange: true, waitLabel: '', waitMinutes: 0,
          footnote: L('Please bring your service order to the desk',
            'Bitte bringen Sie den Auftrag mit an die Annahme'),
          textScale: 165, theme: 'industrial-steel',
        }, { anim: 'fade', duration: 400 }),
      ],
    }),
    S({
      name: L('How a service works', 'Ablauf Servicetermin'),
      theme: 'industrial-steel',
      duration: 15,
      widgets: [
        W('steps', [4, 8, 92, 78], {
          heading: L('Your service appointment', 'Ihr Servicetermin'),
          steps: [
            { title: L('Hand over', 'Übergabe'), desc: L('Keys and vehicle registration at the desk.', 'Schlüssel und Fahrzeugschein an der Annahme.'), icon: 'user' },
            { title: L('Diagnosis', 'Diagnose'), desc: L('We call you before any extra work.', 'Wir rufen an, bevor wir Zusatzarbeiten ausführen.'), icon: 'phone' },
            { title: L('Repair', 'Reparatur'), desc: L('Original parts, documented work.', 'Originalteile, dokumentierte Arbeiten.'), icon: 'check' },
            { title: L('Collection', 'Abholung'), desc: L('Your plate appears on this screen.', 'Ihr Kennzeichen erscheint auf diesem Bildschirm.'), icon: 'check-circle' },
          ],
          layout: 'horizontal', numberStyle: 'circle', showConnector: true, showDesc: true,
          spotlight: 0, autoAdvanceSec: 0, textScale: 110, theme: 'industrial-steel',
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('Seasonal offer', 'Saisonangebot'),
      theme: 'industrial-steel',
      duration: 12,
      widgets: [
        W('text', [5, 10, 54, 40], paragraph(
          L('<h2>Winter check</h2><p>Battery, tyres, lights, antifreeze and wiper blades — <strong>29,90 €</strong> instead of 49,90 €.</p>',
            '<h2>Wintercheck</h2><p>Batterie, Reifen, Beleuchtung, Frostschutz und Wischerblätter — <strong>29,90 €</strong> statt 49,90 €.</p>'),
          { theme: 'industrial-steel', textScale: 250, valign: 'middle' }), { anim: 'fade-right', duration: 600 }),
        W('countdown', [5, 54, 54, 34], {
          target: { at: Date.now() + 14 * 86400000, tz: 'Europe/Berlin' },
          heading: L('Offer ends in', 'Aktion endet in'),
          theme: 'industrial-steel',
          expiredText: L('Offer ended', 'Aktion beendet'),
          units: 'dhm', unitStyle: 'short', locale: '', showTarget: false,
          textScale: 245, urgentBelow: 48, urgentColor: '#f59e0b', finishedMode: 'text',
        }, { anim: 'fade-right', delay: 200, duration: 600 }),
        W('qr-code', [63, 14, 32, 70], {
          template: 'url', url: 'https://agentview.de', text: '',
          wifiSsid: '', wifiPassword: '', wifiEnc: 'WPA', wifiHidden: false,
          vcardName: '', vcardPhone: '', vcardEmail: '', vcardOrg: '', vcardUrl: '',
          label: L('Book an appointment', 'Termin buchen'),
          showDetails: false, layout: 'vertical', size: 480, moduleStyle: 'rounded',
          fgColor: '#000000', bgColor: '#ffffff', ecLevel: 'M', logoUrl: '', logoSize: 22,
          frameless: false, textScale: 345, theme: 'industrial-steel', textColor: '', accentColor: '',
        }, { anim: 'scale', delay: 300, duration: 600 }),
      ],
    }),
    S({
      name: L('Safety streak', 'Unfallfrei'),
      theme: 'industrial-steel',
      duration: 10,
      widgets: [
        W('days-since', [6, 12, 88, 66], {
          since: { at: daysAgo(214), tz: 'Europe/Berlin' },
          heading: L('Days without a workshop accident', 'Tage ohne Unfall in der Werkstatt'),
          showDate: true, locale: '', unitSingular: '', unitPlural: '',
          recordDays: 365, milestoneEvery: 100, goodAbove: 90, goodColor: '',
          textScale: 90, theme: 'industrial-steel',
        }, { anim: 'rise', duration: 700 }),
        tickerBar([
          L('Safety shoes and glasses in the workshop at all times',
            'Sicherheitsschuhe und Schutzbrille in der Werkstatt immer tragen'),
          L('Customers: please stay behind the yellow line', 'Kundinnen und Kunden: bitte hinter der gelben Linie bleiben'),
        ], { theme: 'industrial-steel', speed: 60 }),
      ],
    }),
  ],
});
