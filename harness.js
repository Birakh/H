'use strict';
const fs = require('fs');
const vm = require('vm');

// ---- minimal DOM stubs ----
function makeEl(id) {
  const listeners = {};
  const el = {
    id,
    _children: [],
    style: {},
    classList: {
      _set: new Set(),
      add(...c){ c.forEach(x=>this._set.add(x)); },
      remove(...c){ c.forEach(x=>this._set.delete(x)); },
      toggle(c,f){ if(f===undefined){ this._set.has(c)?this._set.delete(c):this._set.add(c); } else if(f){ this._set.add(c);} else {this._set.delete(c);} },
      contains(c){ return this._set.has(c); }
    },
    dataset: {},
    addEventListener(evt, fn){ (listeners[evt] = listeners[evt]||[]).push(fn); },
    removeEventListener(){},
    querySelectorAll(){ return []; },
    querySelector(){ return null; },
    appendChild(c){ this._children.push(c); return c; },
    remove(){},
    focus(){},
    blur(){},
    click(){},
    closest(){ return null; },
    getAttribute(){ return null; },
    setAttribute(){},
    get innerHTML(){ return this._innerHTML || ''; },
    set innerHTML(v){ this._innerHTML = v; },
    value: '',
    textContent: '',
  };
  return el;
}

const elCache = new Map();
function getElementById(id) {
  if (!elCache.has(id)) elCache.set(id, makeEl(id));
  return elCache.get(id);
}

const documentStub = {
  addEventListener(){},
  removeEventListener(){},
  getElementById,
  querySelector(){ return null; },
  querySelectorAll(){ return []; },
  createElement(){ return makeEl('_created'); },
  activeElement: null,
  documentElement: { style:{}, dataset:{}, setAttribute(){}, classList: { add(){}, remove(){}, toggle(){} } },
  body: makeEl('body'),
  cookie: '',
};

let _storage = {};
const localStorageStub = {
  getItem(k){ return Object.prototype.hasOwnProperty.call(_storage,k) ? _storage[k] : null; },
  setItem(k,v){ _storage[k] = String(v); },
  removeItem(k){ delete _storage[k]; },
  clear(){ _storage = {}; },
};

const navigatorStub = { serviceWorker: undefined, onLine: true, userAgent: 'node' };

const sandbox = {
  console,
  window: {},
  document: documentStub,
  navigator: navigatorStub,
  localStorage: localStorageStub,
  fetch: () => Promise.reject(new Error('network disabled in test harness')),
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: (fn) => setTimeout(fn, 0),
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  crypto: require('crypto').webcrypto,
  TextEncoder, TextDecoder,
  structuredClone,
  location: { href: 'http://localhost/', reload(){} },
  addEventListener(){}, removeEventListener(){}, dispatchEvent(){},
  alert: () => {},
  confirm: () => true,
  prompt: () => null,
  URL,
  Blob: class Blob {},
  FileReader: class FileReader {},
};
sandbox.window = sandbox; // window === global scope, common browser-script assumption
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const src_html = fs.readFileSync('/mnt/user-data/uploads/index.html', 'utf8');
const scriptMatches = [...src_html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if (scriptMatches.length !== 1) {
  console.log(`WARNING: found ${scriptMatches.length} inline <script> blocks (expected 1) — check for the doubled-document corruption bug before trusting anything else.`);
}
const src = scriptMatches[scriptMatches.length - 1][1];
try {
  vm.runInContext(src, sandbox, { filename: 'app.js' });
  console.log('SCRIPT LOADED OK');
} catch (e) {
  console.log('SCRIPT LOAD ERROR:', e.stack);
  process.exit(1);
}

// ---- run self test + smoke test ----
try {
  const selfResult = vm.runInContext('typeof silentSelfTest === "function" ? silentSelfTest() : "NO_FN"', sandbox);
  console.log('silentSelfTest() returned:', JSON.stringify(selfResult, null, 2));
} catch (e) {
  console.log('silentSelfTest() THREW:', e.stack);
}

try {
  vm.runInContext(`
    (function(){
      globalThis.document.getElementById('smoke-list');
      globalThis.document.getElementById('smoke-badge');
      runSmokeTest();
    })();
  `, sandbox);
  const list = vm.runInContext(`document.getElementById('smoke-list').innerHTML`, sandbox);
  const badge = vm.runInContext(`document.getElementById('smoke-badge').innerHTML`, sandbox);
  console.log('SMOKE BADGE:', badge);
  console.log('SMOKE LIST HTML LENGTH:', list.length);
  console.log(list.replace(/<[^>]+>/g, m => m.includes('st-icon') ? m : '').replace(/\s+/g,' '));
} catch (e) {
  console.log('runSmokeTest() THREW:', e.stack);
}
