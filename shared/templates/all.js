// Barrel: importing this file registers every slide-set template.
// Mirrors shared/plugins/all.js — the order here is the order the store's
// "All templates" grid falls back to inside each category.
//
// Admin-only. The player never imports it (a published playlist is finished
// JSON; nothing on a screen needs the catalog), so templates cost the player
// bundle nothing.

import './generic.js';
import './gastro.js';
import './service.js';
import './workplace.js';
import './places.js';
// The sets chosen by WHO is reading rather than by what kind of venue it is —
// nursery, primary school, youth club, paediatrics, day centre, community centre.
import './audience.js';

export {};
