/**
 * A House Divided - Traduzione italiana
 * Traduce i dati dell'Adventure "house-divided.house-divided" durante l'importazione.
 * Non modifica il compendio originale e non cambia nessun ID: sostituisce solo i campi di testo.
 */

import { hk } from "./hash.mjs";

const MODULE_ID = "house-divided-it";
const ADVENTURE_PACK = "house-divided.house-divided";
const DICT_PATH = `modules/${MODULE_ID}/lang/house-divided.it.json`;

/** Nomi di token/attori che lo script originale cerca per nome: non vanno mai tradotti. */
const PROTECTED_NAMES = /Ghostly Remnant|Reflection|Jelly|Shard Stalker/;

/** Mappa tipo documento -> chiave del campo nell'Adventure (stessi percorsi usati per l'estrazione). */
const DOC_KEYS = {
  Actor: "actors", Item: "items", JournalEntry: "journal", Scene: "scenes", RollTable: "tables",
  Macro: "macros", Cards: "cards", Playlist: "playlists", Folder: "folders", Combat: "combats"
};

const ACTORISH = String.raw`(actors\[\]|scenes\[\]\.tokens\[\]\.delta)`;
const ITEMISH = String.raw`(items\[\]|${ACTORISH}\.items\[\])`;
const FIELD_PATTERNS = [
  String.raw`^(name|caption|description)$`,
  String.raw`^folders\[\]\.name$`,
  String.raw`^journal\[\]\.(name|categories\[\]\.name)$`,
  String.raw`^journal\[\]\.pages\[\]\.(name|text\.content|image\.caption|src_caption)$`,
  String.raw`^tables\[\]\.(name|description|results\[\]\.(name|description))$`,
  String.raw`^cards\[\]\.(name|description|cards\[\]\.(name|description|faces\[\]\.(name|text)|back\.(name|text)))$`,
  String.raw`^playlists\[\]\.(name|description)$`,
  String.raw`^macros\[\]\.name$`,
  String.raw`^scenes\[\]\.(name|navName|levels\[\]\.name|regions\[\]\.name|regions\[\]\.behaviors\[\]\.name|notes\[\]\.text|drawings\[\]\.text|tiles\[\]\.name)$`,
  String.raw`^${ACTORISH}\.(name|system\.details\.(biography\.value|alignment|type\.subtype|type\.custom)|system\.traits\.(languages|dr|di|dv|ci)\.custom|system\.attributes\.senses\.special)$`,
  String.raw`^actors\[\]\.prototypeToken\.name$`,
  String.raw`^scenes\[\]\.tokens\[\]\.name$`,
  String.raw`^${ACTORISH}\.effects\[\]\.(name|description)$`,
  String.raw`^${ITEMISH}\.(name|system\.(description\.(value|chat)|unidentified\.(name|description)|materials\.value|requirements|activation\.condition|target\.affects\.special|range\.special))$`,
  String.raw`^${ITEMISH}\.effects\[\]\.(name|description)$`,
  String.raw`^${ITEMISH}\.system\.activities\.\*\.(name|description\.chatFlavor|activation\.condition|target\.affects\.special|range\.special|roll\.name)$`
].map(p => new RegExp(p));
const NAME_PATH = /(^actors\[\]\.(name|prototypeToken\.name)$|^scenes\[\]\.tokens\[\]\.(name|delta\.name)$)/;
const HTML_PATH = /(text\.content|description\.value|biography\.value|description$|\.description$|caption$)/;

let DICT = null;

/* -------------------------------------------- */

async function loadDictionary() {
  if ( DICT ) return DICT;
  const response = await fetch(DICT_PATH);
  if ( !response.ok ) throw new Error(`Impossibile caricare ${DICT_PATH} (${response.status})`);
  DICT = await response.json();
  console.log(`${MODULE_ID} | Dizionario caricato: ${Object.keys(DICT).length} voci`);
  return DICT;
}

/* -------------------------------------------- */

function normPath(path) {
  return path.replace(/(system\.activities)\.[^.]+/g, "$1.*");
}

function isTranslatable(path) {
  const p = normPath(path);
  return FIELD_PATTERNS.some(r => r.test(p));
}

/**
 * Le ancore dei titoli (#slug) vengono calcolate dal testo del titolo. Per non rompere i 300 collegamenti
 * "@UUID[...#ancora]" fissiamo sui titoli tradotti l'ancora calcolata sul testo inglese originale.
 */
function preserveAnchors(original, translated) {
  if ( !/<h[1-6]/i.test(original) ) return translated;
  const parser = new DOMParser();
  const src = parser.parseFromString(`<div>${original}</div>`, "text/html").body.firstElementChild;
  const dst = parser.parseFromString(`<div>${translated}</div>`, "text/html").body.firstElementChild;
  const sh = src.querySelectorAll("h1,h2,h3,h4,h5,h6");
  const dh = dst.querySelectorAll("h1,h2,h3,h4,h5,h6");
  if ( sh.length !== dh.length ) {
    console.warn(`${MODULE_ID} | Numero di titoli diverso, ancore non preservate`, original.slice(0, 80));
    return translated;
  }
  const slugify = foundry.documents.JournalEntryPage?.slugifyHeading ?? JournalEntryPage.slugifyHeading;
  sh.forEach((h, i) => {
    if ( dh[i].dataset.anchor ) return;
    dh[i].dataset.anchor = h.dataset.anchor || slugify(h);
  });
  return dst.innerHTML;
}

function translateString(path, value) {
  const it = DICT[hk(value)];
  if ( typeof it !== "string" || !it.length ) return value;
  if ( NAME_PATH.test(normPath(path)) && PROTECTED_NAMES.test(value) ) return value;
  if ( HTML_PATH.test(path) ) return preserveAnchors(value, it);
  return it;
}

/** Percorre ricorsivamente i dati e sostituisce i campi traducibili. Restituisce il numero di sostituzioni. */
function translateData(obj, path) {
  let count = 0;
  if ( Array.isArray(obj) ) {
    for ( let i = 0; i < obj.length; i++ ) {
      const v = obj[i];
      if ( typeof v === "string" ) continue;
      count += translateData(v, `${path}[]`);
    }
  }
  else if ( obj && (typeof obj === "object") ) {
    for ( const [k, v] of Object.entries(obj) ) {
      const p = path ? `${path}.${k}` : k;
      if ( typeof v === "string" ) {
        if ( !isTranslatable(p) ) continue;
        const t = translateString(p, v);
        if ( t !== v ) { obj[k] = t; count++; }
      }
      else count += translateData(v, p);
    }
  }
  return count;
}

function translateBuckets(buckets) {
  let count = 0;
  for ( const [docName, list] of Object.entries(buckets ?? {}) ) {
    const key = DOC_KEYS[docName];
    if ( !key || !Array.isArray(list) ) continue;
    for ( const data of list ) count += translateData(data, `${key}[]`);
  }
  return count;
}

function isHouseDivided(adventure) {
  return adventure?.pack === ADVENTURE_PACK;
}

/* -------------------------------------------- */
/*  Hook                                        */
/* -------------------------------------------- */

Hooks.once("ready", () => {
  if ( game.user.isGM ) loadDictionary().catch(err => console.error(err));
});

Hooks.on("preImportAdventure", (adventure, options, toCreate, toUpdate) => {
  if ( !isHouseDivided(adventure) ) return;
  const run = () => {
    const n = translateBuckets(toCreate) + translateBuckets(toUpdate);
    console.log(`${MODULE_ID} | Testi tradotti all'importazione: ${n}`);
  };
  if ( DICT ) return run();
  options.preImport ??= [];
  options.preImport.unshift(async () => { await loadDictionary(); run(); });
});

/** Traduce nome, didascalia e descrizione mostrati nella finestra di importazione (solo in memoria). */
Hooks.on("renderAdventureImporterV2", async (app) => {
  const adventure = app.adventure;
  if ( !isHouseDivided(adventure) || adventure._hdItTranslated ) return;
  await loadDictionary();
  const changes = {};
  for ( const f of ["caption", "description"] ) {
    const v = adventure._source[f];
    if ( typeof v === "string" && DICT[hk(v)] ) changes[f] = DICT[hk(v)];
  }
  adventure._hdItTranslated = true;
  if ( foundry.utils.isEmpty(changes) ) return;
  adventure.updateSource(changes);
  app.render();
});
