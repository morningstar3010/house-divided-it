/**
 * A House Divided - Traduzione italiana: testi dell'interfaccia
 * Il codice del modulo originale contiene testi in inglese scritti direttamente nello script (finestre, notifiche,
 * registro dell'Approvazione, percezione passiva). Qui li traduciamo al volo senza toccare i file originali.
 */

import { hk } from "./hash.mjs";

const MODULE_ID = "house-divided-it";
const UI_PATH = `modules/${MODULE_ID}/lang/ui.it.json`;

let UI = null;
let REGEX = [];

const norm = s => s.replace(/\s+/g, " ").trim();

async function loadUI() {
  if ( UI ) return UI;
  const response = await fetch(UI_PATH);
  UI = await response.json();
  REGEX = UI.regex.map(([rx, it]) => [new RegExp(rx, "s"), it]);
  return UI;
}

/** Nomi candidati per ricostruire i modelli "{name} nota...": attori e token presenti nella scena e nel mondo. */
function candidateNames() {
  const names = new Set();
  for ( const t of canvas?.tokens?.placeables ?? [] ) {
    if ( t.actor?.name ) names.add(t.actor.name);
    if ( t.document?.name ) names.add(t.document.name);
  }
  for ( const a of game.actors ?? [] ) names.add(a.name);
  return [...names].filter(Boolean).sort((a, b) => b.length - a.length);
}

/** Traduce una stringa semplice: corrispondenza esatta, poi espressioni regolari. */
export function translateText(value) {
  if ( !UI || (typeof value !== "string") ) return value;
  const key = norm(value);
  if ( !key ) return value;
  const it = UI.text[hk(key)];
  if ( it ) return value.replace(value.trim(), it);
  for ( const [rx, rep] of REGEX ) {
    const m = key.match(rx);
    if ( !m ) continue;
    if ( rep === "BALCONY" ) {
      const which = m[1] === "Hall" ? "del corridoio" : "est";
      return value.trim().replace(rx, (_all, _w, a) => `La balconata ${which} è già crollata. Fai clic ${a}qui</a> per ripristinarla.`);
    }
    return key.replace(rx, rep);
  }
  return value;
}

/** Traduce un blocco HTML confrontandolo con i modelli che contengono {name}. */
export function translateTemplateHtml(html) {
  if ( !UI || (typeof html !== "string") ) return html;
  const key = norm(html);
  if ( !key ) return html;
  const direct = UI.templates[hk(key)];
  if ( direct ) return direct;
  for ( const name of candidateNames() ) {
    if ( !key.includes(name) ) continue;
    const it = UI.templates[hk(key.replace(name, "{name}"))];
    if ( it ) return it.replace("{name}", name);
  }
  return html;
}

/** Traduce i nodi di testo e gli attributi visibili di un elemento. */
export function translateDom(root) {
  if ( !UI || !root ) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while ( walker.nextNode() ) nodes.push(walker.currentNode);
  for ( const node of nodes ) {
    const t = translateText(node.nodeValue);
    if ( t !== node.nodeValue ) node.nodeValue = t;
  }
  for ( const el of root.querySelectorAll("[label], [title], [data-tooltip], [placeholder]") ) {
    for ( const attr of ["label", "title", "data-tooltip", "placeholder"] ) {
      const v = el.getAttribute(attr);
      if ( v ) {
        const t = translateText(v);
        if ( t !== v ) el.setAttribute(attr, t);
      }
    }
  }
  // Paragrafi interi (percezione passiva, teletrasporti): si confrontano i blocchi di contenuto
  for ( const el of root.querySelectorAll(".dialog-content, .window-content > div, form > div") ) {
    const t = translateTemplateHtml(el.innerHTML);
    if ( t !== el.innerHTML ) el.innerHTML = t;
  }
}

/* -------------------------------------------- */
/*  Patch e hook                                */
/* -------------------------------------------- */

function wrapNotifications() {
  const cls = foundry.applications?.ui?.Notifications;
  if ( !cls || cls.prototype._hdItWrapped ) return;
  const original = cls.prototype.notify;
  cls.prototype.notify = function(message, ...args) {
    return original.call(this, translateText(message), ...args);
  };
  cls.prototype._hdItWrapped = true;
}

function wrapScrollingText() {
  const cls = foundry.canvas?.groups?.InterfaceCanvasGroup;
  if ( !cls || cls.prototype._hdItWrapped ) return;
  const original = cls.prototype.createScrollingText;
  cls.prototype.createScrollingText = function(origin, content, ...args) {
    return original.call(this, origin, translateText(content), ...args);
  };
  cls.prototype._hdItWrapped = true;
}

function patchHouseDivided() {
  const api = globalThis.houseDivided?.api;
  const Tracker = api?.HouseDividedReputationTracker;
  if ( Tracker && !Tracker._hdItWrapped ) {
    const getButtonLabel = Tracker.getButtonLabel;
    Tracker.getButtonLabel = function(...args) { return translateText(getButtonLabel.apply(this, args)); };
    Tracker._hdItWrapped = true;
  }
  const tracker = globalThis.houseDivided?.ui?.reputation;
  if ( tracker?.options?.window ) tracker.options.window.title = translateText(tracker.options.window.title);
  for ( const effect of Object.values(CONFIG.weatherEffects ?? {}) ) {
    if ( effect?.label ) effect.label = translateText(effect.label);
  }
}

Hooks.once("init", () => {
  loadUI().then(() => { wrapNotifications(); wrapScrollingText(); }).catch(err => console.error(`${MODULE_ID} |`, err));
});

Hooks.once("setup", async () => {
  await loadUI();
  patchHouseDivided();
});

Hooks.on("renderHouseDividedReputationTracker", (app, element) => translateDom(element));

Hooks.on("renderAdventureImporterV2", (app, element) => {
  if ( app.adventure?.pack === "house-divided.house-divided" ) translateDom(element);
});

Hooks.on("renderDialogV2", (app, element) => {
  const title = app.options?.window?.title;
  const known = title && UI?.text[hk(norm(title))];
  const content = element.querySelector(".dialog-content")?.innerHTML ?? "";
  if ( known || (translateTemplateHtml(content) !== content) ) translateDom(element);
});

Hooks.on("renderJournalDirectory", (app, element) => {
  for ( const button of element.querySelectorAll("button") ) {
    if ( button.textContent.includes("Approval Tracker") ) translateDom(button);
  }
});

/** Oggetti creati dalle macro (Facsimile Arcano): traduce la descrizione. */
Hooks.on("preCreateItem", (item, data) => {
  const desc = data.system?.description?.value;
  if ( !desc ) return;
  const t = translateTemplateHtml(desc);
  if ( t !== desc ) item.updateSource({"system.description.value": t});
});

/* -------------------------------------------- */
/*  Sezioni del diario e registrazione mappe    */
/* -------------------------------------------- */

/**
 * Il foglio diario originale crea le intestazioni "Overview / Events / Quests" cercando i titoli che iniziano con
 * "Event:" e "Quest:". Con i titoli tradotti ("Evento:", "Missione:") non le troverebbe: sostituiamo il metodo con
 * una versione che riconosce entrambe le lingue e scrive le intestazioni in italiano.
 */
function patchJournalSections() {
  const Sheet = globalThis.houseDivided?.api?.HouseDividedJournalSheet;
  if ( !Sheet || Sheet.prototype._hdItWrapped ) return;
  Sheet.prototype._insertSidebarSections = function(html) {
    const toc = html.querySelector(".pages-list .directory-list, .sidebar .toc ol");
    if ( !toc?.children.length ) return;
    const sections = {overview: false, quests: false, events: false};
    const divider = document.createElement("li");
    divider.classList.add("directory-section", "level1", "category");
    const tagName = toc.classList.contains("directory-list") ? "h2" : "strong";
    divider.insertAdjacentHTML("afterbegin", `<${tagName} class="section-header"></${tagName}>`);
    const add = (li, label) => { const d = divider.cloneNode(true); d.children[0].textContent = label; li.before(d); };
    for ( const li of Array.from(toc.children) ) {
      if ( li.classList.contains("directory-section") ) continue;
      if ( !sections.overview ) { add(li, "Panoramica"); sections.overview = true; continue; }
      const title = li.querySelector(".page-title")?.innerText ?? "";
      if ( !sections.events && /^(Event|Evento):/.test(title) ) { add(li, "Eventi"); sections.events = true; continue; }
      if ( !sections.quests && /^(Quest|Missione):/.test(title) ) { add(li, "Missioni"); sections.quests = true; }
    }
  };
  Sheet.prototype._hdItWrapped = true;
}

Hooks.once("setup", () => patchJournalSections());

/**
 * Le mappe del Maniero usano texture "#ahd#..." che il modulo originale registra solo all'avvio del mondo (hook
 * "setup"). Le scene appena create dall'importazione quindi non vengono riconosciute finché non si ricarica la
 * pagina e appaiono senza immagini. Dopo l'importazione, se manca qualche scena registrata, ricarichiamo tutti i
 * client (lo stesso meccanismo che il modulo originale usa per l'aggiornamento dei mondi v13).
 */
Hooks.on("importAdventure", (adventure) => {
  if ( adventure?.pack !== "house-divided.house-divided" || !game.user.isGM ) return;
  const managed = globalThis.houseDivided?.api?.scenes ?? {};
  const missing = Object.keys(managed).some(id => game.scenes.has(id) && !(id in (CONFIG.Canvas.managedScenes ?? {})));
  if ( !missing ) return;
  ui.notifications.info("Importazione completata: ricarico la pagina per caricare le mappe del Maniero.");
  setTimeout(() => {
    game.socket.emit("reload");
    foundry.utils.debouncedReload();
  }, 4000);
});
