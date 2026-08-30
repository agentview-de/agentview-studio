// Food & drink, and retail — the two counters where a screen has to sell
// something in the seconds someone spends standing in front of it.

import { registerTemplate } from './registry.js';
import { L, S, W, headline, paragraph, backdrop, tickerBar, PLACES, at } from './lib.js';

registerTemplate({
  id: 'gastro-daily-menu',
  category: 'gastro',
  accent: '#f59e0b',
  name: L('Bistro — daily menu', 'Bistro — Tageskarte'),
  description: L(
    'The classic lunch loop: today’s dishes with allergen tags and prices, a chalkboard special, drinks, and the week’s opening hours with a live open/closed badge.',
    'Die klassische Mittagsschleife: Tagesgerichte mit Kennzeichnungen und Preisen, ein Tagesangebot, Getränke und die Woche mit Live-Anzeige „geöffnet/geschlossen“.'),
  tags: [L('menu', 'Speisekarte'), L('lunch', 'Mittagstisch'), L('prices', 'Preise'), L('allergens', 'Allergene')],
  defaults: { theme: 'bistro-warm', transition: 'fade', duration: 14 },
  build: () => [
    S({
      name: L('Today’s menu', 'Tageskarte'),
      theme: 'bistro-warm',
      duration: 18,
      widgets: [
        W('text', [5, 5, 90, 20], headline(
          L('Today’s menu', 'Tageskarte'), { theme: 'bistro-warm', font: 'serif', textScale: 295 })),
        W('menu', [5, 27, 90, 68], {
          rows: [
            { section: L('Starters', 'Vorspeisen'), name: L('Pumpkin soup', 'Kürbissuppe'), price: 5.50, desc: L('Roasted seeds, crème fraîche', 'Geröstete Kerne, Crème fraîche'), tags: 'vegetarian', image: '' },
            { section: L('Starters', 'Vorspeisen'), name: L('Bruschetta', 'Bruschetta'), price: 6.50, desc: L('Tomato · basil · garlic', 'Tomate · Basilikum · Knoblauch'), tags: 'vegan', image: '' },
            { section: L('Mains', 'Hauptgerichte'), name: L('Pasta al pomodoro', 'Pasta al Pomodoro'), price: 12.00, desc: L('San Marzano tomato sauce', 'San-Marzano-Tomatensauce'), tags: 'vegetarian', featured: 1, image: '' },
            { section: L('Mains', 'Hauptgerichte'), name: L('Schnitzel with fries', 'Schnitzel mit Pommes'), price: 14.90, desc: L('Lemon, parsley potatoes optional', 'Zitrone, wahlweise Petersilienkartoffeln'), tags: '', image: '' },
            { section: L('Mains', 'Hauptgerichte'), name: L('Mushroom risotto', 'Pilzrisotto'), price: 13.50, desc: L('Wild mushrooms, parmesan', 'Waldpilze, Parmesan'), tags: 'vegetarian, gluten-free', image: '' },
            { section: L('Desserts', 'Nachspeisen'), name: L('Tiramisu', 'Tiramisu'), price: 5.90, desc: L('Homemade', 'Hausgemacht'), tags: '', image: '' },
          ],
          currency: 'EUR', currencyPosition: 'after', hideZeroDecimals: false,
          showPrices: true, showImages: false, columns: '2', sectionFilter: '',
          footnote: L('Allergen information on request · all prices include VAT',
            'Allergenhinweise auf Anfrage · alle Preise inkl. MwSt.'),
          textScale: 155, locale: '', theme: 'bistro-warm',
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('Special of the day', 'Tagesangebot'),
      theme: 'bistro-warm',
      transition: 'zoom',
      duration: 10,
      widgets: [
        W('image', [0, 0, 100, 100], backdrop('', 60), { z: 0, loop: 'kenburns' }),
        W('text', [8, 22, 84, 34], headline(
          L('Special of the day', 'Tagesangebot'),
          { theme: 'bistro-warm', font: 'serif', textScale: 395 }), { z: 1, anim: 'fade-up', duration: 600 }),
        W('text', [8, 54, 84, 26], paragraph(
          L('<p><strong>Beef stew with dumplings</strong><br>with a small salad — <strong>11,90 €</strong></p>',
            '<p><strong>Rindsgulasch mit Semmelknödel</strong><br>inkl. kleinem Salat — <strong>11,90 €</strong></p>'),
          { theme: 'bistro-warm', font: 'sans', textScale: 205 }), { z: 2, anim: 'fade-up', delay: 250, duration: 600 }),
      ],
    }),
    S({
      name: L('Drinks', 'Getränke'),
      theme: 'bistro-warm',
      duration: 14,
      widgets: [
        W('menu', [5, 6, 90, 82], {
          rows: [
            { section: L('Coffee', 'Kaffee'), name: 'Espresso', price: 2.40, desc: '', tags: '', image: '' },
            { section: L('Coffee', 'Kaffee'), name: 'Cappuccino', price: 3.40, desc: L('Oat milk +0,40 €', 'Hafermilch +0,40 €'), tags: '', image: '' },
            { section: L('Coffee', 'Kaffee'), name: L('Filter coffee', 'Filterkaffee'), price: 2.80, desc: '', tags: '', image: '' },
            { section: L('Cold drinks', 'Kaltgetränke'), name: L('Sparkling water 0.3 l', 'Mineralwasser 0,3 l'), price: 2.90, desc: '', tags: '', image: '' },
            { section: L('Cold drinks', 'Kaltgetränke'), name: L('Apple spritzer 0.4 l', 'Apfelschorle 0,4 l'), price: 3.60, desc: '', tags: '', image: '' },
            { section: L('Beer & wine', 'Bier & Wein'), name: L('Wheat beer 0.5 l', 'Weißbier 0,5 l'), price: 4.60, desc: '', tags: '', image: '' },
            { section: L('Beer & wine', 'Bier & Wein'), name: L('House wine 0.2 l', 'Hauswein 0,2 l'), price: 5.20, desc: L('White or red', 'Weiß oder rot'), tags: '', image: '' },
          ],
          currency: 'EUR', currencyPosition: 'after', hideZeroDecimals: false,
          showPrices: true, showImages: false, columns: '2', sectionFilter: '',
          footnote: '', textScale: 175, locale: '', theme: 'bistro-warm',
        }),
      ],
    }),
    S({
      name: L('Opening hours', 'Öffnungszeiten'),
      theme: 'bistro-warm',
      duration: 12,
      widgets: [
        W('opening-hours', [6, 8, 88, 74], {
          heading: L('We are here for you', 'Wir sind für Sie da'),
          days: [
            { day: 'mon', from: '', to: '', from2: '', to2: '', closed: true },
            { day: 'tue', from: '11:30', to: '14:30', from2: '17:30', to2: '22:00', closed: false },
            { day: 'wed', from: '11:30', to: '14:30', from2: '17:30', to2: '22:00', closed: false },
            { day: 'thu', from: '11:30', to: '14:30', from2: '17:30', to2: '22:00', closed: false },
            { day: 'fri', from: '11:30', to: '14:30', from2: '17:30', to2: '23:00', closed: false },
            { day: 'sat', from: '17:00', to: '23:00', from2: '', to2: '', closed: false },
            { day: 'sun', from: '11:30', to: '15:00', from2: '', to2: '', closed: false },
          ],
          timezone: 'Europe/Berlin', locale: '', hour12: false,
          dayStyle: 'short', layout: 'list', showStatus: true, highlightToday: true,
          closedText: L('Rest day', 'Ruhetag'),
          openLabel: L('Open now', 'Jetzt geöffnet'),
          closedLabel: L('Closed', 'Geschlossen'),
          note: L('Kitchen closes 30 minutes before we do', 'Küche schließt 30 Minuten vor Betriebsschluss'),
          textScale: 95, theme: 'bistro-warm',
        }, { anim: 'fade-up', duration: 600 }),
        tickerBar([
          L('Table reservations: 089 123456', 'Tischreservierung: 089 123456'),
          L('We also cater for private events', 'Wir richten auch Ihre Feier aus'),
          L('Takeaway available all day', 'Zum Mitnehmen den ganzen Tag'),
        ], { theme: 'bistro-warm', speed: 60 }),
      ],
    }),
  ],
});

registerTemplate({
  id: 'gastro-cafe-counter',
  category: 'gastro',
  accent: '#fdba74',
  name: L('Café & bakery counter', 'Café- & Bäckertheke'),
  description: L(
    'For a counter with a ticket machine: a live “now serving” board, today’s baked goods, and a friendly greeting that changes with the time of day.',
    'Für die Theke mit Nummernautomat: Live-Aufruftafel, das heutige Backwarenangebot und eine Begrüßung, die sich mit der Tageszeit ändert.'),
  tags: [L('queue', 'Aufruf'), L('bakery', 'Bäckerei'), L('counter', 'Theke'), L('coffee', 'Kaffee')],
  defaults: { theme: 'bistro-warm', transition: 'fade', duration: 12 },
  build: () => [
    S({
      name: L('Now serving', 'Aufruf'),
      theme: 'bistro-warm',
      duration: 20,
      widgets: [
        W('queue-call', [3, 4, 94, 84], {
          heading: L('Now serving', 'Es bedient sich Nummer'),
          current: '42', counter: L('Counter 2', 'Theke 2'),
          upcomingHeading: L('Next up', 'Als Nächstes'),
          upcoming: [
            { number: '43', counter: L('Counter 1', 'Theke 1'), note: '' },
            { number: '44', counter: L('Counter 3', 'Theke 3'), note: '' },
            { number: '45', counter: '', note: '' },
          ],
          maxUpcoming: 3, layout: 'split',
          source: 'inline', dataUrl: '', refreshSec: 15,
          flashOnChange: true, waitLabel: '', waitMinutes: 0,
          footnote: L('Please take a ticket at the entrance', 'Bitte am Eingang eine Nummer ziehen'),
          textScale: 100, theme: 'bistro-warm',
        }, { anim: 'fade', duration: 400 }),
      ],
    }),
    S({
      name: L('Fresh today', 'Heute frisch'),
      theme: 'bistro-warm',
      duration: 16,
      widgets: [
        W('text', [5, 5, 90, 20], headline(
          L('Fresh from the oven', 'Frisch aus dem Ofen'),
          { theme: 'bistro-warm', font: 'serif', textScale: 295 })),
        W('menu', [5, 27, 90, 68], {
          rows: [
            { section: L('Bread', 'Brot'), name: L('Farmhouse loaf 1 kg', 'Bauernbrot 1 kg'), price: 4.80, desc: L('Sourdough, baked at 04:00', 'Sauerteig, gebacken um 4 Uhr'), tags: 'vegan', image: '' },
            { section: L('Bread', 'Brot'), name: L('Spelt bread 750 g', 'Dinkelbrot 750 g'), price: 4.20, desc: '', tags: 'vegan', image: '' },
            { section: L('Rolls', 'Brötchen'), name: L('Kaiser roll', 'Semmel'), price: 0.55, desc: '', tags: '', image: '' },
            { section: L('Rolls', 'Brötchen'), name: L('Pretzel', 'Brezn'), price: 1.20, desc: '', tags: '', image: '' },
            { section: L('Pastry', 'Feingebäck'), name: L('Butter croissant', 'Butter-Croissant'), price: 1.90, desc: '', tags: 'vegetarian', featured: 1, image: '' },
            { section: L('Pastry', 'Feingebäck'), name: L('Apple turnover', 'Apfeltasche'), price: 2.40, desc: '', tags: 'vegetarian', image: '' },
            { section: L('Pastry', 'Feingebäck'), name: L('Poppy seed roll', 'Mohnschnecke'), price: 2.20, desc: L('Sold out today', 'Heute ausverkauft'), tags: '', sold: 1, image: '' },
          ],
          currency: 'EUR', currencyPosition: 'after', hideZeroDecimals: false,
          showPrices: true, showImages: false, columns: '2', sectionFilter: '',
          footnote: L('Allergen list at the counter', 'Allergenliste an der Theke'),
          textScale: 155, locale: '', theme: 'bistro-warm',
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('Welcome', 'Willkommen'),
      theme: 'bistro-warm',
      duration: 10,
      widgets: [
        W('greeting', [6, 16, 88, 58], {
          venue: L('our bakery', 'unserer Bäckerei'),
          welcomeTo: L('welcome to', 'willkommen in'),
          subtitle: L('Coffee to go — bring your own cup and save 30 cents',
            'Kaffee to go — mit eigenem Becher 30 Cent günstiger'),
          timezone: 'Europe/Berlin', showDate: true, showTime: false,
          locale: '', textScale: 215, theme: 'bistro-warm',
        }, { anim: 'fade-up', duration: 700 }),
        tickerBar([
          L('Loyalty card: every 10th coffee is free', 'Treuekarte: jeder 10. Kaffee gratis'),
          L('Pre-order party trays 48 h in advance', 'Partyplatten 48 Std. im Voraus vorbestellen'),
        ], { theme: 'bistro-warm', speed: 55 }),
      ],
    }),
  ],
});

registerTemplate({
  id: 'gastro-bar-happy-hour',
  category: 'gastro',
  accent: '#f0abfc',
  name: L('Bar — happy hour', 'Bar — Happy Hour'),
  description: L(
    'An evening loop with punch: a countdown to happy hour, the cocktail list, an events calendar and a music-reactive visualiser for the wall behind the bar.',
    'Eine Abendschleife mit Wumms: Countdown zur Happy Hour, Cocktailkarte, Event-Kalender und ein musikreaktiver Visualizer für die Wand hinter der Bar.'),
  tags: [L('bar', 'Bar'), L('cocktails', 'Cocktails'), 'Happy Hour', L('events', 'Events')],
  defaults: { theme: 'neon-cyber', transition: 'zoom-blur', duration: 12 },
  build: () => [
    S({
      name: L('Happy hour', 'Happy Hour'),
      theme: 'neon-cyber',
      duration: 12,
      widgets: [
        W('text', [6, 8, 88, 22], headline(
          L('Happy hour', 'Happy Hour'), { theme: 'neon-cyber', textScale: 355 }),
        { anim: 'blur', duration: 700 }),
        W('countdown', [10, 32, 80, 44], {
          target: { at: Date.now() + 3 * 3600e3, tz: 'Europe/Berlin' },
          heading: L('All cocktails −30 % in', 'Alle Cocktails −30 % in'),
          theme: 'neon-cyber',
          expiredText: L('Now on!', 'Jetzt!'),
          units: 'hms', unitStyle: 'short', locale: '', showTarget: false,
          textScale: 260, urgentBelow: 1, urgentColor: '#f0abfc', finishedMode: 'countup',
        }, { anim: 'scale', delay: 200, duration: 700 }),
        tickerBar([
          L('Happy hour daily 18:00 – 20:00', 'Happy Hour täglich 18:00 – 20:00 Uhr'),
          L('Ask the bar about the secret menu', 'Fragen Sie an der Bar nach der geheimen Karte'),
        ], { theme: 'neon-cyber', speed: 90, uppercase: true }),
      ],
    }),
    S({
      name: L('Cocktails', 'Cocktails'),
      theme: 'neon-cyber',
      duration: 18,
      widgets: [
        W('menu', [4, 5, 92, 84], {
          rows: [
            { section: L('Signature', 'Signature'), name: 'Midnight Spritz', price: 11.50, desc: L('Elderflower, prosecco, mint', 'Holunder, Prosecco, Minze'), tags: '', featured: 1, image: '' },
            { section: L('Signature', 'Signature'), name: 'Smoked Old Fashioned', price: 13.00, desc: L('Bourbon, cherrywood smoke', 'Bourbon, Kirschholzrauch'), tags: '', image: '' },
            { section: L('Classics', 'Klassiker'), name: 'Negroni', price: 10.00, desc: '', tags: '', image: '' },
            { section: L('Classics', 'Klassiker'), name: 'Margarita', price: 10.50, desc: '', tags: '', image: '' },
            { section: L('Classics', 'Klassiker'), name: 'Moscow Mule', price: 10.00, desc: '', tags: '', image: '' },
            { section: L('Zero proof', 'Alkoholfrei'), name: 'Virgin Colada', price: 7.50, desc: '', tags: 'vegan', image: '' },
            { section: L('Zero proof', 'Alkoholfrei'), name: 'Ginger Sunrise', price: 7.00, desc: '', tags: 'vegan', image: '' },
          ],
          currency: 'EUR', currencyPosition: 'after', hideZeroDecimals: false,
          showPrices: true, showImages: false, columns: '2', sectionFilter: '',
          footnote: L('−30 % during happy hour', '−30 % während der Happy Hour'),
          textScale: 180, locale: '', theme: 'neon-cyber',
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('What’s on', 'Programm'),
      theme: 'neon-cyber',
      duration: 14,
      widgets: [
        W('calendar', [5, 6, 90, 82], {
          heading: L('What’s on', 'Was läuft'),
          view: 'agenda', maxItems: 5, hidePast: true, daysAhead: 14,
          weekDays: 'full', perDayCap: 0, emptyText: '', roomName: '', showClock: false,
          icsUrl: '', refreshSec: 900, locale: '', theme: 'neon-cyber', textScale: 240,
          events: [
            { start: at(1, '21:00'), summary: L('Live jazz trio', 'Live-Jazz-Trio'), location: L('Main floor', 'Hauptraum') },
            { start: at(3, '20:00'), summary: L('Pub quiz', 'Kneipenquiz'), location: L('Back room', 'Nebenraum') },
            { start: at(5, '22:00'), summary: L('DJ set — house classics', 'DJ-Set — House-Klassiker'), location: L('Main floor', 'Hauptraum') },
            { start: at(9, '19:30'), summary: L('Tasting: small-batch gin', 'Tasting: Gin aus Kleinbrennereien'), location: L('Bar', 'Bar') },
          ],
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('Sound wall', 'Klangwand'),
      theme: 'neon-cyber',
      duration: 20,
      widgets: [
        W('audio-viz', [0, 0, 100, 100], {
          url: '', nowPlaying: L('Now playing at the bar', 'Läuft gerade an der Bar'),
          style: 'bars', barCount: 72, mirror: true, sensitivity: 110,
          colorA: '#f0abfc', colorB: '#06b6d4', volume: 100,
          theme: 'neon-cyber', textColor: '', accentColor: '',
        }),
      ],
    }),
  ],
});

registerTemplate({
  id: 'retail-promo-wall',
  category: 'retail',
  accent: '#ef4444',
  name: L('Retail — promotions', 'Einzelhandel — Aktionen'),
  description: L(
    'A shop-window loop: a full-bleed offer, a price wall, a countdown to the end of the sale and a QR code straight to the online shop.',
    'Eine Schaufenster-Schleife: randloses Angebot, Preistafel, Countdown bis zum Aktionsende und ein QR-Code direkt in den Onlineshop.'),
  tags: [L('offers', 'Angebote'), L('sale', 'Sale'), L('shop window', 'Schaufenster'), 'QR'],
  defaults: { theme: 'editorial-mono', transition: 'push', duration: 10 },
  build: () => [
    S({
      name: L('Headline offer', 'Top-Angebot'),
      theme: 'editorial-mono',
      transition: 'zoom',
      widgets: [
        W('image', [0, 0, 100, 100], backdrop('', 45), { z: 0, loop: 'kenburns' }),
        W('text', [6, 20, 60, 26], headline(
          L('Autumn sale', 'Herbst-Sale'), { theme: 'editorial-mono', textScale: 395 }),
        { z: 1, anim: 'fade-right', duration: 600 }),
        W('text', [6, 50, 60, 22], paragraph(
          L('<p>Up to <strong>40 % off</strong> selected jackets and knitwear.</p>',
            '<p>Bis zu <strong>40 % Rabatt</strong> auf ausgewählte Jacken und Strick.</p>'),
          { theme: 'editorial-mono', textScale: 220 }), { z: 2, anim: 'fade-right', delay: 250, duration: 600 }),
        W('icon', [72, 26, 22, 34], {
          symbol: 'star', color: '#ef4444', label: '−40 %',
          scale: 100, labelScale: 130, labelPos: 'below',
          flipH: false, flipV: false, badge: 'circle', badgeColor: '', pulse: true,
        }, { z: 3, anim: 'scale', delay: 400, duration: 600, loop: 'pulse' }),
      ],
    }),
    S({
      name: L('Price wall', 'Preistafel'),
      theme: 'editorial-mono',
      duration: 16,
      widgets: [
        W('menu', [4, 6, 92, 82], {
          rows: [
            { section: L('Outerwear', 'Jacken'), name: L('Quilted jacket', 'Steppjacke'), price: 79.00, desc: L('was 129,00 €', 'statt 129,00 €'), tags: '', featured: 1, image: '' },
            { section: L('Outerwear', 'Jacken'), name: L('Rain parka', 'Regenparka'), price: 99.00, desc: L('was 149,00 €', 'statt 149,00 €'), tags: '', image: '' },
            { section: L('Knitwear', 'Strick'), name: L('Merino jumper', 'Merinopullover'), price: 59.00, desc: L('was 89,00 €', 'statt 89,00 €'), tags: '', image: '' },
            { section: L('Knitwear', 'Strick'), name: L('Cardigan', 'Strickjacke'), price: 49.00, desc: L('was 79,00 €', 'statt 79,00 €'), tags: '', image: '' },
            { section: L('Accessories', 'Accessoires'), name: L('Wool scarf', 'Wollschal'), price: 19.00, desc: L('was 29,00 €', 'statt 29,00 €'), tags: '', image: '' },
            { section: L('Accessories', 'Accessoires'), name: L('Leather belt', 'Ledergürtel'), price: 24.00, desc: '', tags: '', image: '' },
          ],
          currency: 'EUR', currencyPosition: 'after', hideZeroDecimals: false,
          showPrices: true, showImages: false, columns: '2', sectionFilter: '',
          footnote: L('While stocks last · no combination with other discounts',
            'Solange der Vorrat reicht · nicht mit anderen Rabatten kombinierbar'),
          textScale: 165, locale: '', theme: 'editorial-mono',
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('Ends soon', 'Endet bald'),
      theme: 'minimal-dark',
      duration: 10,
      widgets: [
        W('countdown', [8, 16, 84, 56], {
          target: { at: Date.now() + 5 * 86400000, tz: 'Europe/Berlin' },
          heading: L('Sale ends in', 'Der Sale endet in'),
          theme: 'minimal-dark',
          expiredText: L('Sale has ended', 'Der Sale ist beendet'),
          units: 'dhm', unitStyle: 'full', locale: '', showTarget: true,
          textScale: 195, urgentBelow: 24, urgentColor: '#ef4444', finishedMode: 'text',
        }, { anim: 'rise', duration: 700 }),
        tickerBar([
          L('Click & collect: order online, pick up in store', 'Click & Collect: online bestellen, im Laden abholen'),
          L('Free alterations on all trousers', 'Kostenlose Änderungen bei allen Hosen'),
        ], { theme: 'minimal-dark', speed: 70 }),
      ],
    }),
    S({
      name: L('Online shop', 'Onlineshop'),
      theme: 'editorial-mono',
      duration: 12,
      widgets: [
        W('text', [6, 18, 46, 50], paragraph(
          L('<h2>Shop it online</h2><p>Everything you see here — and the sizes we sold out of.</p>',
            '<h2>Online weiterstöbern</h2><p>Alles aus dem Laden — und die Größen, die hier vergriffen sind.</p>'),
          { theme: 'editorial-mono', textScale: 270 }), { anim: 'fade-right', duration: 600 }),
        W('qr-code', [56, 12, 38, 70], {
          template: 'url', url: 'https://agentview.de', text: '',
          wifiSsid: '', wifiPassword: '', wifiEnc: 'WPA', wifiHidden: false,
          vcardName: '', vcardPhone: '', vcardEmail: '', vcardOrg: '', vcardUrl: '',
          label: L('Scan to shop', 'Scannen & shoppen'),
          showDetails: false, layout: 'vertical', size: 480, moduleStyle: 'dots',
          fgColor: '#000000', bgColor: '#ffffff', ecLevel: 'Q', logoUrl: '', logoSize: 22,
          frameless: false, textScale: 320, theme: 'editorial-mono', textColor: '', accentColor: '',
        }, { anim: 'scale', delay: 200, duration: 600 }),
      ],
    }),
  ],
});

registerTemplate({
  id: 'retail-store-guide',
  category: 'retail',
  accent: '#38bdf8',
  name: L('Store guide & services', 'Wegweiser & Services'),
  description: L(
    'The screen by the entrance: which floor sells what, the services desk, opening hours with a live badge, and the guest WiFi as a scannable code.',
    'Der Bildschirm am Eingang: welche Etage was führt, der Servicepoint, Öffnungszeiten mit Live-Anzeige und das Gäste-WLAN als scanbarer Code.'),
  tags: [L('wayfinding', 'Wegweiser'), L('services', 'Service'), 'WiFi', L('opening hours', 'Öffnungszeiten')],
  defaults: { theme: 'minimal-dark', transition: 'slide', duration: 13 },
  build: () => [
    S({
      name: L('Floor guide', 'Etagenplan'),
      theme: 'minimal-dark',
      duration: 16,
      widgets: [
        W('text', [5, 5, 90, 20], headline(
          L('Floor guide', 'Etagenplan'), { theme: 'minimal-dark', textScale: 295 })),
        W('data-table', [5, 27, 90, 68], {
          source: 'inline',
          headers: L('Floor, Departments, Services', 'Etage, Abteilungen, Service'),
          align: 'lll',
          rows: [
            { c1: L('Ground', 'EG'), c2: L('Cosmetics · Accessories · Bags', 'Kosmetik · Accessoires · Taschen'), c3: L('Information, gift wrapping', 'Information, Geschenkservice') },
            { c1: '1', c2: L('Womenswear', 'Damenmode'), c3: L('Fitting rooms, alterations', 'Umkleiden, Änderungsservice') },
            { c1: '2', c2: L('Menswear', 'Herrenmode'), c3: L('Fitting rooms', 'Umkleiden') },
            { c1: '3', c2: L('Home · Kitchen', 'Wohnen · Küche'), c3: L('Delivery service', 'Lieferservice') },
            { c1: '4', c2: L('Café & terrace', 'Café & Terrasse'), c3: L('Toilets, baby change', 'WC, Wickelraum') },
          ],
          dataUrl: '', refreshSec: 0, striped: true, autoAlignNumbers: false,
          density: 'comfortable', headerStyle: 'accent', textScale: 335,
          pageRows: 0, pageSec: 8, highlightRules: [], theme: 'minimal-dark',
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('Services', 'Services'),
      theme: 'corporate-blue',
      duration: 14,
      widgets: [
        W('steps', [4, 8, 92, 78], {
          heading: L('Click & collect in three steps', 'Click & Collect in drei Schritten'),
          steps: [
            { title: L('Order online', 'Online bestellen'), desc: L('Choose “collect in store” at checkout.', 'An der Kasse „im Laden abholen“ wählen.'), icon: 'cart' },
            { title: L('Wait for the email', 'E-Mail abwarten'), desc: L('Usually ready within two hours.', 'Meist innerhalb von zwei Stunden bereit.'), icon: 'bell' },
            { title: L('Pick it up', 'Abholen'), desc: L('Service point, ground floor, by the lifts.', 'Servicepoint im EG, neben den Aufzügen.'), icon: 'map-pin' },
          ],
          layout: 'horizontal', numberStyle: 'icon', showConnector: true, showDesc: true,
          spotlight: 0, autoAdvanceSec: 0, textScale: 110, theme: 'corporate-blue',
        }, { anim: 'fade-up', duration: 600 }),
      ],
    }),
    S({
      name: L('Opening hours', 'Öffnungszeiten'),
      theme: 'minimal-dark',
      duration: 12,
      widgets: [
        W('opening-hours', [5, 10, 90, 62], {
          heading: L('Opening hours', 'Öffnungszeiten'),
          days: [
            { day: 'mon', from: '09:30', to: '20:00', from2: '', to2: '', closed: false },
            { day: 'tue', from: '09:30', to: '20:00', from2: '', to2: '', closed: false },
            { day: 'wed', from: '09:30', to: '20:00', from2: '', to2: '', closed: false },
            { day: 'thu', from: '09:30', to: '20:00', from2: '', to2: '', closed: false },
            { day: 'fri', from: '09:30', to: '20:00', from2: '', to2: '', closed: false },
            { day: 'sat', from: '09:00', to: '18:00', from2: '', to2: '', closed: false },
            { day: 'sun', from: '', to: '', from2: '', to2: '', closed: true },
          ],
          timezone: 'Europe/Berlin', locale: '', hour12: false,
          dayStyle: 'short', layout: 'grid', showStatus: true, highlightToday: true,
          closedText: L('Closed', 'Geschlossen'),
          openLabel: L('Open now', 'Jetzt geöffnet'),
          closedLabel: L('Closed', 'Geschlossen'),
          note: '', textScale: 140, theme: 'minimal-dark',
        }, { anim: 'fade-up', duration: 600 }),
        tickerBar([
          L('Late-night shopping every first Thursday until 22:00',
            'Late-Night-Shopping jeden ersten Donnerstag bis 22:00 Uhr'),
        ], { theme: 'minimal-dark' }),
      ],
    }),
    S({
      name: L('Guest WiFi', 'Gäste-WLAN'),
      theme: 'gradient-blue',
      duration: 12,
      widgets: [
        W('qr-code', [8, 10, 40, 76], {
          template: 'wifi', url: '', text: '',
          wifiSsid: 'Store-Guest', wifiPassword: 'welcome2024', wifiEnc: 'WPA', wifiHidden: false,
          vcardName: '', vcardPhone: '', vcardEmail: '', vcardOrg: '', vcardUrl: '',
          label: L('Free WiFi — scan to connect', 'Gratis-WLAN — scannen zum Verbinden'),
          showDetails: true, layout: 'vertical', size: 480, moduleStyle: 'square',
          fgColor: '#000000', bgColor: '#ffffff', ecLevel: 'M', logoUrl: '', logoSize: 22,
          frameless: false, textScale: 305, theme: 'gradient-blue', textColor: '', accentColor: '',
        }, { anim: 'scale', duration: 600 }),
        W('weather', [52, 14, 42, 68], {
          dataMode: 'live', location: PLACES.hamburg, unit: 'C', windUnit: 'kmh', apiKey: '',
          refreshSec: 900, locale: '', timeFormat: 'auto',
          showCity: true, showTemp: true, showIcon: true, showDescription: false,
          showHiLo: true, showStats: false, showWindVector: false, showPrecip: true,
          showSunrise: false, showForecast: true, forecastDays: 3, showHourly: false, hourlyHours: 12,
          showAlerts: false, showUv: false, colorTemperature: true,
          design: 'minimal', theme: 'gradient-blue', textScale: 100, iconSet: 'auto',
          textColor: '', accentColor: '',
        }, { anim: 'fade-left', delay: 200, duration: 600 }),
      ],
    }),
  ],
});
