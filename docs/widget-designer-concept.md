# Konzept: Widget Designer (gestuftes Gestaltungsmodell)

> Status: Konzept / noch nicht umgesetzt
> Autor: erarbeitet mit Claude, 2026-06-14
> Bezug: baut auf dem bestehenden Plugin-/Inspector-/Custom-Widget-System auf.

---

## 1. Vision in einem Satz

> **Was das Studio für Präsentationen ist, ist der Widget Designer für ein einzelnes Widget** —
> eine Bühne, auf der man das Widget live sieht und *alles* daran bequem gestalten kann.

Die Basis bleibt so einfach, dass jeder PowerPoint-Nutzer sofort zurechtkommt.
Wer mehr will, öffnet den Designer und hat die volle Kontrolle — ohne je „abzustürzen"
in eine technische Oberfläche.

### Leitprinzipien

1. **Progressive Disclosure (Stufen statt Schalter).** Niemand sieht mehr, als er gerade braucht.
   Komplexität wird *aufgedeckt*, nicht *weggeschaltet*.
2. **Eine Render-Wahrheit.** Inspector-Vorschau, Designer-Vorschau, Canvas und Player rendern
   über *denselben* Pfad (`mountWidget`). Was man gestaltet, ist 1:1 das, was später läuft.
3. **WYSIWYG, immer live.** Jede Änderung sofort sichtbar. Keine „Übernehmen"-Wartezeit beim Probieren.
4. **Direkte Manipulation.** So weit möglich klickt man das Element im Bild an, das man ändern will —
   wie in PowerPoint, nicht wie in einem Eigenschaften-Formular.
5. **Komfort bei Komplexität.** Auch aufwändige Designs entstehen durch geführte, sichere Schritte
   (Vorlagen, Vorschau über Geräteformate, sichere Eingaben) — nicht durch Trial-and-Error im Code.

---

## 2. Das Stufenmodell (Kern des Konzepts)

Drei Ebenen, fließend ineinander übergehend. Jede Ebene ist ein *Aufstieg*, kein Bruch.

| Ebene | Wo | Für wen | Was man tut |
|------|-----|---------|-------------|
| **① Inspector** | rechte Spalte, inline | jeder | Die 5–8 wichtigsten Einstellungen. PowerPoint-einfach. |
| **② Widget Designer** | Vollbild-Modal | „ich will's schöner" | *Alle* Einstellungen, große Live-Bühne, Geräte-Vorschau, Looks, direkte Manipulation. Für **jedes** Widget. |
| **③ Custom / Code** | im Designer, Tab „Eigenes" | Power-User | Rohes HTML-Template + scoped CSS + eigene Felder. Eigene Widgets von Grund auf. |

**Wichtig:** Ebene ③ ist bereits in Arbeit (`admin/panels/widget-designer.js`, `shared/plugins/custom.js`,
`shared/custom-template.js`). Dieses Konzept ordnet sie als **tiefste Stufe** ein und baut die Ebene ②
darüber — statt ein zweites, konkurrierendes Designer-Fenster zu schaffen.

### Der Übergang zwischen den Ebenen

```
Inspector  ──[ „Mehr gestalten…" Button ]──►  Widget Designer (Ebene ②)
                                                  │
                                                  ├─ Tab: Gestaltung   (volle Form, jedes Widget)
                                                  ├─ Tab: Looks        (kuratierte Vorlagen)
                                                  └─ Tab: Eigenes/Code (Ebene ③, nur custom / „eject")
```

- Im Inspector eines **normalen** Widgets (text, progress, kpi-cards …) führt „Mehr gestalten…" in den
  Designer mit den Tabs *Gestaltung* + *Looks*.
- Bei einem **custom**-Widget zeigt der Designer zusätzlich *Eigenes/Code* (das bestehende Template/CSS/Felder-UI).
- „Aus diesem Widget ein eigenes machen" (eject) erzeugt aus dem aktuellen, gerenderten Zustand ein
  custom-Widget — der Power-User startet also nicht beim leeren Blatt, sondern bei etwas Funktionierendem.

---

## 3. Wie es ins bestehende System passt

Das Konzept ist bewusst **additiv** und nutzt vorhandene Bausteine. Nahezu nichts muss neu erfunden werden.

| Brauche ich | Existiert schon | Datei |
|---|---|---|
| Formular aus Schema bauen | `buildForm()` (50+ Feldtypen, Sektionen, `showIf`, Validierung, Reset) | `admin/ui/inspector.js` |
| Widget live rendern | `mountWidget()` (ein Pfad für Canvas + Player) | `shared/widget-host.js` |
| Modal-Fenster | `openModal({ title, body, actions, onMount })` | `admin/ui/modal.js` |
| Reaktiver Zustand + Undo | `state`, `subscribe`, `commit()` | `admin/store.js` |
| Übersetzungen | `tx('…')` + `overlay.de.js` | `admin/i18n.js` |
| Theming/Farb-Overrides | `applyColorOverrides`, `themeColorSection`, `bb-theme-*` | `shared/widget-color.js` |
| Responsive Größen | Container-Queries (`cqmin`) + `--*-text-scale` | `styles/slide-themes.css` |
| Vorlagen/Designs | `designs.js` (falls vorhanden, als Basis für „Looks") | `shared/designs.js` |
| Custom-Render (sicher) | `renderCustom`, Sanitizing/Scoping | `shared/custom-template.js` |

**Neue Bausteine** (überschaubar):
1. Ein **Designer-Modal** (Vollbild-Variante von `openModal`).
2. Eine **Feld-Tier-Konvention** im Schema (`tier: 'basic' | 'advanced'`) — siehe §4.
3. Eine **Live-Vorschau-Komponente** mit Geräte-Formaten (wickelt `mountWidget`).
4. Optionale **`data-field`-Annotation** im Render für direkte Manipulation — siehe §6 (schrittweise).
5. Pro Plugin optionale **`looks`** (kuratierte Voreinstellungen) — siehe §7.

---

## 4. Schema-Erweiterung: Feld-Stufen (basic vs. advanced)

Heute zeigt der Inspector **alle** Felder eines Widgets. Das ist für Einsteiger zu viel und für Profis
in der schmalen Spalte zu eng. Lösung: jedes Feld bekommt optional eine Stufe.

```js
// im schema().fields eines Plugins
{ key: 'label', type: 'text', label: 'Label', tier: 'basic' },     // im Inspector sichtbar
{ key: 'labelScale', type: 'number', label: 'Label size', tier: 'advanced' }, // nur im Designer
```

- **Default:** Felder ohne `tier` gelten als `basic` → **voll rückwärtskompatibel**, nichts ändert sich,
  bis ein Plugin Felder bewusst als `advanced` markiert.
- **Inspector (Ebene ①):** rendert nur `tier:'basic'` (plus ein „Mehr gestalten…"-Button).
- **Designer (Ebene ②):** rendert *alle* Felder (basic + advanced), gruppiert nach den bestehenden
  Sektionen (Content → Data → Layout → Behavior → Advanced → Theme & colours).

`buildForm()` bekommt dazu eine Option `tierFilter: 'basic' | 'all'` (default `'all'`, damit bestehende
Aufrufer unverändert funktionieren). Der Inspector ruft mit `'basic'`, der Designer mit `'all'`.

**Alternative, falls weniger Schema-Pflege gewünscht:** statt pro Feld ein `tier`, definiert jedes Plugin
eine kurze Liste `basicKeys: ['label','value','target','style']`. Empfehlung: **`tier` pro Feld**, weil es
lokal beim Feld steht und mit `showIf`/`section` konsistent ist (Konvention „eine Sache, ein Ort").

### Migrationsstrategie für die 33 Widgets

Nicht alle Plugins müssen sofort angefasst werden. Reihenfolge:
1. Erst Designer + „Mehr gestalten…" bauen (zeigt anfangs einfach *alle* Felder — wie heute, nur größer & live).
2. Dann Widget für Widget die 5–8 wichtigsten Felder als `basic` markieren (das ist die laufende
   „Optimierung Widget für Widget", die du ohnehin machst — Progress-Widget war der Anfang).

---

## 5. Der Widget Designer im Detail (Ebene ②)

### 5.1 Layout (Vollbild-Modal, ~95vw × 95vh)

```
┌───────────────────────────────────────────────────────────────────────────┐
│  Toolbar: [Widget-Name]   Format ▾  Theme ▾  Zoom ▾      ↶ ↷   [Abbrechen][Fertig] │
├──────────────────────────────────────────────┬────────────────────────────┤
│                                              │  Tabs: Gestaltung │ Looks │…  │
│                                              │ ┌────────────────────────────┐│
│            LIVE-BÜHNE                        │ │ Sektion: Content            ││
│      (das Widget, groß, im                   │ │   Label      [__________]   ││
│       gewählten Format gerendert)            │ │   Wert       [__________]   ││
│                                              │ │ Sektion: Layout             ││
│      ┌────────────────────────────┐          │ │   Label-Größe  ▭▭▭▭▭ 140%   ││
│      │  Fundraising goal          │          │ │   Wert-Größe   ▭▭ 70%       ││
│      │  ████████████░░░  68%      │          │ │   Position     [oben|mitte] ││
│      └────────────────────────────┘          │ │ Sektion: Theme & colours    ││
│                                              │ │   …                          ││
│   [ Format-Umschalter: 16:9 · 9:16 · TV ]    │ └────────────────────────────┘│
└──────────────────────────────────────────────┴────────────────────────────┘
```

- **Links: die Bühne.** Das Widget, groß gerendert über `mountWidget` — exakt der Player-Look.
  Hintergrund wie auf dem echten Slide (Theme/Brand), damit Kontrast realistisch beurteilt wird.
- **Rechts: die volle Form** über `buildForm(schema, …, { tierFilter:'all' })`, organisiert in den
  bekannten Sektionen, mit allen Komfort-Features (Reset ↺, Validierung, `showIf`, Slider, Farbwähler …).
- **Oben: Toolbar** (siehe 5.2).
- **Unten/rechts unten:** *Abbrechen* (verwirft) / *Fertig* (schreibt zurück + `commit`).

### 5.2 Toolbar-Funktionen

| Element | Wirkung | Warum (Signage-spezifisch) |
|---|---|---|
| **Format ▾** | Bühne als 16:9 / 9:16 / 21:9 / quadratisch / „wie Slide" rendern | Displays hängen quer **und** hochkant — entscheidend, weil Schriftgrößen per `cqmin` mit der Box skalieren. |
| **Theme ▾** | Vorschau durch alle Themes/Brand-Kits durchschalten | Sofort sehen, ob das Design auf hell *und* dunkel funktioniert. |
| **Zoom ▾** | Bühne 50–200 % | Details prüfen vs. Gesamtwirkung. |
| **↶ / ↷** | Undo/Redo (nutzt `commit`-Historie) | Gefahrloses Experimentieren. |
| **Geteilte Vorschau** (Toggle) | zwei Formate nebeneinander (z. B. quer + hochkant) | „Ein Design, alle Screens" verifizieren. |

### 5.3 Datenfluss (identisch zum Inspector, nur größer)

```
Feld ändern → buildForm.onChange(content)
   → working.content = content
   → debounce(150ms): Vorschau neu rendern (dispose + mountWidget)
Fertig → widget.content = working.content; commit('widget-design'); refreshWidget(id)
Abbrechen → nichts schreiben
```

- Der Designer arbeitet auf einer **Arbeitskopie** (`working.content`), damit *Abbrechen* sauber verwirft.
  (Der heutige Inspector schreibt direkt; der Designer kapselt das in eine Transaktion.)
- Vorschau-Rendering ist debounced (wie Custom-Designer schon zeigt) — flüssig auch bei langen Texten.
- **Netzwerk-Widgets:** in der Vorschau denselben „Klick zum Laden"/Offline-Mechanismus wie im Canvas
  respektieren (DSGVO-Platzhalter), damit der Designer nicht ungefragt fetcht.

---

## 6. Direkte Manipulation (das PowerPoint-Gefühl)

Ziel: Element im Bild anklicken → der passende Regler rechts wird hervorgehoben/fokussiert. Und umgekehrt:
Regler rechts überfahren → Element im Bild leuchtet auf. Das macht aus „Formular ausfüllen" echtes Gestalten.

**Umsetzung schrittweise (ehrlich über Aufwand):**

- **Stufe A (einfach, hoher Nutzen): Hover-Bridge Regler → Bild.**
  Plugins annotieren ihre Hauptelemente optional mit `data-field="label"` im Render.
  Überfährt man rechts den Regler „Label-Größe", bekommt `[data-field="label"]` einen Outline-Glow.
  Rein additiv, kein Pflichtfeld; Widgets ohne Annotation verlieren nur dieses Extra.

- **Stufe B: Klick im Bild → Regler.**
  Klick auf ein `[data-field]`-Element scrollt/fokussiert das zugehörige Feld rechts.
  Mapping über das `data-field`-Attribut → Feld-`key`.

- **Stufe C (später): Inline-Overlays.**
  Für Text direkt im Bild editierbar (contenteditable-Bridge zum `rich-text`/`text`-Feld);
  Ziehpunkte für Größen. Nur für Widgets mit klarer Element-Struktur sinnvoll.

> Empfehlung: A + B in der ersten Designer-Version, C als spätere Ausbaustufe. So entsteht das
> direkte Gefühl früh, ohne jedes Plugin umbauen zu müssen.

---

## 7. „Looks" — kuratierte Vorlagen pro Widget (die PowerPoint-Designer-Idee)

Du hast PowerPoint als Vorbild genannt — PowerPoint hat den „Designer", der fertige Looks vorschlägt.
Das ist der schnellste Weg zu „komplexe Designs komfortabel".

- Jedes Plugin kann optional `looks` deklarieren: benannte, kuratierte Voreinstellungen.

  ```js
  looks: () => [
    { id: 'bold-headline', name: 'Große Überschrift',
      preview: '🅰',  // oder Mini-Render
      patch: { labelScale: 180, valueScale: 70, labelEmphasis: true, align: 'top' } },
    { id: 'minimal-ring', name: 'Minimaler Ring',
      patch: { style: 'ring', showValue: false, valueScale: 60 } },
  ]
  ```

- Im Designer-Tab **Looks**: eine Galerie von Miniatur-Vorschauen (jede über `mountWidget` mit
  `{...content, ...patch}` gerendert). Klick wendet den `patch` an — der Nutzer kann danach frei weiterfeilen.
- `looks` sind **reine Daten-Patches** auf `content` — kein Sonderpfad, voll mit allen Reglern kombinierbar.
- Übergang zu Ebene ③: ein Look kann auch ein vollständiges custom-Template sein („Vorlagen-Galerie"
  für eigene Widgets) — damit verschmelzen „Looks" und der heutige „My widgets"-Store zu einer Idee.

---

## 8. Verzahnung mit der laufenden Custom-Widget-Arbeit (Ebene ③)

Die andere Session hat bereits gebaut: `custom`-Plugin, Template-Engine mit Sanitizing/Scoping,
„My widgets"-Store (preset/custom/composite), Export/Import, Library-Palette, Tests. Das bleibt **vollständig erhalten**
und wird eingeordnet, nicht ersetzt.

**Konkrete Naht:**

1. **Begriffsklärung (wichtig, sonst Kollision):**
   - Das *bestehende* Template/CSS/Felder-Fenster heißt künftig **„Custom-Widget-Editor"** (Ebene ③).
   - Das *neue* Vollbild-Fenster heißt **„Widget Designer"** (Ebene ②, für jedes Widget).
   - Im Designer ist Ebene ③ der Tab **„Eigenes / Code"** — nur sichtbar bei `type === 'custom'`
     oder über „Aus diesem Widget ein eigenes machen".

2. **Wiederverwendung:** Das vorhandene `widget-designer.js`-UI wird zur Render-Funktion dieses Tabs
   (es liefert schon Template/CSS/Felder + Live-Vorschau). Keine Doppelarbeit.

3. **„My widgets" = Looks-Quelle:** Gespeicherte presets/customs erscheinen sowohl in der Library-Palette
   (wie heute) als auch als Looks im Designer.

4. **Eject-Pfad:** „Aus diesem Widget ein eigenes machen" nimmt den aktuell gerenderten Zustand eines
   Standard-Widgets und erzeugt daraus ein `custom`-Widget (Template grob aus dem aktuellen DOM ableiten
   oder mit einem passenden Starter-Template + den aktuellen Werten). Power-User startet bei etwas Fertigem.

> **Koordination:** Solange beide Sessions im selben Checkout arbeiten, jeweils nur die eigenen Dateien
> gezielt stagen/committen. Idealerweise Ebene ③ (custom) erst sauber mergen, dann Ebene ② darauf aufsetzen.

---

## 9. Umsetzungsplan (in Phasen, je lieferbar & testbar)

| Phase | Inhalt | Berührte Dateien (neu/✎) | Risiko |
|------|--------|--------------------------|--------|
| **0. Begriffe & Naht** | „Widget Designer" vs „Custom-Widget-Editor" benennen; Custom-Arbeit mergen | overlay.de.js ✎, library/inspector ✎ | gering |
| **1. Designer-Grundgerüst** | Vollbild-Modal; rechts volle Form via `buildForm`; links Live-Vorschau via `mountWidget`; Arbeitskopie + Abbrechen/Fertig; „Mehr gestalten…"-Button im Inspector | `admin/panels/designer.js` (neu), `admin/ui/modal.js` ✎ (fullscreen-Variante), `admin/panels/inspector.js` ✎ | mittel |
| **2. Feld-Stufen** | `tier`-Konvention + `buildForm({tierFilter})`; Inspector zeigt nur `basic` | `admin/ui/inspector.js` ✎, `shared/plugin-contract.js` ✎ (Doku) | gering |
| **3. Bühne-Toolbar** | Format-Umschalter (quer/hochkant/TV), Theme-Durchschalter, Zoom, geteilte Vorschau | `admin/panels/designer.js` ✎ | mittel |
| **4. Looks** | `looks()` im Plugin-Vertrag; Tab „Looks" mit Mini-Renders; an „My widgets" andocken | `shared/plugin-contract.js` ✎, `admin/panels/designer.js` ✎, je Plugin `looks()` | mittel |
| **5. Direkte Manipulation A+B** | `data-field`-Annotation; Hover-Bridge + Klick-zu-Regler | je Plugin Render ✎ (additiv), `admin/panels/designer.js` ✎ | mittel |
| **6. Code-Tab integrieren** | bestehendes `widget-designer.js` als Tab „Eigenes/Code"; Eject-Pfad | `admin/panels/designer.js` ✎, `widget-designer.js` ✎ | mittel |
| **7. Widget-für-Widget `basic`-Felder** | die 5–8 Kernfelder je Plugin markieren (laufende Optimierung) | je `shared/plugins/*.js` ✎ | gering |
| **8. Direkte Manipulation C** | Inline-Text-Edit, Ziehpunkte (ausgewählte Widgets) | später | hoch |

**Frühster sinnvoller Auslieferstand:** nach Phase 1 — schon „Mehr gestalten…" → großes Live-Fenster mit
allen Reglern ist ein spürbarer Sprung. Phasen 2–4 machen es einfach *und* mächtig.

---

## 10. Bessere Ideen, die ich eingebaut habe

- **Geräte-Format-Vorschau (quer/hochkant/TV)** als Erstklasse-Funktion — weil Signage genau hier scheitert
  und das System dank `cqmin` dafür schon gebaut ist. (Killer-Feature, das PowerPoint nicht braucht, Signage aber schon.)
- **„Looks" = einheitliches Konzept** für kuratierte Voreinstellungen *und* gespeicherte „My widgets" — eine
  Galerie statt zwei getrennter Vorrats-Systeme.
- **Eject-Pfad** (Standard-Widget → eigenes Widget) statt „leeres Blatt" — senkt die Hürde zur Ebene ③ drastisch.
- **Arbeitskopie-Transaktion** im Designer (echtes Abbrechen) — der heutige Inspector schreibt sofort; im
  großen Werkzeug will man gefahrlos probieren.
- **Hover-Bridge in beide Richtungen** als billiger erster Schritt zur direkten Manipulation, ohne jedes
  Plugin umbauen zu müssen.

---

## 11. Entscheidungen (festgelegt 2026-06-14)

| # | Frage | Entscheidung |
|---|-------|--------------|
| 1 | Naht zur laufenden Custom-Arbeit | **Erst Ebene ③ (custom) mergen, dann Ebene ② darauf bauen.** Kein Designer-Code, bis die Custom-Arbeit committet ist. |
| 2 | Feld-Stufen | **`tier:'basic'\|'advanced'` pro Feld** (default `basic`). Kein `basicKeys`. |
| 3 | Direkte Manipulation v1 | **Hover + Klick-Bridge (Stufen A+B)** über optionales `data-field`. Inline-Edit (C) später. |

Noch offen (später zu klären):
- **„Mehr gestalten…"-Einstieg:** nur Button im Inspector, oder zusätzlich Doppelklick aufs Widget im Canvas?
- **„Looks"-Quelle:** eigenes `looks()` im Plugin-Vertrag und/oder aus „My widgets"/Designs?

### Daraus folgender nächster Schritt

Wegen Entscheidung 1 ist der **nächste Schritt nicht das Bauen des Designers**, sondern:
1. Die laufende Custom-Widget-Arbeit (andere Session) **sauber committen/mergen**.
2. Danach Phase 1 (Designer-Grundgerüst) starten — bevorzugt in einem eigenen Branch/Worktree,
   damit `admin/ui/inspector.js` & Co. nicht mit fremden, noch offenen Änderungen kollidieren.

---

## 12. Architektur-Konformität (Checkliste)

- ✅ Nutzt den einen Render-Pfad (`mountWidget`) → keine Vorschau-Drift.
- ✅ Nutzt `buildForm` → kein zweites Formular-System, alle 50+ Controls sofort verfügbar.
- ✅ `tier`/`looks` sind **reine Daten**, default-kompatibel → keine Brüche an 33 Plugins.
- ✅ Theming/Farben/Container-Queries unverändert → ein Design skaliert über alle Screens.
- ✅ Custom-Sicherheitsmodell (Sanitizing/Scoping) bleibt die einzige Code-Grenze; Ebenen ①/② erzeugen nie Code.
- ✅ i18n über `tx()` + `overlay.de.js` wie überall.
- ✅ Undo/Redo über `commit()`; Designer kapselt zusätzlich eine Abbrechen-Transaktion.
