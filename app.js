/* =====================================================================
   Cuadre · app.js
   Todo el funcionamiento de la app. Se carga desde index.html.

   Dos modos, según la configuración de abajo:
   - Sin Supabase configurado: guarda en este navegador (sirve para probar).
   - Con Supabase configurado: inicio de sesión + datos en la nube (varios dispositivos).
   ===================================================================== */
(function () {
  'use strict';

  /* ---------- 1. CONFIGURACIÓN: pega aquí los datos de tu proyecto Supabase ----------
     Los encuentras en Supabase > Project Settings > API.
     La clave "anon public" está hecha para ir en páginas web: la seguridad la ponen
     las reglas de schema.sql (cada persona solo ve sus propios datos).
     NUNCA pegues aquí la clave "service_role". */
  var CONFIG = {
    SUPABASE_URL: 'https://qfkmtxekvywlcgfimwsg.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_JXA4mOZJH3eRJeKd8s6YZw_Y4shklIr',
    VAPID_PUBLIC_KEY: 'BMXienvznWzFHZ_6bto-Pw34SeP791P1eFOsRI3yK4ms6Fu7piR1OOnct0I471G-BRMo6U1d6pnamQZy-bQpHRQ'
  };

  // Limpia lo pegado: agrega https:// si falta y quita barras o rutas de más (/rest/v1).
  (function () {
    var u = String(CONFIG.SUPABASE_URL || '').trim();
    if (u) { if (!/^https?:\/\//i.test(u)) u = 'https://' + u; u = u.replace(/\/+$/, '').replace(/\/(rest|auth)\/v1.*$/i, ''); }
    CONFIG.SUPABASE_URL = u; CONFIG.SUPABASE_ANON_KEY = String(CONFIG.SUPABASE_ANON_KEY || '').trim();
  })();
  var CLOUD = !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
  var CLOUD_CONFIGURED = CLOUD; // No se modifica el ajuste real al entrar en la demostración.
  var demoMode = false;
  var LOCAL_KEY = 'cuadre:web:v1';
  var DEMO_KEY = 'cuadre:demo:v1';
  var SYNC_KEY = 'cuadre:last-sync:v1';
  var UI_PREFS_KEY = 'cuadre:ui-prefs:v1';
  var HOME_PREFS_KEY = 'cuadre:home-prefs:v1';
  var FAVORITES_KEY = 'cuadre:favorites:v1';
  var DISPLAY_KEY = 'cuadre:display';
  var THEME_KEY = 'cuadre:theme';
  var RATE_URL = 'https://ve.dolarapi.com/v1/dolares/oficial';

  /* ---------- 2. Dinero en enteros (centavos). Nunca decimales flotantes. ---------- */
  function mulDivRound(a, b, c) {
    if (![a, b, c].every(Number.isInteger) || c === 0) throw new RangeError('mulDivRound requiere enteros');
    var neg = [a, b, c].filter(function (n) { return n < 0; }).length % 2 === 1;
    var A = BigInt(Math.abs(a)), B = BigInt(Math.abs(b)), C = BigInt(Math.abs(c));
    var m = Number((A * B * 2n + C) / (2n * C));
    return neg && m !== 0 ? -m : m;
  }
  function parseDecimal(input, scale, threeDigitsAreThousands) {
    var s = String(input).trim().replace(/\s+/g, '').replace(/^(bs\.?|\$|usd)/i, '');
    if (!/^\d[\d.,]*$/.test(s)) return null;
    var lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(','), di = -1;
    if (lastDot >= 0 && lastComma >= 0) di = Math.max(lastDot, lastComma);
    else {
      var si = Math.max(lastDot, lastComma);
      if (si >= 0) {
        var sep = s[si], occ = s.split(sep).length - 1, after = s.length - si - 1;
        if (!(occ > 1 || (after === 3 && threeDigitsAreThousands))) di = si;
      }
    }
    var ip = di >= 0 ? s.slice(0, di) : s, fp = di >= 0 ? s.slice(di + 1) : '';
    if (/[.,]/.test(ip)) {
      if (!/^\d{1,3}([.,]\d{3})+$/.test(ip)) return null;
      if (new Set(ip.match(/[.,]/g)).size > 1) return null;
      ip = ip.replace(/[.,]/g, '');
    }
    if (!/^\d+$/.test(ip)) return null;
    if (fp !== '' && !/^\d+$/.test(fp)) return null;
    if (fp.length > scale) return null;
    var v = Number(ip) * Math.pow(10, scale) + Number(fp.padEnd(scale, '0') || '0');
    return Number.isSafeInteger(v) ? v : null;
  }
  function parseAmount(t) { return parseDecimal(t, 2, true); }
  function parseRate(t) { return parseDecimal(t, 4, false); }
  function group(d) { return d.replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function fmt(minor, cur) {
    var abs = Math.abs(minor), whole = Math.floor(abs / 100), cents = String(abs % 100).padStart(2, '0');
    return (minor < 0 ? '-' : '') + (cur === 'USD' ? '$' : 'Bs') + ' ' + group(String(whole)) + ',' + cents;
  }
  function fmtRate(e4) {
    var r = mulDivRound(e4, 1, 100);
    return group(String(Math.floor(r / 100))) + ',' + String(r % 100).padStart(2, '0');
  }
  function convert(minor, from, to, e4) {
    if (from === to) return minor;
    if (!Number.isInteger(e4) || e4 <= 0) return 0;
    return from === 'USD' ? mulDivRound(minor, e4, 10000) : mulDivRound(minor, 10000, e4);
  }
  function minorToText(m) {
    var w = Math.floor(m / 100), c = String(m % 100).padStart(2, '0');
    return c === '00' ? String(w) : w + ',' + c;
  }

  /* ---------- 3. Fechas locales AAAA-MM-DD ---------- */
  function p2(n) { return String(n).padStart(2, '0'); }
  function iso(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function today() { return iso(new Date()); }
  function addDays(s, n) { var a = s.split('-').map(Number); return iso(new Date(a[0], a[1] - 1, a[2] + n)); }
  function validDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if (!m) return false;
    var y = +m[1], mo = +m[2], d = +m[3], dt = new Date(y, mo - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
  }
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  function monthLabel(k) { var a = k.split('-').map(Number); return MESES[a[1] - 1] + ' ' + a[0]; }
  function shortDate(s) { var a = s.split('-').map(Number); return a[2] + ' ' + MESES[a[1] - 1].slice(0, 3); }

  /* ---------- 4. Utilidades ---------- */
  function uuid() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* sigue abajo */ }
    var b = new Uint8Array(16); crypto.getRandomValues(b);
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return x.toString(16).padStart(2, '0'); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function humanError(e) {
    var m = (e && (e.message || e.error_description)) || String(e || '');
    if (/not valid JSON|Unexpected token/i.test(m)) return 'No se pudo conectar con Supabase. Revisa que SUPABASE_URL en app.js sea la de tu proyecto (https://…supabase.co).';
    if (/Failed to fetch|NetworkError|Load failed|network|fetch/i.test(m)) return 'Sin conexión. Inténtalo de nuevo cuando tengas internet.';
    if (/Invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
    if (/Email not confirmed/i.test(m)) return 'Primero confirma tu correo: revisa tu bandeja de entrada.';
    if (/otp_expired|expired.*(token|otp|code)|invalid.*(token|otp|code)|token.*(expired|invalid)|code.*(expired|invalid)/i.test(m)) return 'El código no es válido o ha caducado. Solicita uno nuevo y vuelve a intentarlo.';
    if (/already registered|already been registered/i.test(m)) return 'Ese correo ya tiene una cuenta. Prueba iniciar sesión.';
    if (/at least \d+ characters|weak/i.test(m)) return 'La contraseña es muy corta: usa al menos 6 caracteres.';
    if (/valid email|invalid format/i.test(m)) return 'Escribe un correo válido.';
    if (/rate limit|too many/i.test(m)) return 'Demasiados intentos. Espera unos minutos y vuelve a probar.';
    if (/row-level security|permission denied/i.test(m)) return 'No tienes permiso para esa acción. Cierra sesión y vuelve a entrar.';
    if (/duplicate key|unique/i.test(m)) return 'Ya existe un registro con ese nombre.';
    if (/schema cache|does not exist|Could not find/i.test(m)) return 'Falta actualizar la base de datos: ejecuta el schema.sql nuevo en Supabase.';
    if (/foreign key|restrict/i.test(m)) return 'No se puede eliminar porque tiene movimientos asociados.';
    return 'Algo salió mal: ' + m;
  }
  // Errores al cargar: muestra el texto real de la base de datos (sirve para diagnosticar).
  function loadError(e) {
    var m = (e && (e.message || e.error_description)) || String(e || '');
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Sin conexión. Inténtalo de nuevo cuando tengas internet.';
    if (/user_id_fkey|auth\.users|not present in table "users"/i.test(m)) return 'Tu sesión es de otro proyecto o de un usuario que ya no existe. Pulsa "Cerrar sesión" y crea la cuenta de nuevo. (' + m + ')';
    if (/schema cache|does not exist|relation/i.test(m)) return 'Faltan las tablas en Supabase: ejecuta schema.sql completo en el SQL Editor. (' + m + ')';
    return m + (e && e.code ? ' [' + e.code + ']' : '');
  }
  /* Tema: 'system' (como el dispositivo), 'light' o 'dark'. Se recuerda en este dispositivo. */
  function readTheme() { try { var v = localStorage.getItem(THEME_KEY); return v === 'light' || v === 'dark' ? v : 'system'; } catch (e) { return 'system'; } }
  function applyTheme(t) {
    var root = document.documentElement;
    if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t); else root.removeAttribute('data-theme');
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    if (metas.length === 2) {
      metas[0].setAttribute('content', t === 'dark' ? '#0E1512' : '#F2F5F3');
      metas[1].setAttribute('content', t === 'light' ? '#F2F5F3' : '#0E1512');
    }
  }
  function setTheme(t) {
    try { if (t === 'system') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, t); } catch (e) { /* se aplica igual */ }
    var root = document.documentElement;
    if (motionAllowed()) {
      root.classList.add('theme-animating'); clearTimeout(themeResetTimer);
      themeResetTimer = setTimeout(function () { root.classList.remove('theme-animating'); }, 320);
    }
    applyTheme(t);
  }
  applyTheme(readTheme());

  function loadUiPrefs() {
    var defaults = { fontSize: 'normal', hideBalances: false, reduceMotion: false, highContrast: false };
    try {
      var value = JSON.parse(localStorage.getItem(UI_PREFS_KEY) || '{}');
      if (value && typeof value === 'object') {
        if (['small','normal','large'].indexOf(value.fontSize) >= 0) defaults.fontSize = value.fontSize;
        defaults.hideBalances = value.hideBalances === true;
        defaults.reduceMotion = value.reduceMotion === true;
        defaults.highContrast = value.highContrast === true;
      }
    } catch (e) { /* usa las preferencias seguras por defecto */ }
    return defaults;
  }
  var uiPrefs = loadUiPrefs();
  function applyUiPrefs() {
    var root = document.documentElement;
    root.setAttribute('data-font-size', uiPrefs.fontSize || 'normal');
    root.setAttribute('data-motion', uiPrefs.reduceMotion ? 'reduce' : 'system');
    root.setAttribute('data-contrast', uiPrefs.highContrast ? 'high' : 'normal');
    root.classList.toggle('privacy-hidden', !!uiPrefs.hideBalances);
  }
  function saveUiPrefs() {
    try { localStorage.setItem(UI_PREFS_KEY, JSON.stringify(uiPrefs)); } catch (e) { /* preferencia solo de esta sesión */ }
    applyUiPrefs();
  }
  function motionAllowed() {
    return !uiPrefs.reduceMotion && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* Imágenes: se recortan a cuadrado y se reducen para que pesen muy poco (sin subir archivos grandes). */
  function imageToDataUrl(file, size, type, quality) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type || '')) { reject(new Error('imagen')); return; }
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        try {
          var side = Math.min(img.naturalWidth, img.naturalHeight);
          if (!side) throw new Error('imagen');
          var c = document.createElement('canvas'); c.width = c.height = size;
          var ctx = c.getContext('2d');
          if (type === 'image/jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size, size); }
          ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
          var out = c.toDataURL(type, quality);
          URL.revokeObjectURL(url); resolve(out);
        } catch (e) { URL.revokeObjectURL(url); reject(new Error('imagen')); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('imagen')); };
      img.src = url;
    });
  }
  function imageBoundedDataUrl(file, maxSide, type, quality) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type || '')) { reject(new Error('imagen')); return; }
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        try {
          var w0 = img.naturalWidth, h0 = img.naturalHeight; if (!w0 || !h0) throw new Error('imagen');
          var scale = Math.min(1, maxSide / Math.max(w0, h0)), w = Math.max(1, Math.round(w0 * scale)), h = Math.max(1, Math.round(h0 * scale));
          var c = document.createElement('canvas'); c.width = w; c.height = h; var ctx = c.getContext('2d');
          if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
          ctx.drawImage(img, 0, 0, w, h); var out = c.toDataURL(type, quality); URL.revokeObjectURL(url); resolve(out);
        } catch (err) { URL.revokeObjectURL(url); reject(new Error('imagen')); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('imagen')); }; img.src = url;
    });
  }
  function safeImg(src) { return typeof src === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/.test(src) ? src : ''; }
  function pic(src, name, cls) {
    var ok = safeImg(src);
    return ok ? '<img class="pic ' + cls + '" alt="" src="' + ok + '">'
      : '<span class="pic ph ' + cls + '" aria-hidden="true">' + esc((String(name || '?').trim().charAt(0) || '?').toUpperCase()) + '</span>';
  }
  function normUser(u) { return String(u || '').trim().replace(/^@/, '').toLowerCase(); }
  function validUser(u) { return /^[a-z0-9_.]{3,20}$/.test(u); }

  var toastTimer = null;
  function toast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 5000);
  }
  function toastUndo(msg) {
    var el = document.getElementById('toast');
    el.innerHTML = esc(msg) + ' <button class="toast-undo" data-a="undo-tx">Deshacer</button>';
    el.hidden = false; clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 10000);
  }
  function registerUndoTx(tx) { undoLastTx = { id: tx.id, expiresAt: Date.now() + 10000 }; }
  async function undoLastCreatedTx() {
    if (!undoLastTx || Date.now() > undoLastTx.expiresAt) { undoLastTx = null; toast('Ya no hay una operación reciente para deshacer.'); return; }
    var id = undoLastTx.id; if (!S || !S.transactions.some(function (x) { return x.id === id; })) { undoLastTx = null; toast('Este movimiento ya no está disponible para deshacer.'); return; }
    var ok = await act(async function () { await B.removeTx(id); S.transactions = S.transactions.filter(function (x) { return x.id !== id; }); persist(); });
    if (ok) { undoLastTx = null; motionRefreshRequested = true; render(); toast('Movimiento deshecho.'); }
  }

  /* ---------- 5. Estado ---------- */
  var S = null;              // datos: accounts, categories, transactions, rate, displayCurrency
  var sb = null;             // cliente Supabase
  var user = null;           // usuario con sesión (solo en modo nube)
  var offline = false;       // true si se muestran datos guardados sin conexión
  var saveFailed = false;    // fallo al guardar en el navegador

  var DEFAULT_EXPENSE = ['Alimentación|🍽️', 'Transporte|🚌', 'Vivienda|🏠', 'Servicios|💡', 'Entretenimiento|🎬', 'Compras|🛍️', 'Salud|💊', 'Educación|📚', 'Suscripciones|🔁', 'Otros|🧩'];
  var DEFAULT_INCOME = ['Sueldo|💼', 'Freelance|🎨', 'Otros ingresos|➕'];
  function norm(d) {
    d.scheduled = d.scheduled || []; d.plans = d.plans || []; d.debts = d.debts || []; d.budgets = d.budgets || [];
    d.transfers = Array.isArray(d.transfers) ? d.transfers : []; d.goals = Array.isArray(d.goals) ? d.goals : []; d.rateHistory = Array.isArray(d.rateHistory) ? d.rateHistory : [];
    d.goalContributions = Array.isArray(d.goalContributions) ? d.goalContributions : [];
    d.familySpaces = Array.isArray(d.familySpaces) ? d.familySpaces : []; d.familyExpenses = Array.isArray(d.familyExpenses) ? d.familyExpenses : [];
    d.allocation = Object.assign({ invest: 10, enjoyment: 20, savings: 20, emergency: 10, needs: 40 }, d.allocation || {});
    if (!d.rateHistory.length && d.rate && Number(d.rate.rateE4) > 0) d.rateHistory.push({ rateE4: Number(d.rate.rateE4), source: d.rate.source || 'none', recordedAt: d.rate.updatedAt || new Date().toISOString() });
    d.prefs = d.prefs || { remindDays: 3 }; if (!(d.prefs.remindDays >= 0)) d.prefs.remindDays = 3;
    d.ref = d.ref || { eur: null, par: null };
    return d;
  }
  function initialData() { return norm(initialData0()); }
  function initialData0() {
    var now = new Date().toISOString(), cats = [];
    DEFAULT_EXPENSE.forEach(function (x, i) { var p = x.split('|'); cats.push({ id: uuid(), name: p[0], icon: p[1], kind: 'expense', sortOrder: i }); });
    DEFAULT_INCOME.forEach(function (x, i) { var p = x.split('|'); cats.push({ id: uuid(), name: p[0], icon: p[1], kind: 'income', sortOrder: i }); });
    return {
      version: 1,
      accounts: [['Efectivo Bs', 'VES'], ['Efectivo $', 'USD'], ['Banco 1', 'VES'], ['Banco 2', 'VES'], ['Binance', 'USD']].map(function (a) {
        return { id: uuid(), name: a[0], currency: a[1], openingMinor: 0, createdAt: now };
      }),
      categories: cats, transactions: [], transfers: [], goals: [], goalContributions: [], rateHistory: [], familySpaces: [], familyExpenses: [],
      allocation: { invest: 10, enjoyment: 20, savings: 20, emergency: 10, needs: 40 },
      rate: { rateE4: 0, updatedAt: null, source: 'none' },
      displayCurrency: 'VES'
    };
  }
  function valid(d) {
    return d && d.version === 1 && Array.isArray(d.accounts) && Array.isArray(d.categories) &&
      Array.isArray(d.transactions) && d.rate && (d.displayCurrency === 'VES' || d.displayCurrency === 'USD');
  }

  /* ---------- 6. Guardado local y caché ---------- */
  function readDisplay() { try { var v = localStorage.getItem(DISPLAY_KEY); return v === 'USD' ? 'USD' : 'VES'; } catch (e) { return 'VES'; } }
  function localStorageKey() { return demoMode ? DEMO_KEY : LOCAL_KEY; }
  function cacheKey() { return 'cuadre:cloud:cache:v1:' + (user ? user.id : 'x'); }
  function persist() {
    try {
      if (CLOUD) {
        localStorage.setItem(cacheKey(), JSON.stringify(S));
        localStorage.setItem(DISPLAY_KEY, S.displayCurrency);
      } else {
        localStorage.setItem(localStorageKey(), JSON.stringify(S));
      }
      try {
        if (CLOUD && user && !demoMode && !offline) localStorage.setItem(SYNC_KEY + ':' + user.id, new Date().toISOString());
        else if (!CLOUD && !demoMode) localStorage.setItem(SYNC_KEY + ':local', new Date().toISOString());
      } catch (eSync) { /* el estado de sincronización es informativo */ }
      saveFailed = false;
    } catch (e) { saveFailed = true; }
  }
  function localLoad() {
    var raw = null;
    try {
      raw = localStorage.getItem(localStorageKey());
      if (raw === null) return initialData();
      var d = JSON.parse(raw);
      if (valid(d)) return norm(d);
      throw new Error('formato');
    } catch (e) {
      try { if (raw !== null) localStorage.setItem(localStorageKey() + ':dañado', raw); } catch (e2) { /* nada */ }
      return initialData();
    }
  }
  function cacheLoad() {
    try { var d = JSON.parse(localStorage.getItem(cacheKey())); return valid(d) ? norm(d) : null; } catch (e) { return null; }
  }

  /* ---------- 7. Nube (Supabase) ---------- */
  function check(r) { if (r && r.error) throw r.error; return r; }

  async function fetchAll(table, orderCol, asc) {
    var out = [], from = 0, size = 1000;
    for (;;) {
      var r = check(await sb.from(table).select('*').order(orderCol, { ascending: asc }).order('id').range(from, from + size - 1));
      out = out.concat(r.data || []);
      if (!r.data || r.data.length < size) break;
      from += size;
    }
    return out;
  }
  async function loadFamilyData() {
    var empty = { spaces: [], expenses: [], missing: false };
    if (!CLOUD || !user) return empty;
    try {
      var memberships = check(await sb.from('family_members').select('space_id,role').eq('user_id', user.id)).data || [];
      var ids = memberships.map(function (m) { return m.space_id; }).filter(Boolean);
      if (!ids.length) return empty;
      var q1 = check(await sb.from('family_spaces').select('id,name,owner_id,created_at').in('id', ids).order('created_at', { ascending: true }));
      var q2 = check(await sb.from('family_expenses').select('*').in('space_id', ids).order('date', { ascending: false }).order('created_at', { ascending: false }).limit(1000));
      return {
        spaces: (q1.data || []).map(function (x) { var m = memberships.filter(function (z) { return z.space_id === x.id; })[0] || {}; return { id: x.id, name: x.name, ownerId: x.owner_id, role: m.role || 'member', createdAt: x.created_at }; }),
        expenses: (q2.data || []).map(function (x) { return { id: x.id, spaceId: x.space_id, createdBy: x.created_by, title: x.title, amountMinor: Number(x.amount_minor), currency: x.currency, category: x.category || '', paidBy: x.paid_by || '', dateISO: x.date, note: x.note || '', createdAt: x.created_at }; }),
        missing: false
      };
    } catch (e) {
      if (/schema cache|does not exist|Could not find|relation/i.test((e && e.message) || '')) return { spaces: [], expenses: [], missing: true };
      throw e;
    }
  }
  async function refreshFamilyData() {
    var f = await loadFamilyData();
    S.familySpaces = f.spaces; S.familyExpenses = f.expenses; S.familyMissing = f.missing;
    if (!selectedFamilyId()) activeFamilyId = S.familySpaces[0] ? S.familySpaces[0].id : '';
    persist();
  }
  async function cloudLoad() {
    var st = check(await sb.from('settings').select('*').maybeSingle());
    if (!st.data) {
      check(await sb.rpc('seed_defaults'));
      st = check(await sb.from('settings').select('*').maybeSingle());
    }
    var res = await Promise.all([
      fetchAll('accounts', 'created_at', true),
      fetchAll('categories', 'sort_order', true),
      fetchAll('transactions', 'created_at', false)
    ]);
    var s = st.data || {};
    var profile = await loadProfile();
    var ex = { scheduled: [], plans: [], debts: [], budgets: [], missing: false };
    try {
      var r2 = await Promise.all([fetchAll('scheduled_payments', 'created_at', true), fetchAll('installment_plans', 'created_at', true), fetchAll('debts', 'created_at', true), fetchAll('budgets', 'created_at', true)]);
      ex.scheduled = r2[0].map(function (x) { return { id: x.id, name: x.name, amountMinor: Number(x.amount_minor), currency: x.currency, categoryId: x.category_id, accountId: x.account_id, frequency: x.frequency, nextDue: x.next_due, anchorDay: x.anchor_day, remindDays: x.remind_days, active: !!x.active, createdAt: x.created_at }; });
      ex.plans = r2[1].map(function (x) { return { id: x.id, name: x.name, totalMinor: Number(x.total_minor), currency: x.currency, count: x.installments, paidCount: x.paid_count, frequency: x.frequency, firstDue: x.first_due, anchorDay: x.anchor_day, categoryId: x.category_id, accountId: x.account_id, remindDays: x.remind_days, createdAt: x.created_at }; });
      ex.debts = r2[2].map(function (x) { return { id: x.id, kind: x.kind, person: x.person, note: x.note || '', totalMinor: Number(x.total_minor), paidMinor: Number(x.paid_minor), currency: x.currency, dueDate: x.due_date, remindDays: x.remind_days, createdAt: x.created_at }; });
      ex.budgets = r2[3].map(function (x) { return { id: x.id, categoryId: x.category_id, limitMinor: Number(x.limit_minor), currency: x.currency, createdAt: x.created_at }; });
    } catch (e1) {
      if (/schema cache|does not exist|Could not find|relation/i.test((e1 && e1.message) || '')) ex.missing = true; else throw e1;
    }
    var financeExtras = { transfers: [], goals: [], rateHistory: [], goalContributions: [] };
    try {
      var r3 = await Promise.all([fetchAll('account_transfers', 'created_at', true), fetchAll('savings_goals', 'created_at', true), fetchAll('exchange_rate_history', 'recorded_at', true), fetchAll('goal_contributions', 'created_at', true)]);
      financeExtras.transfers = r3[0].map(function (x) { return { id: x.id, fromAccountId: x.from_account_id, toAccountId: x.to_account_id, fromAmountMinor: Number(x.from_amount_minor), toAmountMinor: Number(x.to_amount_minor), fromCurrency: x.from_currency, toCurrency: x.to_currency, rateE4: Number(x.rate_e4 || 0), dateISO: x.date, note: x.note || '', createdAt: x.created_at }; });
      financeExtras.goals = r3[1].map(function (x) { return { id: x.id, name: x.name, targetMinor: Number(x.target_minor), savedMinor: Number(x.saved_minor), currency: x.currency, dueDate: x.due_date || '', note: x.note || '', createdAt: x.created_at }; });
      financeExtras.rateHistory = r3[2].map(function (x) { return { id: x.id, rateE4: Number(x.rate_e4), source: x.source, recordedAt: x.recorded_at }; });
      financeExtras.goalContributions = r3[3].map(function (x) { return { id: x.id, goalId: x.goal_id, amountMinor: Number(x.amount_minor), currency: x.currency, dateISO: x.date, note: x.note || '', createdAt: x.created_at }; });
    } catch (e3) {
      if (/schema cache|does not exist|Could not find|relation/i.test((e3 && e3.message) || '')) ex.missing = true; else throw e3;
    }
    if (!financeExtras.rateHistory.length && Number(s.rate_e4) > 0 && s.rate_updated_at) financeExtras.rateHistory.push({ rateE4: Number(s.rate_e4), source: s.rate_source || 'none', recordedAt: s.rate_updated_at });
    var family = await loadFamilyData();
    return {
      version: 1,
      profile: profile, scheduled: ex.scheduled, plans: ex.plans, debts: ex.debts, budgets: ex.budgets, transfers: financeExtras.transfers, goals: financeExtras.goals, goalContributions: financeExtras.goalContributions, rateHistory: financeExtras.rateHistory, extrasMissing: ex.missing,
      allocation: { invest: Number(s.alloc_invest == null ? 10 : s.alloc_invest), enjoyment: Number(s.alloc_enjoyment == null ? 20 : s.alloc_enjoyment), savings: Number(s.alloc_savings == null ? 20 : s.alloc_savings), emergency: Number(s.alloc_emergency == null ? 10 : s.alloc_emergency), needs: Number(s.alloc_needs == null ? 40 : s.alloc_needs) },
      prefs: { remindDays: Number.isInteger(s.remind_days) ? s.remind_days : 3 },
      ref: { eur: Number(s.eur_rate_e4) > 0 ? { rateE4: Number(s.eur_rate_e4), updatedAt: s.eur_updated_at || null } : null, par: Number(s.par_rate_e4) > 0 ? { rateE4: Number(s.par_rate_e4), updatedAt: s.par_updated_at || null } : null },
      accounts: res[0].map(function (a) { return { id: a.id, name: a.name, currency: a.currency, openingMinor: Number(a.opening_minor), createdAt: a.created_at, logo: safeImg(a.logo) }; }),
      categories: res[1].map(function (c) { return { id: c.id, name: c.name, icon: c.icon, kind: c.kind, sortOrder: c.sort_order }; }),
      transactions: res[2].map(function (t) {
        return { id: t.id, type: t.type, amountMinor: Number(t.amount_minor), currency: t.currency, rateE4: Number(t.rate_e4),
          categoryId: t.category_id, accountId: t.account_id, note: t.note || '', dateISO: t.date, createdAt: t.created_at, updatedAt: t.updated_at, split: Array.isArray(t.split) ? t.split : null, receiptImage: safeImg(t.receipt_image) };
      }),
      rate: { rateE4: Number(s.rate_e4 || 0), updatedAt: s.rate_updated_at || null, source: s.rate_source || 'none' },
      familySpaces: family.spaces, familyExpenses: family.expenses, familyMissing: family.missing,
      displayCurrency: readDisplay()
    };
  }
  /* Perfil (usuario y foto). Si falta la tabla, la app sigue funcionando y avisa en la pantalla de perfil. */
  async function loadProfile() {
    try {
      var pr = check(await sb.from('profiles').select('*').maybeSingle());
      if (!pr.data) {
        var un = normUser(user && user.user_metadata && user.user_metadata.username), row = { user_id: user.id, username: validUser(un) ? un : null };
        try { check(await sb.from('profiles').insert(row)); }
        catch (e1) { if (row.username) { row.username = null; try { check(await sb.from('profiles').insert(row)); } catch (e2) { /* sin perfil por ahora */ } } }
        pr = check(await sb.from('profiles').select('*').maybeSingle());
      }
      var d = pr.data || {};
      return { available: true, username: d.username || '', avatar: safeImg(d.avatar) };
    } catch (e) {
      if (/Failed to fetch|NetworkError|Load failed/i.test((e && e.message) || '')) throw e;
      return { available: false, username: '', avatar: '' };
    }
  }
  function txRow(t) { var r = txRow0(t); if (t.split) r.split = t.split; return r; }
  function txRow0(t) {
    return { id: t.id, user_id: user.id, type: t.type, amount_minor: t.amountMinor, currency: t.currency, rate_e4: t.rateE4,
      category_id: t.categoryId, account_id: t.accountId, note: t.note, date: t.dateISO, created_at: t.createdAt, updated_at: t.updatedAt, receipt_image: safeImg(t.receiptImage) || null };
  }
  function accRow(a) {
    var r = { id: a.id, user_id: user.id, name: a.name, currency: a.currency, opening_minor: a.openingMinor, created_at: a.createdAt };
    if (a.logo) r.logo = a.logo;
    return r;
  }
  function catRow(c) { return { id: c.id, user_id: user.id, name: c.name, icon: c.icon, kind: c.kind, sort_order: c.sortOrder }; }
  function transferRow(t) { return { id: t.id, user_id: user.id, from_account_id: t.fromAccountId, to_account_id: t.toAccountId, from_amount_minor: t.fromAmountMinor, to_amount_minor: t.toAmountMinor, from_currency: t.fromCurrency, to_currency: t.toCurrency, rate_e4: t.rateE4 || 0, date: t.dateISO, note: t.note || '', created_at: t.createdAt }; }
  function goalRow(g) { return { id: g.id, user_id: user.id, name: g.name, target_minor: g.targetMinor, saved_minor: g.savedMinor, currency: g.currency, due_date: g.dueDate || null, note: g.note || '', created_at: g.createdAt }; }

  /* Operaciones de escritura. En modo local no hacen nada (se guarda con persist()). */
  var B = {
    saveTx: async function (t) { if (CLOUD) check(await sb.from('transactions').upsert(txRow(t))); },
    removeTx: async function (id) { if (CLOUD) check(await sb.from('transactions').delete().eq('id', id)); },
    saveTransfer: async function (t) { if (CLOUD) check(await sb.from('account_transfers').upsert(transferRow(t))); },
    removeTransfer: async function (id) { if (CLOUD) check(await sb.from('account_transfers').delete().eq('id', id)); },
    saveGoal: async function (g) { if (CLOUD) check(await sb.from('savings_goals').upsert(goalRow(g))); },
    saveGoalContribution: async function (c) { if (CLOUD) check(await sb.rpc('contribute_to_goal', { p_goal_id: c.goalId, p_amount_minor: c.amountMinor, p_date: c.dateISO, p_note: c.note || '' })); },
    importGoalContributionRecord: async function (c) { if (CLOUD) check(await sb.from('goal_contributions').insert({ id: c.id, user_id: user.id, goal_id: c.goalId, amount_minor: c.amountMinor, currency: c.currency, date: c.dateISO, note: c.note || '', created_at: c.createdAt })); },
    saveFamilyExpense: async function (e) { if (CLOUD) check(await sb.from('family_expenses').insert({ id: e.id, space_id: e.spaceId, created_by: user.id, title: e.title, amount_minor: e.amountMinor, currency: e.currency, category: e.category || '', paid_by: e.paidBy || '', date: e.dateISO, note: e.note || '', created_at: e.createdAt })); },
    removeFamilyExpense: async function (id) { if (CLOUD) check(await sb.from('family_expenses').delete().eq('id', id)); },
    savePushSubscription: async function (sub) { if (CLOUD) check(await sb.from('push_subscriptions').upsert({ user_id: user.id, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, expiration_time: sub.expirationTime || null, updated_at: new Date().toISOString() }, { onConflict: 'endpoint' })); },
    removePushSubscription: async function (endpoint) { if (CLOUD) check(await sb.from('push_subscriptions').delete().eq('endpoint', endpoint).eq('user_id', user.id)); },
    removeGoal: async function (id) { if (CLOUD) check(await sb.from('savings_goals').delete().eq('id', id)); },
    saveAllocation: async function (a) { if (CLOUD) check(await sb.from('settings').upsert({ user_id: user.id, alloc_invest: a.invest, alloc_enjoyment: a.enjoyment, alloc_savings: a.savings, alloc_emergency: a.emergency, alloc_needs: a.needs, updated_at: new Date().toISOString() })); },
    saveAccount: async function (id, fields) { if (CLOUD) check(await sb.from('accounts').update(fields).eq('id', id)); },
    saveProfile: async function (p) {
      if (!CLOUD) return;
      try { check(await sb.from('profiles').upsert({ user_id: user.id, username: p.username || null, avatar: p.avatar || null, updated_at: new Date().toISOString() })); }
      catch (e) {
        if (/duplicate key|unique/i.test((e && e.message) || '')) throw new Error('Ese usuario ya está en uso. Prueba con otro.');
        if (/schema cache|does not exist|relation/i.test((e && e.message) || '')) throw new Error('Falta actualizar la base de datos: ejecuta schema.sql completo en Supabase.');
        throw e;
      }
    },
    addAccounts: async function (list) { if (CLOUD && list.length) check(await sb.from('accounts').insert(list.map(accRow))); },
    addCategories: async function (list) { if (CLOUD && list.length) check(await sb.from('categories').insert(list.map(catRow))); },
    removeCategory: async function (id) { if (CLOUD) check(await sb.from('categories').delete().eq('id', id)); },
    addTxs: async function (list) {
      if (!CLOUD) return;
      for (var i = 0; i < list.length; i += 500) check(await sb.from('transactions').insert(list.slice(i, i + 500).map(txRow)));
    },
    upsertRow: async function (table, row) { if (CLOUD) check(await sb.from(table).upsert(row)); },
    delRow: async function (table, id) { if (CLOUD) check(await sb.from(table).delete().eq('id', id)); },
    saveRefRates: async function (r) {
      if (!CLOUD) return;
      check(await sb.from('settings').upsert({ user_id: user.id, eur_rate_e4: r.eur ? r.eur.rateE4 : 0, eur_updated_at: r.eur ? r.eur.updatedAt : null, par_rate_e4: r.par ? r.par.rateE4 : 0, par_updated_at: r.par ? r.par.updatedAt : null, updated_at: new Date().toISOString() }));
    },
    saveRemind: async function (n) { if (CLOUD) check(await sb.from('settings').upsert({ user_id: user.id, remind_days: n, updated_at: new Date().toISOString() })); },
    saveRate: async function (r) {
      if (!CLOUD) return;
      check(await sb.from('settings').upsert({ user_id: user.id, rate_e4: r.rateE4, rate_updated_at: r.updatedAt, rate_source: r.source, updated_at: new Date().toISOString() }));
      check(await sb.from('exchange_rate_history').insert({ user_id: user.id, rate_e4: r.rateE4, source: r.source || 'manual', recorded_at: r.updatedAt || new Date().toISOString() }));
    }
  };

  /* Ejecuta una escritura: avisa si falla y no cambia nada en pantalla si falló. */
  async function act(fn) {
    if (offline) { toast('Sin conexión: por ahora solo puedes mirar tus datos.'); return false; }
    try { await fn(); return true; } catch (e) { toast(humanError(e)); return false; }
  }

  /* ---------- 8b. Pagos, cuotas, deudas, presupuestos y avisos ---------- */
  var FREQ = { weekly: 'Cada semana', biweekly: 'Cada 14 días', monthly: 'Cada mes', yearly: 'Cada año' };
  function dim(y, m) { return new Date(y, m, 0).getDate(); }
  function addMonths(s, n, anchor) {
    var a = s.split('-').map(Number), t = a[1] - 1 + n, y = a[0] + Math.floor(t / 12), m = ((t % 12) + 12) % 12;
    return y + '-' + p2(m + 1) + '-' + p2(Math.min(anchor || a[2], dim(y, m + 1)));
  }
  function nthDue(first, freq, anchor, k) {
    if (freq === 'weekly') return addDays(first, 7 * k);
    if (freq === 'biweekly') return addDays(first, 14 * k);
    if (freq === 'yearly') return addMonths(first, 12 * k, anchor);
    return addMonths(first, k, anchor);
  }
  function nextAfter(s, freq, anchor) { return nthDue(s, freq, anchor, 1); }
  function daysBetween(a, b) {
    var x = a.split('-').map(Number), y = b.split('-').map(Number);
    return Math.round((Date.UTC(y[0], y[1] - 1, y[2]) - Date.UTC(x[0], x[1] - 1, x[2])) / 86400000);
  }
  function planAmount(p, k) { var base = Math.floor(p.totalMinor / p.count); return k === p.count - 1 ? p.totalMinor - base * (p.count - 1) : base; }
  function planDue(p) { return nthDue(p.firstDue, p.frequency, p.anchorDay, p.paidCount); }
  function remindOf(it) { return it.remindDays != null ? it.remindDays : S.prefs.remindDays; }
  function dueLabel(d) {
    var n = daysBetween(today(), d);
    if (n < 0) return 'Venció hace ' + (-n) + (n === -1 ? ' día' : ' días') + ' · ' + shortDate(d);
    if (n === 0) return 'Vence hoy';
    if (n === 1) return 'Vence mañana';
    return 'En ' + n + ' días · ' + shortDate(d);
  }
  function levelOf(due, remind) {
    var n = daysBetween(today(), due);
    return n < 0 ? 'late' : n === 0 ? 'today' : n <= remind ? 'soon' : 'later';
  }
  function myMinor(t) { return t.split ? t.amountMinor - t.split.reduce(function (n, x) { return n + x.shareMinor; }, 0) : t.amountMinor; }
  function debtLeft(d) { return d.totalMinor - d.paidMinor; }
  /* Todo lo que vence: pagos programados, cuota siguiente de cada compra y deudas con fecha. */
  function agenda() {
    var items = [];
    S.scheduled.forEach(function (x) {
      if (!x.active) return;
      items.push({ kind: 'sch', act: 'pay-sch', id: x.id, icon: '🔁', title: x.name, amount: x.amountMinor, currency: x.currency, due: x.nextDue, level: levelOf(x.nextDue, remindOf(x)) });
    });
    S.plans.forEach(function (p) {
      if (p.paidCount >= p.count) return;
      var due = planDue(p);
      items.push({ kind: 'plan', act: 'pay-plan', id: p.id, icon: '🛍️', title: p.name + ' · cuota ' + (p.paidCount + 1) + '/' + p.count, amount: planAmount(p, p.paidCount), currency: p.currency, due: due, level: levelOf(due, remindOf(p)) });
    });
    S.debts.forEach(function (d) {
      if (!d.dueDate || debtLeft(d) <= 0) return;
      items.push({ kind: 'debt', act: 'edit-debt', id: d.id, icon: d.kind === 'owe' ? '💸' : '🤝', title: (d.kind === 'owe' ? 'Pagar a ' : 'Cobrar a ') + d.person, amount: debtLeft(d), currency: d.currency, due: d.dueDate, level: levelOf(d.dueDate, remindOf(d)) });
    });
    return items.sort(function (a, b) { return a.due.localeCompare(b.due); });
  }
  function urgent() { return agenda().filter(function (i) { return i.level !== 'later'; }); }
  function pendingShares() {
    var out = [];
    S.transactions.forEach(function (t) {
      if (t.split) t.split.forEach(function (x, i) { if (!x.settled) out.push({ tx: t, idx: i, name: x.name, shareMinor: x.shareMinor, currency: t.currency }); });
    });
    return out;
  }
  function toDisp(minor, cur, disp) { return cur === disp ? minor : S.rate.rateE4 > 0 ? convert(minor, cur, disp, S.rate.rateE4) : 0; }
  function debtTotals(disp) {
    var owe = 0, owed = 0;
    S.debts.forEach(function (d) { var v = toDisp(debtLeft(d), d.currency, disp); if (d.kind === 'owe') owe += v; else owed += v; });
    pendingShares().forEach(function (p) { owed += toDisp(p.shareMinor, p.currency, disp); });
    return { owe: owe, owed: owed };
  }
  function budgetSpent(b) {
    var month = today().slice(0, 7), sum = 0;
    S.transactions.forEach(function (t) {
      if (t.type === 'expense' && t.categoryId === b.categoryId && t.dateISO.slice(0, 7) === month) sum += convert(myMinor(t), t.currency, b.currency, t.rateE4);
    });
    return sum;
  }
  function monthDayInfo(dateStr) {
    var a = String(dateStr || today()).split('-').map(Number), now = new Date(a[0], a[1] - 1, a[2]);
    return { day: a[2], days: dim(a[0], a[1]), month: a[0] + '-' + p2(a[1]) };
  }
  function budgetPace(b) {
    var spent = budgetSpent(b), mi = monthDayInfo(today()), projected = Math.round(spent / Math.max(1, mi.day) * mi.days), expected = b.limitMinor * mi.day / mi.days;
    return { spent: spent, projected: projected, expected: expected, pct: b.limitMinor > 0 ? spent / b.limitMinor : 0, projectedPct: b.limitMinor > 0 ? projected / b.limitMinor : 0, ahead: spent > expected * 1.12 && mi.day < mi.days };
  }
  function reservedGoalTotal(disp) {
    return (S.goals || []).reduce(function (sum, g) { return sum + toDisp(g.savedMinor, g.currency, disp); }, 0);
  }
  function obligationsWithin(days, disp) {
    var end = addDays(today(), days), total = 0, start = today();
    (S.scheduled || []).forEach(function (x) {
      if (!x.active || !x.nextDue || !FREQ[x.frequency]) return;
      var due = x.nextDue, guard = 0;
      while (due < start && guard++ < 120) due = nextAfter(due, x.frequency, x.anchorDay);
      guard = 0;
      while (due >= start && due <= end && guard++ < 120) { total += toDisp(x.amountMinor, x.currency, disp); due = nextAfter(due, x.frequency, x.anchorDay); }
    });
    (S.plans || []).forEach(function (x) {
      if (x.paidCount >= x.count) return;
      var due = planDue(x); if (due >= start && due <= end) total += toDisp(planAmount(x, x.paidCount), x.currency, disp);
    });
    (S.debts || []).forEach(function (d) {
      if (d.kind !== 'owe' || !d.dueDate || debtLeft(d) <= 0) return;
      if (d.dueDate >= start && d.dueDate <= end) total += toDisp(debtLeft(d), d.currency, disp);
    });
    return total;
  }
  function availablePlan(disp) {
    var balanceTotal = totalAvailable(disp), goals = reservedGoalTotal(disp), due = obligationsWithin(30, disp);
    return { balance: balanceTotal, goalsReserved: goals, obligations30: due, available: balanceTotal - goals - due };
  }
  function monthForecast(disp) {
    var month = today().slice(0, 7), info = monthDayInfo(today()), summary = monthSummary(month, disp), remaining = Math.max(0, info.days - info.day);
    var dailyNet = (summary.inc - summary.exp) / Math.max(1, info.day);
    return { currentNet: summary.inc - summary.exp, dailyNet: dailyNet, remainingDays: remaining, projectedChange: Math.round(dailyNet * remaining), projectedBalance: totalAvailable(disp) + Math.round(dailyNet * remaining), sampleDays: info.day };
  }
  /* Avisos del teléfono: se muestran al abrir la app (no hay servidor que avise con la app cerrada). */
  function notifyEnabled() { try { return localStorage.getItem('cuadre:notify') === '1' && 'Notification' in window && Notification.permission === 'granted'; } catch (e) { return false; } }
  async function notifyOnOpen() {
    if (!notifyEnabled()) return;
    var seen = {};
    try { seen = JSON.parse(localStorage.getItem('cuadre:notified') || '{}'); } catch (e) { seen = {}; }
    var t0 = today(), fresh = {};
    Object.keys(seen).forEach(function (k) { if (seen[k] === t0) fresh[k] = t0; });
    var list = urgent().filter(function (i) { return !fresh[i.kind + i.id + i.due + i.level]; }).slice(0, 4);
    for (var i = 0; i < list.length; i++) {
      var it = list[i], title = it.level === 'late' ? 'Pago vencido' : it.level === 'today' ? 'Vence hoy' : 'Pago próximo';
      var body = it.title + ' · ' + fmt(it.amount, it.currency) + ' · ' + dueLabel(it.due), opts = { body: body, tag: it.kind + it.id, icon: 'icons/icon-192.png' };
      try {
        var reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
        if (reg && reg.showNotification) await reg.showNotification(title, opts); else new Notification(title, opts);
        fresh[it.kind + it.id + it.due + it.level] = t0;
      } catch (e) { /* si el navegador no deja, no pasa nada */ }
    }
    try { localStorage.setItem('cuadre:notified', JSON.stringify(fresh)); } catch (e) { /* nada */ }
  }

  /* ---------- 8. Cálculos ---------- */
  function balance(a) {
    var b = a.openingMinor;
    S.transactions.forEach(function (t) { if (t.accountId === a.id) { b += t.type === 'income' ? t.amountMinor : -t.amountMinor; if (t.split) t.split.forEach(function (x) { if (x.settled) b += x.shareMinor; }); } });
    (S.transfers || []).forEach(function (t) { if (t.fromAccountId === a.id) b -= Number(t.fromAmountMinor || 0); if (t.toAccountId === a.id) b += Number(t.toAmountMinor || 0); });
    return b;
  }
  function totalAvailable(disp) {
    var tot = 0;
    S.accounts.forEach(function (a) {
      var b = balance(a);
      if (a.currency === disp) tot += b; else if (S.rate.rateE4 > 0) tot += convert(b, a.currency, disp, S.rate.rateE4);
    });
    return tot;
  }
  function monthSummary(month, disp) {
    var inc = 0, exp = 0, by = {};
    S.transactions.forEach(function (t) {
      if (t.dateISO.slice(0, 7) !== month) return;
      var v = convert(t.type === 'income' ? t.amountMinor : myMinor(t), t.currency, disp, t.rateE4);
      if (t.type === 'income') inc += v; else { exp += v; by[t.categoryId] = (by[t.categoryId] || 0) + v; }
    });
    var top = Object.keys(by).map(function (k) { return { id: k, total: by[k] }; }).sort(function (a, b) { return b.total - a.total; });
    return { inc: inc, exp: exp, top: top };
  }
  function sorted() {
    return S.transactions.slice().sort(function (a, b) {
      return a.dateISO === b.dateISO ? b.createdAt.localeCompare(a.createdAt) : b.dateISO.localeCompare(a.dateISO);
    });
  }
  function catById(id) { return S.categories.filter(function (c) { return c.id === id; })[0]; }
  function accById(id) { return S.accounts.filter(function (a) { return a.id === id; })[0]; }

  /* ---------- 9. Vistas ---------- */
  var tab = 'home', sub = 'menu', query = '', filter = 'all', sheet = null, msg = null, topMsg = null, rateErr = null;
  var universalQuery = '', calendarMonth = today().slice(0, 7);
  var homePrefs = (function(){ try { return Object.assign({ compact: false, showTips: true }, JSON.parse(localStorage.getItem(HOME_PREFS_KEY) || '{}')); } catch(e) { return { compact:false, showTips:true }; } })();
  var favoriteIds = (function(){ try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]').filter(function(x){return typeof x === 'string';}); } catch(e) { return []; } })();
  function saveHomePrefs(){ try { localStorage.setItem(HOME_PREFS_KEY, JSON.stringify(homePrefs)); } catch(e){} }
  function saveFavorites(){ try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favoriteIds)); } catch(e){} }
  var busy = false, msgOk = false, newAccCur = 'VES', newCatKind = 'expense', authMode = 'login', authMsg = null, authBusy = false;
  var arm = null, editAcc = null, profDraft = null, authDraft = { email: '', username: '' };
  var quickActionsOpen = false, lastMotionViewKey = null, motionResetTimer = null, themeResetTimer = null, heroAnimationFrame = null, motionRefreshRequested = false;
  var onboardingState = null, showAvailableExplanation = false, undoLastTx = null;
  var $app = document.getElementById('app'), $nav = document.getElementById('nav'), $navwrap = document.getElementById('navwrap'), $sheet = document.getElementById('sheet'), $quickActions = document.getElementById('quick-actions');

  function rateChip() {
    var r = S.rate.rateE4;
    return '<button class="chip-rate" data-a="goto-rate" aria-label="Ver tasa del dólar">' + (r > 0 ? '$ 1 = Bs ' + fmtRate(r) : 'Define la tasa') + '</button>';
  }
  function txRow2(t) {
    var c = catById(t.categoryId), a = accById(t.accountId), other = t.currency === 'USD' ? 'VES' : 'USD', pos = t.type === 'income';
    var title = t.note || (c ? c.name : 'Sin categoría');
    var sub2 = t.note ? (c ? c.name : 'Sin categoría') : (a ? a.name : 'Sin cuenta');
    var fav = favoriteIds.indexOf(t.id) >= 0;
    return '<div class="tx-row-wrap"><button class="tx" data-a="edit" data-id="' + esc(t.id) + '">' +
      '<span class="ico" aria-hidden="true">' + (c ? esc(c.icon) : '❔') + '</span>' +
      '<span class="mid"><b>' + esc(title) + '</b><span>' + esc(sub2) + ' · ' + shortDate(t.dateISO) + (t.split ? ' · 👥' : '') + (t.receiptImage ? ' · 🧾' : '') + '</span></span>' +
      '<span class="amt"><b class="' + (pos ? 'pos' : '') + '">' + (pos ? '+' : '-') + fmt(t.amountMinor, t.currency) + '</b>' +
      '<span>≈ ' + fmt(convert(t.amountMinor, t.currency, other, t.rateE4), other) + '</span></span></button>' +
      '<button class="tx-fav" data-a="favorite-tx" data-id="' + esc(t.id) + '" aria-label="' + (fav ? 'Quitar de favoritos' : 'Marcar como favorito') + '" aria-pressed="' + fav + '">' + (fav ? '★' : '☆') + '</button></div>';
  }

  function banners() {
    var h = '';
    if (demoMode) h += '<div class="banner demo-banner" role="status">🧪 Modo demostración: estos son datos ficticios y están separados de tus finanzas. <button class="retry" data-a="exit-demo">Salir de la demostración</button></div>';
    if (offline) h += '<div class="banner">Sin conexión: ves tus últimos datos guardados y no puedes hacer cambios.<button class="retry" data-a="retry">Reintentar</button></div>';
    if (saveFailed) h += '<div class="banner bad">No se pudo guardar una copia en este dispositivo. Revisa que el navegador permita guardar datos.</div>';
    return h;
  }
  function syncStatusHtml() {
    if (demoMode) return '<div class="sync-status" role="status"><span class="sync-dot demo-dot"></span>Entorno de ejemplo · no se modifica tu información real</div>';
    if (offline) return '<div class="sync-status offline-status" role="status"><span class="sync-dot"></span>Sin conexión · se muestran datos guardados</div>';
    var key = CLOUD && user ? SYNC_KEY + ':' + user.id : SYNC_KEY + ':local', raw = '';
    try { raw = localStorage.getItem(key) || ''; } catch (e) {}
    if (CLOUD && user) {
      var when = raw ? new Date(raw).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' }) : 'sesión activa';
      return '<div class="sync-status" role="status"><span class="sync-dot"></span>Cuenta en la nube · copia local actualizada ' + esc(when) + '</div>';
    }
    var localWhen = raw ? new Date(raw).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' }) : 'aún sin cambios';
    return '<div class="sync-status" role="status"><span class="sync-dot local-dot"></span>Guardado en este dispositivo · ' + esc(localWhen) + '</div>';
  }
  function tipCardHtml() {
    var dismissed = false, focus = 'control'; try { dismissed = localStorage.getItem('cuadre:tip:transferencias:v1') === '1'; focus = localStorage.getItem('cuadre:onboarding:focus:' + (user ? user.id : 'local')) || 'control'; } catch (e) {}
    if (dismissed || demoMode || !homePrefs.showTips) return '';
    var text = focus === 'saving' ? 'Una meta reserva una parte de tu dinero para un objetivo, pero no mueve fondos ni crea un gasto.' : focus === 'bills' ? 'Registrar una factura con vencimiento te ayuda a anticiparte; revisa Pagos para ver lo que vence pronto.' : 'Mover dinero entre tus propias cuentas es una transferencia, no un ingreso ni un gasto.';
    return '<div class="helper-tip"><div class="helper-tip-icon" aria-hidden="true">💡</div><div class="helper-tip-content"><b>Consejo de Cuadre</b><div class="muted">' + esc(text) + '</div><button class="linkbtn plain" data-a="sub" data-v="help">Ver guía rápida</button></div><button class="tip-dismiss" data-a="dismiss-tip" aria-label="Ocultar consejo">×</button></div>';
  }

  /* Eliminar con doble paso: primero se pulsa el botón y luego se desliza para confirmar. */
  function showSlide() { var sl = document.querySelector('.slide'); if (sl && sl.scrollIntoView) sl.scrollIntoView({ block: 'center' }); }
  function slideHtml(kind, id, hint) {
    return '<div class="slidebox">' + (hint ? '<div class="muted">' + hint + '</div>' : '') +
      '<div class="slide" data-kind="' + kind + '" data-id="' + esc(id) + '"><i class="slide-fill"></i><span class="slide-txt">Desliza para eliminar</span>' +
      '<button type="button" class="slide-thumb" aria-label="Deslizar para confirmar la eliminación. Con teclado, pulsa Enter.">›</button></div>' +
      '<button class="linkbtn plain" data-a="cancel-del">Cancelar</button></div>';
  }

  function viewHome() {
    var disp = S.displayCurrency, other = disp === 'VES' ? 'USD' : 'VES', rate = S.rate.rateE4;
    var month = today().slice(0, 7), sum = monthSummary(month, disp), total = totalAvailable(disp);
    var recent = sorted().slice(0, 5), h = '';
    h += '<div class="top"><div class="brand">Cuadre</div><div class="topr">' + rateChip() +
      (CLOUD && user ? '<button class="avbtn" data-a="goto-profile" aria-label="Mi perfil">' + pic(S.profile && S.profile.avatar, (S.profile && S.profile.username) || user.email, 'sm') + '</button>' : '') + '</div></div>' + banners() + syncStatusHtml() + tipCardHtml();
    if (rate <= 0) h += '<div class="banner">Aún no hay tasa del dólar. Toca el botón de arriba para definirla.</div>';
    var urg = urgent(), firm = urg.filter(function (i) { return i.level === 'late' || i.level === 'today'; });
    if (firm.length) h += '<button class="banner bad firm" data-a="goto-pay">⚠️ ' + (firm.length === 1 ? 'Atención: ' : 'Atención, ' + firm.length + ' pagos: ') + firm.slice(0, 2).map(function (i) { return esc(i.title) + (i.level === 'late' ? ' (vencido)' : ' (vence hoy)'); }).join(' · ') + (firm.length > 2 ? ' y más' : '') + '</button>';
    h += '<div class="seg" role="group" aria-label="Moneda a mostrar"><button data-a="disp" data-v="VES" aria-pressed="' + (disp === 'VES') + '">Bs</button><button data-a="disp" data-v="USD" aria-pressed="' + (disp === 'USD') + '">$</button></div>';
    var plan = availablePlan(disp), forecast = monthForecast(disp);
    h += '<div class="card"><div class="label">Saldo total</div><div class="hero">' + fmt(total, disp) + '</div>' +
      (rate > 0 ? '<div class="muted">≈ ' + fmt(convert(total, disp, other, rate), other) + '</div>' : '') +
      '<div class="dividerline" style="height:1px;background:var(--line);margin:8px 0"></div><div class="row"><span class="muted">Metas reservadas</span><span>' + fmt(plan.goalsReserved, disp) + '</span></div>' +
      '<div class="row"><span class="muted">Pagos próximos · 30 días</span><span>' + fmt(plan.obligations30, disp) + '</span></div><div class="row"><b>Disponible estimado para gastar</b><b class="' + (plan.available < 0 ? '' : 'pos') + '">' + fmt(plan.available, disp) + '</b></div>' +
      '<div class="muted">Estimación: saldo menos metas reservadas y obligaciones próximas. Las reservas no mueven dinero entre cuentas.</div>' +
      '<button class="linkbtn plain calc-toggle" data-a="toggle-available-help" aria-expanded="' + showAvailableExplanation + '">' + (showAvailableExplanation ? 'Ocultar cómo se calcula' : '¿Cómo se calcula?') + '</button>' +
      (showAvailableExplanation ? '<div class="calc-breakdown"><b>Cómo interpreta Cuadre tu dinero</b><div class="row"><span>Saldo convertido a ' + (disp === 'USD' ? 'dólares' : 'bolívares') + '</span><span>' + fmt(plan.balance, disp) + '</span></div><div class="row"><span>Metas reservadas</span><span>− ' + fmt(plan.goalsReserved, disp) + '</span></div><div class="row"><span>Obligaciones de los próximos 30 días</span><span>− ' + fmt(plan.obligations30, disp) + '</span></div><div class="row calc-result"><b>Disponible estimado</b><b>' + fmt(plan.available, disp) + '</b></div><div class="muted">Es una estimación de planificación, no un bloqueo de fondos ni un saldo bancario en tiempo real. Los importes en otra moneda dependen de la tasa que tenga Cuadre guardada.</div></div>' : '') + '</div>';
    if (!homePrefs.compact) h += '<div class="card" data-home-widget="projection"><div class="label">Proyección al cierre del mes</div><div class="num">' + fmt(forecast.projectedBalance, disp) + '</div><div class="muted">Si mantienes el promedio neto diario de este mes: ' + (forecast.projectedChange >= 0 ? '+' : '−') + fmt(Math.abs(forecast.projectedChange), disp) + ' estimados en los ' + forecast.remainingDays + ' días restantes. Calculado con ' + forecast.sampleDays + ' día(s) de datos; no es una garantía.</div></div>';
    if (!homePrefs.compact) h += '<div class="card" data-home-widget="monthly-summary"><div class="label">' + monthLabel(month) + '</div><div class="row"><div class="col"><span class="muted">Ingresos</span><span class="num pos">' + fmt(sum.inc, disp) +
      '</span></div><div class="col" style="text-align:right"><span class="muted">Gastos</span><span class="num" style="color:var(--expense)">' + fmt(sum.exp, disp) + '</span></div></div>' +
      '<div class="muted">' + (sum.inc - sum.exp >= 0 ? 'Te queda a favor' : 'Gastaste de más') + ': ' + fmt(Math.abs(sum.inc - sum.exp), disp) + '</div></div>';
    if (sum.top.length) {
      h += '<div class="card"><div class="label">Dónde más gastas</div>';
      sum.top.slice(0, 3).forEach(function (t) {
        var c = catById(t.id), share = sum.exp > 0 ? t.total / sum.exp : 0;
        h += '<div class="col" style="gap:6px"><div class="row"><span>' + (c ? esc(c.icon) + ' ' + esc(c.name) : 'Sin categoría') + '</span><span class="num">' + fmt(t.total, disp) +
          '</span></div><div class="bar"><i style="width:' + Math.max(4, Math.round(share * 100)) + '%"></i></div></div>';
      });
      h += '</div>';
    }
    if (urg.length) h += '<div class="label">Próximos pagos</div><div class="col" style="gap:8px">' + urg.slice(0, 4).map(itemRowHtml).join('') + (urg.length > 4 ? '<button class="linkbtn plain" data-a="goto-pay">Ver todos (' + urg.length + ')</button>' : '') + '</div>';
    var bl = S.budgets.slice().sort(function (a, b) { return budgetSpent(b) / b.limitMinor - budgetSpent(a) / a.limitMinor; }).slice(0, 3);
    if (bl.length) h += '<div class="label">Presupuestos</div><div class="col" style="gap:8px">' + bl.map(budgetRow).join('') + '</div>';
    var favTx = favoriteIds.map(function(fid){return S.transactions.filter(function(t){return t.id===fid;})[0];}).filter(Boolean).slice(0,4);
    if (favTx.length) h += '<div class="label">Tus movimientos favoritos</div><div class="col" style="gap:8px">' + favTx.map(txRow2).join('') + '</div>';
    h += '<div class="label">Recientes</div>';
    h += recent.length ? '<div class="col" style="gap:8px">' + recent.map(txRow2).join('') + '</div>'
      : '<div class="empty"><div class="big">✨</div><b>Aún no hay movimientos</b><span class="muted">Toca el botón + para registrar tu primer gasto o ingreso.</span></div>';
    return h;
  }

  function movesList() {
    var q = query.trim().toLowerCase();
    var items = sorted().filter(function (t) {
      if (filter !== 'all' && t.type !== filter) return false;
      if (!q) return true;
      var c = catById(t.categoryId), a = accById(t.accountId);
      return [t.note, c ? c.name : '', a ? a.name : ''].join(' ').toLowerCase().indexOf(q) >= 0;
    });
    if (!items.length) {
      return S.transactions.length === 0
        ? '<div class="empty"><div class="big">🧾</div><b>Nada por aquí todavía</b><span class="muted">Cuando registres movimientos aparecerán aquí.</span></div>'
        : '<div class="empty"><div class="big">🔎</div><b>No encontré nada</b><span class="muted">Prueba con otra palabra o cambia el filtro.</span></div>';
    }
    return '<div class="col" style="gap:8px">' + items.map(txRow2).join('') + '</div>';
  }
  function viewMoves() {
    return '<h1 class="h2">Movimientos</h1>' + banners() +
      '<div class="field"><input id="q" type="search" placeholder="Buscar por nota, categoría o cuenta" aria-label="Buscar" value="' + esc(query) + '" autocomplete="off"></div>' +
      '<div class="seg" role="group" aria-label="Tipo"><button data-a="filter" data-v="all" aria-pressed="' + (filter === 'all') + '">Todos</button><button data-a="filter" data-v="expense" aria-pressed="' + (filter === 'expense') + '">Gastos</button><button data-a="filter" data-v="income" aria-pressed="' + (filter === 'income') + '">Ingresos</button></div>' +
      '<div id="list">' + movesList() + '</div>';
  }

  /* ---------- 9b. Vistas: Pagos, formularios, presupuestos y avisos ---------- */
  var ptab = 'next', fd = null;
  function otherCur(c) { return c === 'USD' ? 'VES' : 'USD'; }
  function approx(minor, cur) { return S.rate.rateE4 > 0 ? '≈ ' + fmt(convert(minor, cur, otherCur(cur), S.rate.rateE4), otherCur(cur)) : ''; }
  function itemRowHtml(it) {
    var tag = it.level === 'late' ? 'Vencido' : it.level === 'today' ? 'Vence hoy' : '';
    return '<button class="tx agi ' + it.level + '" data-a="' + it.act + '" data-id="' + esc(it.id) + '">' +
      '<span class="ico" aria-hidden="true">' + it.icon + '</span>' +
      '<span class="mid"><b>' + esc(it.title) + '</b><span>' + dueLabel(it.due) + '</span></span>' +
      '<span class="amt"><b>' + fmt(it.amount, it.currency) + '</b>' + (tag ? '<span class="tagl">' + tag + '</span>' : '<span>' + approx(it.amount, it.currency) + '</span>') + '</span></button>';
  }
  function fdInput(f, label, val, extra) {
    return '<div class="field"><label class="label" for="fd_' + f + '">' + label + '</label><input id="fd_' + f + '" data-fd="' + f + '" value="' + esc(val == null ? '' : val) + '" autocomplete="off" ' + (extra || '') + '></div>';
  }
  function fdChips(f, list, sel) {
    return '<div class="chips">' + list.map(function (x) { return '<button type="button" class="chip" data-a="fd-set" data-f="' + f + '" data-v="' + esc(x.id) + '" aria-pressed="' + (sel === x.id) + '">' + x.label + '</button>'; }).join('') + '</div>';
  }
  function fdSeg(f, list, sel) {
    return '<div class="seg" role="group">' + list.map(function (x) { return '<button type="button" data-a="fd-set" data-f="' + f + '" data-v="' + x.id + '" aria-pressed="' + (sel === x.id) + '">' + x.label + '</button>'; }).join('') + '</div>';
  }
  function catChips(f, sel, skipBudgeted) {
    var used = {}; if (skipBudgeted) S.budgets.forEach(function (b) { if (b.id !== fd.id) used[b.categoryId] = 1; });
    return fdChips(f, S.categories.filter(function (c) { return c.kind === 'expense' && !used[c.id]; }).sort(function (a, b) { return a.sortOrder - b.sortOrder; }).map(function (c) { return { id: c.id, label: esc(c.icon) + ' ' + esc(c.name) }; }), sel);
  }
  function accChips(f, cur, sel) {
    return fdChips(f, S.accounts.filter(function (a) { return a.currency === cur; }).map(function (a) { return { id: a.id, label: esc(a.name) }; }), sel);
  }
  function remindField(f) { return fdInput('remind', 'Avisarme (días antes)', f.remind, 'inputmode="numeric" maxlength="2" placeholder="Usar el general (' + S.prefs.remindDays + ')"'); }
  function dateField(f, label) { return '<div class="field"><label class="label" for="fd_due">' + label + '</label><input id="fd_due" type="date" data-fd="due" value="' + esc(f.due || '') + '"></div>'; }
  function delZone(kind, id) {
    if (!id) return '';
    return '<div class="card dangerzone">' + (arm && arm.kind === kind && arm.id === id ? slideHtml(kind, id, '') : '<button class="btn danger" data-a="ask-del" data-k="' + kind + '" data-id="' + esc(id) + '">Eliminar</button>') + '</div>';
  }
  function viewForm() {
    var f = fd; if (!f) { sub = 'menu'; return tab === 'pay' ? viewPay() : viewMore(); }
    var curSeg = fdSeg('currency', [{ id: 'VES', label: 'Bolívares' }, { id: 'USD', label: 'Dólares' }], f.currency);
    var err = f.msg ? '<div class="err" role="alert">' + esc(f.msg) + '</div>' : '';
    var save = '<button class="btn" data-a="fd-save"' + (f.saving ? ' disabled' : '') + '>' + (f.saving ? 'Guardando…' : 'Guardar') + '</button>';
    var back = '<button class="back" data-a="fd-cancel">‹ Volver</button>', h;
    if (f.t === 'sch') {
      return back + '<h1 class="h2">' + (f.id ? 'Editar pago fijo' : 'Nuevo pago fijo') + '</h1>' + banners() +
        '<div class="card">' + fdInput('name', 'Nombre', f.name, 'maxlength="40" placeholder="Ej. Internet"') + fdInput('amount', 'Monto', f.amount, 'inputmode="decimal" placeholder="0,00"') + curSeg +
        '<div class="label">Categoría (opcional)</div>' + catChips('categoryId', f.categoryId) +
        '<div class="label">Cuenta con la que lo pagas (opcional)</div>' + accChips('accountId', f.currency, f.accountId) +
        '<div class="label">Se repite</div>' + fdChips('frequency', Object.keys(FREQ).map(function (k) { return { id: k, label: FREQ[k] }; }), f.frequency) +
        dateField(f, 'Próximo vencimiento') + remindField(f) +
        (f.id ? '<div class="chips"><button type="button" class="chip" data-a="fd-set" data-f="active" data-v="toggle" aria-pressed="' + !f.active + '">⏸ En pausa</button></div>' : '') +
        err + save + '</div>' + delZone('sch', f.id);
    }
    if (f.t === 'plan') {
      var n = parseInt(f.count, 10), tot = parseAmount(f.total), prev = '';
      if (tot > 0 && n >= 1 && n <= 60) prev = n + ' cuotas de ' + fmt(Math.floor(tot / n), f.currency) + (tot % n ? ' (la última ajusta los céntimos)' : '');
      return back + '<h1 class="h2">' + (f.id ? 'Editar compra en cuotas' : 'Nueva compra en cuotas') + '</h1>' + banners() +
        '<div class="card">' + fdInput('name', 'Tienda o compra', f.name, 'maxlength="40" placeholder="Ej. Celular (Cashea)"') +
        fdInput('total', 'Monto a pagar en cuotas', f.total, 'inputmode="decimal" placeholder="0,00"') + curSeg +
        '<div class="muted">Pon aquí lo que falta por pagar en cuotas (sin la inicial, que ya pagaste).</div>' +
        fdInput('count', 'Número de cuotas', f.count, 'inputmode="numeric" maxlength="2"') +
        (prev ? '<div class="muted">' + esc(prev) + '</div>' : '') +
        '<div class="label">Cada cuánto</div>' + fdChips('frequency', Object.keys(FREQ).map(function (k) { return { id: k, label: FREQ[k] }; }), f.frequency) +
        dateField(f, 'Fecha de la primera cuota') + fdInput('paid', 'Cuotas que ya pagaste', f.paid, 'inputmode="numeric" maxlength="2"') +
        '<div class="label">Categoría (opcional)</div>' + catChips('categoryId', f.categoryId) +
        '<div class="label">Cuenta con la que pagas (opcional)</div>' + accChips('accountId', f.currency, f.accountId) +
        remindField(f) + err + save + '</div>' + delZone('plan', f.id);
    }
    if (f.t === 'debt') {
      var d = f.id ? S.debts.filter(function (x) { return x.id === f.id; })[0] : null, ab = '';
      if (d) {
        ab = '<div class="card"><div class="label">Registrar un abono</div><div class="muted">Falta ' + fmt(debtLeft(d), d.currency) + ' de ' + fmt(d.totalMinor, d.currency) + '.</div>' +
          fdInput('abono', 'Monto del abono', f.abono, 'inputmode="decimal" placeholder="0,00"') +
          '<div class="label">' + (d.kind === 'owe' ? 'Pagado desde' : 'Recibido en') + ' (opcional)</div>' + accChips('abonoAcc', d.currency, f.abonoAcc) +
          '<div class="muted">Si eliges una cuenta, el abono también se anota como ' + (d.kind === 'owe' ? 'gasto' : 'ingreso') + ' en esa cuenta.</div>' +
          (f.abMsg ? '<div class="err" role="alert">' + esc(f.abMsg) + '</div>' : '') +
          '<button class="btn quiet" data-a="abono"' + (f.saving ? ' disabled' : '') + '>Registrar abono</button></div>';
      }
      return back + '<h1 class="h2">' + (f.id ? 'Editar deuda' : 'Nueva deuda') + '</h1>' + banners() + ab +
        '<div class="card">' + fdSeg('kind', [{ id: 'owe', label: 'Yo debo' }, { id: 'owed', label: 'Me deben' }], f.kind) +
        fdInput('person', 'Persona o lugar', f.person, 'maxlength="40" placeholder="Ej. Luz, Carlos"') +
        fdInput('note', 'Nota (opcional)', f.note, 'maxlength="120"') +
        fdInput('total', 'Monto total', f.total, 'inputmode="decimal" placeholder="0,00"') + curSeg +
        dateField(f, 'Fecha límite (opcional)') + remindField(f) + err + save + '</div>' + delZone('debt', f.id);
    }
    if (f.t === 'bud') {
      return back + '<h1 class="h2">' + (f.id ? 'Editar presupuesto' : 'Nuevo presupuesto') + '</h1>' + banners() +
        '<div class="card"><div class="label">Categoría</div>' + catChips('categoryId', f.categoryId, true) +
        fdInput('amount', 'Límite del mes', f.amount, 'inputmode="decimal" placeholder="0,00"') + curSeg +
        '<div class="muted">Se cuenta lo que gastas en esa categoría durante el mes (tu parte, si divides gastos).</div>' + err + save + '</div>' + delZone('bud', f.id);
    }
    return '';
  }

  function viewPay() {
    if (sub === 'f-sch' || sub === 'f-plan' || sub === 'f-debt') return viewForm();
    var disp = S.displayCurrency;
    var h = '<h1 class="h2">Pagos</h1>' + banners();
    if (S.extrasMissing) h += '<div class="banner bad" role="alert">Falta actualizar la base de datos: ejecuta el schema.sql nuevo en el SQL Editor de Supabase y recarga.</div>';
    h += '<div class="seg" role="group" aria-label="Sección">' + [['next', 'Próximos'], ['sch', 'Fijos'], ['plan', 'Cuotas'], ['debt', 'Deudas']].map(function (x) {
      return '<button data-a="ptab" data-v="' + x[0] + '" aria-pressed="' + (ptab === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>';
    var empty = function (ico, t, s) { return '<div class="empty"><div class="big">' + ico + '</div><b>' + t + '</b><span class="muted">' + s + '</span></div>'; };
    if (ptab === 'next') {
      var ag = agenda();
      h += ag.length ? '<div class="col" style="gap:8px">' + ag.map(itemRowHtml).join('') + '</div>'
        : empty('🗓️', 'Nada por pagar', 'Agrega pagos fijos, compras en cuotas o deudas con fecha y aquí verás cuándo vencen.');
      h += '<div class="muted">Toca un pago para registrarlo: se anota como gasto y se pasa al siguiente vencimiento.</div>';
    } else if (ptab === 'sch') {
      h += '<button class="btn" data-a="new-sch">+ Nuevo pago fijo</button>';
      h += S.scheduled.length ? '<div class="col" style="gap:8px">' + S.scheduled.slice().sort(function (a, b) { return a.nextDue.localeCompare(b.nextDue); }).map(function (x) {
        var c = catById(x.categoryId);
        return '<div class="item"><button class="tx" data-a="edit-sch" data-id="' + esc(x.id) + '"><span class="ico" aria-hidden="true">' + (c ? esc(c.icon) : '🔁') + '</span>' +
          '<span class="mid"><b>' + esc(x.name) + '</b><span>' + (x.active ? FREQ[x.frequency] + ' · ' + dueLabel(x.nextDue) : 'En pausa') + '</span></span>' +
          '<span class="amt"><b>' + fmt(x.amountMinor, x.currency) + '</b><span>' + approx(x.amountMinor, x.currency) + '</span></span></button>' +
          (x.active ? '<button class="paybtn" data-a="pay-sch" data-id="' + esc(x.id) + '">Pagar</button>' : '') + '</div>';
      }).join('') + '</div>' : empty('🔁', 'Sin pagos fijos', 'Internet, luz, suscripciones… agrégalos una vez y la app te avisa cuándo toca pagarlos.');
    } else if (ptab === 'plan') {
      h += '<button class="btn" data-a="new-plan">+ Nueva compra en cuotas</button>';
      h += S.plans.length ? '<div class="col" style="gap:8px">' + S.plans.map(function (p) {
        var done = p.paidCount >= p.count, pct = Math.round(p.paidCount / p.count * 100);
        return '<div class="item"><button class="tx" data-a="edit-plan" data-id="' + esc(p.id) + '"><span class="ico" aria-hidden="true">🛍️</span>' +
          '<span class="mid"><b>' + esc(p.name) + '</b><span>' + (done ? 'Completada ✔' : 'Cuota ' + (p.paidCount + 1) + ' de ' + p.count + ' · ' + dueLabel(planDue(p))) + '</span><span class="pbar"><i style="width:' + pct + '%"></i></span></span>' +
          '<span class="amt"><b>' + (done ? fmt(p.totalMinor, p.currency) : fmt(planAmount(p, p.paidCount), p.currency)) + '</b><span>' + (done ? 'total' : 'próxima') + '</span></span></button>' +
          (done ? '' : '<button class="paybtn" data-a="pay-plan" data-id="' + esc(p.id) + '">Pagar</button>') + '</div>';
      }).join('') + '</div>' : empty('🛍️', 'Sin compras en cuotas', 'Cashea y similares: anota la compra y cada cuota aparecerá con su fecha.');
    } else {
      var tt = debtTotals(disp);
      h += '<div class="grid2"><div class="card"><div class="label">Yo debo</div><div class="num" style="color:var(--expense)">' + fmt(tt.owe, disp) + '</div></div>' +
        '<div class="card"><div class="label">Me deben</div><div class="num pos">' + fmt(tt.owed, disp) + '</div></div></div>';
      h += '<button class="btn" data-a="new-debt">+ Nueva deuda</button>';
      var debtRow = function (d) {
        return '<button class="tx" data-a="edit-debt" data-id="' + esc(d.id) + '"><span class="ico" aria-hidden="true">' + (d.kind === 'owe' ? '💸' : '🤝') + '</span>' +
          '<span class="mid"><b>' + esc(d.person) + '</b><span>' + (debtLeft(d) <= 0 ? 'Saldada ✔' : d.dueDate ? dueLabel(d.dueDate) : (d.note ? esc(d.note) : 'Sin fecha')) + '</span></span>' +
          '<span class="amt"><b>' + fmt(debtLeft(d), d.currency) + '</b><span>de ' + fmt(d.totalMinor, d.currency) + '</span></span></button>';
      };
      var owe = S.debts.filter(function (d) { return d.kind === 'owe'; }), owed = S.debts.filter(function (d) { return d.kind === 'owed'; });
      if (owe.length) h += '<div class="label">Yo debo</div><div class="col" style="gap:8px">' + owe.map(debtRow).join('') + '</div>';
      if (owed.length) h += '<div class="label">Me deben</div><div class="col" style="gap:8px">' + owed.map(debtRow).join('') + '</div>';
      var ps = pendingShares();
      if (ps.length) {
        h += '<div class="label">Por cobrar de gastos compartidos</div><div class="col" style="gap:8px">' + ps.map(function (p) {
          var c = catById(p.tx.categoryId);
          return '<div class="item"><div class="tx"><span class="ico" aria-hidden="true">👥</span><span class="mid"><b>' + esc(p.name) + '</b><span>' + esc(p.tx.note || (c ? c.name : 'Gasto')) + ' · ' + shortDate(p.tx.dateISO) + '</span></span>' +
            '<span class="amt"><b class="pos">' + fmt(p.shareMinor, p.currency) + '</b></span></div><button class="paybtn" data-a="settle" data-id="' + esc(p.tx.id) + '" data-i="' + p.idx + '">Cobrado</button></div>';
        }).join('') + '</div>';
      }
      if (!owe.length && !owed.length && !ps.length) h += empty('🤝', 'Sin deudas', 'Anota lo que debes, lo que te deben y las partes de gastos compartidos.');
    }
    return h;
  }

  function viewBudgets() {
    var back = '<button class="back" data-a="sub" data-v="menu">‹ Volver</button>';
    var h = back + '<h1 class="h2">Presupuestos</h1>' + banners() + '<div class="muted">Un límite de gasto por categoría para cada mes (del 1 al último día).</div>';
    var free = S.categories.filter(function (c) { return c.kind === 'expense' && !S.budgets.some(function (b) { return b.categoryId === c.id; }); }).length;
    if (free) h += '<button class="btn" data-a="new-bud">+ Nuevo presupuesto</button>';
    if (!S.budgets.length) return h + '<div class="empty"><div class="big">🎯</div><b>Sin presupuestos</b><span class="muted">Ponle un límite mensual a Alimentación, Entretenimiento…</span></div>';
    return h + '<div class="col" style="gap:8px">' + S.budgets.map(budgetRow).join('') + '</div>';
  }
  function budgetRow(b) {
    var c = catById(b.categoryId), pace = budgetPace(b), spent = pace.spent, pct = Math.min(100, Math.round(pace.pct * 100)), raw = pace.pct;
    var cls = raw >= 1 ? 'over' : raw >= 0.8 ? 'warnb' : '';
    return '<button class="card cardbtn" data-a="edit-bud" data-id="' + esc(b.id) + '"><div class="row"><span>' + (c ? esc(c.icon) + ' ' + esc(c.name) : 'Categoría') + '</span><span class="num">' + fmt(spent, b.currency) + ' / ' + fmt(b.limitMinor, b.currency) + '</span></div>' +
      '<div class="bar ' + cls + '"><i style="width:' + Math.max(raw > 0 ? 3 : 0, pct) + '%"></i></div><div class="muted">' +
      (raw >= 1 ? 'Te pasaste por ' + fmt(spent - b.limitMinor, b.currency) : 'Te quedan ' + fmt(b.limitMinor - spent, b.currency)) + '</div>' +
      '<div class="muted">Proyección al cierre: ' + fmt(pace.projected, b.currency) + (pace.ahead ? ' · Vas más rápido que tu presupuesto' : pace.projected > b.limitMinor ? ' · Podrías superar el límite' : ' · Ritmo actual dentro del límite') + '</div></button>';
  }
  function base64UrlToUint8Array(base64String) {
    var padding = '='.repeat((4 - base64String.length % 4) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var raw = window.atob(base64), out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
    return out;
  }
  async function togglePushSubscription() {
    if (!CLOUD || !user || !sb) { toast('Los avisos push con la app cerrada requieren iniciar sesión en Supabase.'); return; }
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) { toast('Este navegador no admite avisos push. Puedes seguir usando los avisos dentro de Cuadre.'); return; }
    if (!CONFIG.VAPID_PUBLIC_KEY || CONFIG.VAPID_PUBLIC_KEY.length < 40) { toast('Configura VAPID_PUBLIC_KEY en app.js con la clave pública de Web Push. Nunca pongas la clave privada en la app.'); return; }
    try {
      var permission = Notification.permission;
      if (permission !== 'granted') permission = await Notification.requestPermission();
      if (permission !== 'granted') { toast('No se concedió permiso para notificaciones.'); return; }
      var reg = await navigator.serviceWorker.ready;
      var existing = await reg.pushManager.getSubscription();
      if (existing) {
        var endpoint = existing.endpoint;
        var removed = await act(async function () { await B.removePushSubscription(endpoint); await existing.unsubscribe(); });
        if (!removed) return;
        try { localStorage.setItem('cuadre:push:enabled', '0'); } catch (e0) {}
        toast('Avisos push desactivados en este dispositivo.'); render(); return;
      }
      var subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToUint8Array(CONFIG.VAPID_PUBLIC_KEY) });
      var json = subscription.toJSON(), keys = json.keys || {};
      if (!json.endpoint || !keys.p256dh || !keys.auth) { await subscription.unsubscribe(); throw new Error('El navegador devolvió una suscripción incompleta.'); }
      var saved = await act(async function () { await B.savePushSubscription({ endpoint: json.endpoint, p256dh: keys.p256dh, auth: keys.auth, expirationTime: json.expirationTime }); });
      if (!saved) { await subscription.unsubscribe(); return; }
      try { localStorage.setItem('cuadre:push:enabled', '1'); } catch (e1) {}
      toast('Avisos push activados en este dispositivo. Para que lleguen pagos programados, despliega el emisor y programa su ejecución en Supabase.'); render();
    } catch (e) {
      toast(/relation|schema cache|does not exist/i.test((e && e.message) || '') ? 'Falta ejecutar el schema.sql de esta versión para registrar suscripciones push.' : 'No se pudieron configurar los avisos push: ' + ((e && e.message) || 'revisa el navegador y las claves VAPID.'));
    }
  }
  function viewRemind() {
    var back = '<button class="back" data-a="sub" data-v="menu">‹ Volver</button>';
    var perm = 'Notification' in window ? Notification.permission : 'unsupported', on = notifyEnabled();
    return back + '<h1 class="h2">Avisos</h1>' + banners() +
      '<div class="card"><div class="label">Días de anticipación</div><div class="muted">Te aviso este número de días antes de cada vencimiento y otra vez, con más fuerza, el día que vence. Cada pago puede tener su propio número.</div>' +
      '<div class="field"><input id="rd" inputmode="numeric" maxlength="2" value="' + S.prefs.remindDays + '" aria-label="Días de anticipación"></div>' +
      (msg ? '<div class="' + (msgOk ? 'muted' : 'err') + '" role="alert">' + esc(msg) + '</div>' : '') +
      '<button class="btn" data-a="save-remind">Guardar</button></div>' +
      '<div class="card"><div class="label">Avisos del teléfono</div>' +
      (perm === 'unsupported' ? '<div class="muted">Este navegador no permite notificaciones. Igual verás los avisos dentro de la app.</div>'
        : '<div class="muted">' + (on ? 'Activados: te notificamos al abrir la app cuando algo vence pronto o ya venció.' : perm === 'denied' ? 'Las notificaciones están bloqueadas en este navegador. Actívalas en los ajustes del sitio.' : 'Activa las notificaciones para recibir el aviso al abrir la app.') + '</div>' +
          (perm === 'denied' ? '' : '<button class="btn quiet" data-a="notify-toggle">' + (on ? 'Desactivar avisos del teléfono' : 'Activar avisos del teléfono') + '</button>')) +
      '<div class="muted">Estos avisos locales se revisan al abrir Cuadre. Los avisos push funcionan por separado.</div></div>' +
      '<div class="card"><div class="label">Avisos con la app cerrada</div><div class="muted">Para que el teléfono reciba recordatorios aunque Cuadre esté cerrada, activa una suscripción Web Push y configura el emisor programado de Supabase que viene en este ZIP.</div>' +
      (!CLOUD || !user ? '<div class="banner">Primero configura Supabase e inicia sesión. La suscripción se guarda de forma privada para esta cuenta.</div>' :
        (!CONFIG.VAPID_PUBLIC_KEY ? '<div class="banner">Falta configurar VAPID_PUBLIC_KEY en app.js. La clave privada se guarda solo como secreto de servidor.</div>' : '') +
        '<button class="btn quiet" data-a="toggle-push">Activar / desactivar avisos push en este dispositivo</button>') +
      '<div class="muted">Activar el botón no programa el servidor automáticamente. Sigue LEEME.md para configurar VAPID, desplegar send-reminders y programarlo con Supabase Cron.</div></div>';
  }

  /* Dividir un gasto con otras personas (dentro de la hoja de registro). */
  function splitHtml(s) {
    if (s.type !== 'expense') return '';
    var h = '<div class="col" style="gap:8px"><div class="chips"><button class="chip" data-a="sp-toggle" aria-pressed="' + !!s.split + '">👥 Dividir con otros</button></div>';
    if (s.split) {
      var total = parseAmount(s.amountText), sum = 0;
      s.split.people.forEach(function (p, i) {
        var v = parseAmount(p.share); if (v) sum += v;
        h += '<div class="sprow"><input data-sp="' + i + ':name" placeholder="Nombre" maxlength="30" value="' + esc(p.name) + '" aria-label="Nombre de la persona ' + (i + 1) + '">' +
          '<input data-sp="' + i + ':share" inputmode="decimal" placeholder="0,00" value="' + esc(p.share) + '" aria-label="Parte de la persona ' + (i + 1) + '">' +
          '<button class="linkbtn" data-a="sp-rm" data-id="' + i + '" aria-label="Quitar persona">✕</button></div>';
      });
      h += '<div class="row"><button class="linkbtn plain" data-a="sp-add">+ Agregar persona</button><button class="linkbtn plain" data-a="sp-eq">Partes iguales</button></div>';
      h += '<div class="muted">' + (total ? 'Tu parte: ' + fmt(Math.max(0, total - sum), s.currency) + '. Se descuenta completo de tu cuenta y las partes de los demás quedan como "por cobrar".' : 'Escribe el monto total arriba.') + '</div>';
      if (s.errors.split) h += '<div class="err">' + esc(s.errors.split) + '</div>';
    }
    return h + '</div>';
  }

  function refCards() {
    var bcv = S.rate.rateE4, r = S.ref || {};
    function card(title, x, extra) {
      return '<div class="card"><div class="label">' + title + '</div><div class="hero small">' + (x && x.rateE4 > 0 ? 'Bs ' + fmtRate(x.rateE4) : 'Sin dato') + '</div><div class="muted">' +
        (x && x.updatedAt && !isNaN(new Date(x.updatedAt)) ? 'Actualizada ' + new Date(x.updatedAt).toLocaleDateString('es-VE') : 'Se actualiza sola al abrir la app') + (extra || '') + '</div></div>';
    }
    var gap = r.par && r.par.rateE4 > 0 && bcv > 0 ? ' · ' + String(Math.round((r.par.rateE4 / bcv - 1) * 1000) / 10).replace('.', ',') + '% sobre el BCV' : '';
    return '<div class="label">Solo referencia</div>' + card('Euro BCV', r.eur) + card('Dólar paralelo (referencia tipo Binance)', r.par, gap) +
      '<div class="muted">Estas dos tasas no se usan en tus cuentas: todo se convierte con el dólar BCV.</div>';
  }
  /* ---------- Nuevas funciones Cuadre v0.4: informes y finanzas prácticas ---------- */
  var quickParsed = null;
  var assistantQuestion = '', assistantAnswer = '', assistantDraft = null, assistantBusy = false;
  var csvImportDraft = null, activeFamilyId = '', familyInviteCode = '', familyError = '', restoreDraftText = '';
  function selectedFamilyId() {
    if (activeFamilyId && (S.familySpaces || []).some(function (x) { return x.id === activeFamilyId; })) return activeFamilyId;
    try { activeFamilyId = localStorage.getItem('cuadre:family:selected:' + (user ? user.id : 'local')) || ''; } catch (e) { activeFamilyId = ''; }
    if (!(S.familySpaces || []).some(function (x) { return x.id === activeFamilyId; })) activeFamilyId = (S.familySpaces || [])[0] ? S.familySpaces[0].id : '';
    return activeFamilyId;
  }
  function normWords(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9$.,@ -]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function reportPeriod() {
    var fromEl = document.getElementById('report-from'), toEl = document.getElementById('report-to');
    var from = fromEl ? fromEl.value : today().slice(0, 7) + '-01', to = toEl ? toEl.value : today();
    if (!validDate(from) || !validDate(to) || from > to) { toast('Revisa el rango: la fecha inicial debe ser válida y no posterior a la final.'); return null; }
    return { from: from, to: to };
  }
  function reportData(from, to) {
    var rows = sorted().filter(function (t) { return t.dateISO >= from && t.dateISO <= to; });
    var inc = 0, exp = 0, by = {};
    rows.forEach(function (t) {
      var amount = t.type === 'income' ? t.amountMinor : myMinor(t), value = convert(amount, t.currency, S.displayCurrency, t.rateE4);
      if (t.type === 'income') inc += value;
      else { exp += value; var c = catById(t.categoryId); var name = c ? c.name : 'Sin categoría'; by[name] = (by[name] || 0) + value; }
    });
    return { rows: rows, inc: inc, exp: exp, net: inc - exp, by: Object.keys(by).map(function (name) { return { name: name, total: by[name] }; }).sort(function (a, b) { return b.total - a.total; }) };
  }
  function reportCompare() {
    var current = today().slice(0, 7), parts = current.split('-').map(Number), prevDate = new Date(parts[0], parts[1] - 2, 1), previous = iso(prevDate).slice(0, 7);
    return { current: { month: current, summary: monthSummary(current, S.displayCurrency) }, previous: { month: previous, summary: monthSummary(previous, S.displayCurrency) } };
  }
  function viewReports() {
    var p = reportPeriod() || { from: today().slice(0, 7) + '-01', to: today() }, data = reportData(p.from, p.to), cmp = reportCompare();
    var h = '<button class="back" data-a="sub" data-v="menu">‹ Volver</button><h1 class="h2">Reportes</h1>' + banners() +
      '<div class="card"><div class="label">Período del informe</div><div class="grid2"><div class="field"><label class="label" for="report-from">Desde</label><input id="report-from" type="date" value="' + esc(p.from) + '"></div><div class="field"><label class="label" for="report-to">Hasta</label><input id="report-to" type="date" value="' + esc(p.to) + '"></div></div>' +
      '<button class="btn quiet" data-a="refresh-report">Aplicar rango</button><div class="row" style="gap:8px"><button class="btn" data-a="export-xlsx">Exportar Excel</button><button class="btn quiet" data-a="export-pdf">Guardar PDF</button></div>' +
      '<div class="muted">Los movimientos de transferencia quedan fuera de ingresos y gastos. El PDF se genera desde la ventana de impresión del navegador (puedes elegir “Guardar como PDF”).</div></div>' +
      '<div class="grid2"><div class="card"><div class="label">Ingresos</div><div class="num pos">' + fmt(data.inc, S.displayCurrency) + '</div></div><div class="card"><div class="label">Gastos</div><div class="num" style="color:var(--expense)">' + fmt(data.exp, S.displayCurrency) + '</div></div><div class="card"><div class="label">Balance del período</div><div class="num">' + fmt(data.net, S.displayCurrency) + '</div></div><div class="card"><div class="label">Movimientos</div><div class="num">' + data.rows.length + '</div></div></div>' +
      '<div class="card"><div class="label">Gastos por categoría</div>';
    if (data.by.length) data.by.slice(0, 8).forEach(function (x) { var pct = data.exp > 0 ? Math.round(x.total / data.exp * 100) : 0; h += '<div class="col" style="gap:5px;margin:10px 0"><div class="row"><span>' + esc(x.name) + '</span><span class="num">' + fmt(x.total, S.displayCurrency) + ' · ' + pct + '%</span></div><div class="bar"><i style="width:' + Math.max(pct ? 2 : 0, pct) + '%"></i></div></div>'; });
    else h += '<div class="muted">No hay gastos en este período.</div>';
    h += '</div><div class="card"><div class="label">Este mes frente al anterior</div><div class="row"><div class="col"><span class="muted">' + esc(monthLabel(cmp.current.month)) + '</span><b>Gastos: ' + fmt(cmp.current.summary.exp, S.displayCurrency) + '</b><span>Ingresos: ' + fmt(cmp.current.summary.inc, S.displayCurrency) + '</span></div><div class="col" style="text-align:right"><span class="muted">' + esc(monthLabel(cmp.previous.month)) + '</span><b>Gastos: ' + fmt(cmp.previous.summary.exp, S.displayCurrency) + '</b><span>Ingresos: ' + fmt(cmp.previous.summary.inc, S.displayCurrency) + '</span></div></div>';
    var prevExp = cmp.previous.summary.exp, delta = prevExp ? Math.round((cmp.current.summary.exp - prevExp) / prevExp * 100) : null;
    h += '<div class="muted">' + (delta == null ? 'Todavía no hay gastos del mes anterior para comparar.' : 'Los gastos del mes actual van ' + (delta > 0 ? '↑ ' : delta < 0 ? '↓ ' : '') + Math.abs(delta) + '% ' + (delta > 0 ? 'por encima' : delta < 0 ? 'por debajo' : 'igual que') + ' el mes anterior. El mes actual todavía no ha terminado.') + '</div></div>';
    var ves = S.accounts.filter(function (a) { return a.currency === 'VES'; }).reduce(function (sum, a) { return sum + balance(a); }, 0), history = (S.rateHistory || []).filter(function (x) { return x.rateE4 > 0 && x.recordedAt && x.recordedAt.slice(0, 10) <= p.to; }).sort(function (a, b) { return b.recordedAt.localeCompare(a.recordedAt); }), ref = history.filter(function (x) { return x.recordedAt.slice(0, 10) <= p.from; })[0] || history[history.length - 1];
    if (S.rate.rateE4 > 0 && ref && ref.rateE4 > 0) {
      var oldUsd = convert(ves, 'VES', 'USD', ref.rateE4), nowUsd = convert(ves, 'VES', 'USD', S.rate.rateE4);
      h += '<div class="card"><div class="label">Efecto estimado de la tasa</div><div class="num">' + fmt(nowUsd, 'USD') + ' al tipo actual</div><div class="muted">El saldo actual en bolívares (' + fmt(ves, 'VES') + ') equivalía aproximadamente a ' + fmt(oldUsd, 'USD') + ' usando la tasa guardada de ' + esc(shortDate(ref.recordedAt.slice(0, 10))) + ' (' + fmtRate(ref.rateE4) + '). Diferencia de valor referencial: ' + fmt(nowUsd - oldUsd, 'USD') + '. No es ganancia ni pérdida contable.</div></div>';
    } else h += '<div class="card"><div class="label">Efecto de la tasa</div><div class="muted">Se necesita tener una tasa actual y al menos una tasa histórica guardada para estimarlo. Las tasas se empezarán a registrar a partir de esta versión.</div></div>';
    h += '<div class="card"><div class="label">Cierre de mes · presupuestos actuales</div>';
    if (S.budgets.length) S.budgets.forEach(function (b) { var c = catById(b.categoryId), spent = budgetSpent(b), pct = Math.round(spent / b.limitMinor * 100); h += '<div class="col" style="gap:5px;margin:10px 0"><div class="row"><span>' + esc(c ? c.name : 'Categoría') + '</span><b>' + pct + '%</b></div><div class="bar ' + (pct >= 100 ? 'over' : pct >= 80 ? 'warnb' : '') + '"><i style="width:' + Math.min(100, pct) + '%"></i></div><div class="muted">' + fmt(spent, b.currency) + ' de ' + fmt(b.limitMinor, b.currency) + (pct >= 100 ? ' · excedido' : ' · restante ' + fmt(b.limitMinor - spent, b.currency)) + '</div></div>'; });
    else h += '<div class="muted">No tienes presupuestos para revisar.</div>';
    h += '<div class="muted">Este resumen no bloquea ni modifica movimientos del mes anterior. Para archivar el cierre, exporta el informe a PDF o Excel.</div></div>';
    return h;
  }
  function downloadBlob(content, mime, filename) { var blob = new Blob([content], { type: mime }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); }
  function exportExcel() {
    var p = reportPeriod(); if (!p) return; var data = reportData(p.from, p.to), rows = data.rows.map(function (t) { var c = catById(t.categoryId), a = accById(t.accountId); return { Fecha: t.dateISO, Tipo: t.type === 'income' ? 'Ingreso' : 'Gasto', Categoria: c ? c.name : 'Sin categoría', Cuenta: a ? a.name : 'Sin cuenta', Nota: t.note || '', 'Monto original': t.amountMinor / 100, 'Monto contabilizado': (t.type === 'income' ? t.amountMinor : myMinor(t)) / 100, Moneda: t.currency, ['Equivalente ' + S.displayCurrency]: convert(t.type === 'income' ? t.amountMinor : myMinor(t), t.currency, S.displayCurrency, t.rateE4) / 100, 'Tasa guardada': t.rateE4 / 10000, 'Tiene recibo': t.receiptImage ? 'Sí' : 'No' }; });
    rows.push({ Fecha: '', Tipo: 'RESUMEN', Categoria: '', Cuenta: '', Nota: 'Ingresos totales', 'Monto original': '', 'Monto contabilizado': data.inc / 100, Moneda: S.displayCurrency, ['Equivalente ' + S.displayCurrency]: data.inc / 100 });
    rows.push({ Fecha: '', Tipo: 'RESUMEN', Categoria: '', Cuenta: '', Nota: 'Gastos totales', 'Monto original': '', 'Monto contabilizado': data.exp / 100, Moneda: S.displayCurrency, ['Equivalente ' + S.displayCurrency]: data.exp / 100 });
    var filename = 'Cuadre_' + p.from + '_' + p.to;
    if (window.XLSX && window.XLSX.utils) { var wb = XLSX.utils.book_new(), ws = XLSX.utils.json_to_sheet(rows); XLSX.utils.book_append_sheet(wb, ws, 'Movimientos'); XLSX.writeFile(wb, filename + '.xlsx'); }
    else { var keys = Object.keys(rows[0] || { Fecha: '', Tipo: '', Categoria: '', Cuenta: '', Nota: '', Monto: '', Moneda: '' }); var csv = [keys].concat(rows.map(function (r) { return keys.map(function (k) { return r[k] == null ? '' : r[k]; }); })).map(function (row) { return row.map(function (x) { if (x == null) return '""'; var value = String(x); if (/^[\u0000-\u0020]*[=+\-@]/.test(value)) value = "'" + value; return '"' + value.replace(/"/g, '""') + '"'; }).join(';'); }).join('\r\n'); downloadBlob('\ufeff' + csv, 'text/csv;charset=utf-8', filename + '.csv'); toast('Se descargó un CSV compatible con Excel; no se pudo cargar la librería XLSX.'); }
  }
  function exportPdf() {
    var p = reportPeriod(); if (!p) return; var d = reportData(p.from, p.to), cmp = reportCompare(), win = window.open('', '_blank');
    if (!win) { toast('El navegador bloqueó la ventana del informe. Permite las ventanas emergentes y vuelve a intentarlo.'); return; }
    var rows = d.rows.map(function (t) { var c = catById(t.categoryId), a = accById(t.accountId); return '<tr><td>' + esc(t.dateISO) + '</td><td>' + (t.type === 'income' ? 'Ingreso' : 'Gasto') + '</td><td>' + esc(c ? c.name : 'Sin categoría') + '</td><td>' + esc(a ? a.name : 'Sin cuenta') + '</td><td>' + esc(t.note || '') + '</td><td class="right">' + esc(fmt(t.amountMinor, t.currency)) + '</td></tr>'; }).join('');
    win.document.open(); win.document.write('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe Cuadre ' + esc(p.from) + ' — ' + esc(p.to) + '</title><style>body{font:12px Arial,sans-serif;color:#17221c;margin:24px}h1{margin-bottom:4px}p{color:#555}.cards{display:flex;gap:24px;margin:24px 0}.cards div{border:1px solid #ddd;padding:12px;flex:1}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{padding:7px;border-bottom:1px solid #ddd;text-align:left}th{background:#f1f4f2}.right{text-align:right}@media print{button{display:none}body{margin:10mm}}</style></head><body><h1>Cuadre · Informe financiero</h1><p>Período: ' + esc(p.from) + ' al ' + esc(p.to) + ' · Moneda de resumen: ' + esc(S.displayCurrency) + '</p><div class="cards"><div><b>Ingresos</b><br>' + esc(fmt(d.inc, S.displayCurrency)) + '</div><div><b>Gastos</b><br>' + esc(fmt(d.exp, S.displayCurrency)) + '</div><div><b>Balance</b><br>' + esc(fmt(d.net, S.displayCurrency)) + '</div></div><h2>Movimientos (' + d.rows.length + ')</h2><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Categoría</th><th>Cuenta</th><th>Nota</th><th class="right">Monto contabilizado</th></tr></thead><tbody>' + (rows || '<tr><td colspan="6">No hay movimientos en este rango.</td></tr>') + '</tbody></table><p>Comparación: ' + esc(monthLabel(cmp.current.month)) + ' — gastos ' + esc(fmt(cmp.current.summary.exp, S.displayCurrency)) + '; ' + esc(monthLabel(cmp.previous.month)) + ' — gastos ' + esc(fmt(cmp.previous.summary.exp, S.displayCurrency)) + '.</p><button onclick="window.print()">Imprimir / Guardar como PDF</button><script>window.addEventListener("load",function(){setTimeout(function(){window.print()},250)})<\/script></body></html>'); win.document.close();
  }
  function viewQuickEntry() {
    var preview = '';
    if (quickParsed) {
      if (quickParsed.error) preview = '<div class="err">' + esc(quickParsed.error) + '</div>';
      else preview = '<div class="card"><div class="label">Revisa antes de guardar</div><b>' + esc(quickParsed.type === 'income' ? 'Ingreso' : 'Gasto') + ' · ' + esc(quickParsed.category.name) + '</b><div class="num">' + esc(fmt(quickParsed.amountMinor, quickParsed.currency)) + '</div><div class="muted">' + esc(quickParsed.account.name) + ' · ' + esc(quickParsed.note || 'Sin nota') + '</div><button class="btn" data-a="quick-save">Guardar movimiento</button></div>';
    }
    return '<button class="back" data-a="sub" data-v="menu">‹ Volver</button><h1 class="h2">Entrada rápida</h1>' + banners() + '<div class="card"><div class="label">Escribe el movimiento como te salga natural</div><div class="muted">Ejemplos: “almuerzo 5$ efectivo”, “taxi Bs 250 banco 1”, “freelance 80 USD Binance”. Revisa la interpretación antes de guardar.</div><div class="field"><label class="label" for="quick-text">Movimiento</label><input id="quick-text" maxlength="160" placeholder="almuerzo 5$ efectivo" value="' + esc(quickParsed ? quickParsed.raw : '') + '"></div><button class="btn quiet" data-a="quick-parse">Interpretar</button>' + preview + '</div>';
  }
  function parseQuickEntry(raw) {
    var text = String(raw || '').trim(), normalized = normWords(text); if (!text) return { raw: text, error: 'Escribe algo como “almuerzo 5$ efectivo”.' };
    if (/\b(otra vez|repite|repetir|lo mismo)\b/.test(normalized) && /\bayer\b/.test(normalized)) {
      var ytx = sorted().filter(function (t) { return t.dateISO === addDays(today(), -1); })[0];
      if (!ytx) return { raw: text, error: 'No hay movimientos de ayer para repetir.' };
      var ya = accById(ytx.accountId), yc = catById(ytx.categoryId);
      if (!ya || !yc) return { raw: text, error: 'El movimiento de ayer usa una cuenta o categoría que ya no existe.' };
      return { raw: text, amountMinor: ytx.amountMinor, currency: ytx.currency, type: ytx.type, account: ya, category: yc, note: ytx.note || yc.name, rateE4: ytx.rateE4, error: null, repeated: true };
    }
    var hit = text.match(/(?:\$\s*)?\d[\d.,]*(?:\s*(?:usd|us\$|\$|bs\.?|bol[ií]vares?))?/i);
    if (!hit) return { raw: text, error: 'No detecté el monto. Ejemplo: “almuerzo 5$ efectivo”.' };
    var amtText = hit[0].replace(/\b(?:usd|us\$|bs\.?|bol[ií]vares?)\b/ig, '').replace(/\$/g, '').trim(), amount = parseAmount(amtText);
    if (!(amount > 0)) return { raw: text, error: 'No pude interpretar el monto. Escríbelo como 5,50 o 5.50.' };
    var currency = /\$|usd|us\$|dolares?/.test(normalized) ? 'USD' : /\bbs\b|bolivares?/.test(normalized) ? 'VES' : S.displayCurrency;
    var type = /\b(ingreso|cobre|cobre|cobre|recibi|sueldo|salario|freelance|venta|me pagaron|cobro|abono recibido)\b/.test(normalized) ? 'income' : 'expense';
    var account = S.accounts.filter(function (a) { var n = normWords(a.name); return n && normalized.indexOf(n) >= 0 && a.currency === currency; })[0];
    if (!account && /\bbinance\b/.test(normalized)) account = S.accounts.filter(function (a) { return /binance/i.test(a.name) && a.currency === currency; })[0];
    // Si la persona escribe solo "efectivo", prioriza la cuenta de efectivo de la moneda elegida.
    if (!account && /\befectivo\b/.test(normalized)) account = S.accounts.filter(function (a) { return /efectivo/i.test(a.name) && a.currency === currency; })[0];
    if (!account) account = accById(defaultAccount(currency));
    if (!account) return { raw: text, error: 'No tienes una cuenta en ' + (currency === 'USD' ? 'dólares' : 'bolívares') + '. Crea una en Más › Cuentas.' };
    var cats = S.categories.filter(function (c) { return c.kind === type; }), keywords = { 'alimentacion': ['almuerzo','desayuno','cena','comida','restaurante','mercado','supermercado','cafe'], 'transporte': ['taxi','uber','gasolina','metro','bus','autobus','pasaje'], 'vivienda': ['alquiler','renta'], 'servicios': ['internet','luz','agua','telefono'], 'entretenimiento': ['cine','juego','salida'], 'salud': ['farmacia','medicina','doctor'], 'compras': ['ropa','zapatos'], 'freelance': ['freelance','cliente','proyecto'], 'sueldo': ['sueldo','salario'] };
    var category = cats.filter(function (c) { var cn = normWords(c.name); if (normalized.indexOf(cn) >= 0) return true; var keys = keywords[cn] || []; return keys.some(function (k) { return normalized.indexOf(k) >= 0; }); })[0] || catsFor(type)[0];
    if (!category) return { raw: text, error: 'No tienes categorías de ' + (type === 'income' ? 'ingresos' : 'gastos') + '.' };
    var note = text.replace(hit[0], ' ').replace(new RegExp(account.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ').replace(/\b(?:usd|us\$|bs\.?|bol[ií]vares?|dolares?|dolar|efectivo|banco\s*\d+|ingreso|cobre|cobré|recibi|recibí|me pagaron)\b/ig, ' ').replace(/[$]/g, ' ').replace(/\s+/g, ' ').trim();
    note = note ? note.charAt(0).toLocaleUpperCase('es-VE') + note.slice(1) : category.name;
    return { raw: text, amountMinor: amount, currency: currency, type: type, account: account, category: category, note: note.slice(0, 120), rateE4: S.rate.rateE4, error: (!S.rate.rateE4 ? 'Primero define la tasa del dólar en Más › Tasas; la app guarda la tasa aplicada a cada movimiento.' : null) };
  }
  async function saveParsedQuickEntry(parsed, context) {
    if (!parsed || parsed.error) { toast(parsed && parsed.error ? parsed.error : 'Primero interpreta el movimiento.'); return false; }
    if (offline) { toast('Sin conexión: por ahora solo puedes mirar tus datos.'); return false; }
    var now = new Date().toISOString(), tx = { id: uuid(), type: parsed.type, amountMinor: parsed.amountMinor, currency: parsed.currency, rateE4: parsed.rateE4 || S.rate.rateE4, categoryId: parsed.category.id, accountId: parsed.account.id, note: parsed.note, dateISO: today(), createdAt: now, updatedAt: now, split: null, receiptImage: '' };
    if (!(tx.rateE4 > 0)) { toast('Define la tasa del dólar antes de guardar.'); return false; }
    var ok = await act(async function () { await B.saveTx(tx); S.transactions.push(tx); persist(); });
    if (ok) { registerUndoTx(tx); quickParsed = null; assistantDraft = null; if (context === 'assistant') { assistantAnswer = 'Listo: el movimiento se guardó. ¿Qué más quieres revisar?'; } else { tab = 'moves'; sub = 'menu'; } render(); toastUndo('Movimiento guardado.'); }
    return ok;
  }
  async function saveQuickEntry() {
    var raw = document.getElementById('quick-text') ? document.getElementById('quick-text').value : quickParsed && quickParsed.raw;
    var parsed = parseQuickEntry(raw); quickParsed = parsed;
    if (parsed.error) { render(); return; }
    await saveParsedQuickEntry(parsed, 'quick');
  }
  function viewTransfers() {
    var accounts = S.accounts, opts = accounts.map(function (a) { return '<option value="' + esc(a.id) + '">' + esc(a.name) + ' (' + (a.currency === 'USD' ? '$' : 'Bs') + ')</option>'; }).join('');
    var h = '<button class="back" data-a="sub" data-v="menu">‹ Volver</button><h1 class="h2">Transferencias</h1>' + banners() + '<div class="card"><div class="label">Mover dinero entre cuentas</div><div class="muted">Una transferencia no es ingreso ni gasto. Si las monedas son distintas, indica cuánto sale de una cuenta y cuánto llega a la otra.</div>' +
      '<div class="field"><label class="label" for="tr-from">Desde</label><select id="tr-from">' + opts + '</select></div><div class="field"><label class="label" for="tr-to">Hacia</label><select id="tr-to">' + opts + '</select></div>' +
      '<div class="field"><label class="label" for="tr-fromamount">Monto que sale</label><input id="tr-fromamount" inputmode="decimal" placeholder="0,00"></div><div class="field"><label class="label" for="tr-toamount">Monto que llega (solo si cambia la moneda)</label><input id="tr-toamount" inputmode="decimal" placeholder="Déjalo vacío si es la misma moneda"></div>' +
      '<div class="field"><label class="label" for="tr-date">Fecha</label><input id="tr-date" type="date" value="' + today() + '"></div><div class="field"><label class="label" for="tr-note">Nota (opcional)</label><input id="tr-note" maxlength="120" placeholder="Ej. Pasé dinero a efectivo"></div><button class="btn" data-a="save-transfer">Guardar transferencia</button></div>';
    var ts = (S.transfers || []).slice().sort(function (a, b) { return b.dateISO.localeCompare(a.dateISO); });
    h += '<div class="label">Historial</div>' + (ts.length ? ts.map(function (t) { var fa = accById(t.fromAccountId), ta = accById(t.toAccountId); return '<div class="card"><div class="row"><div class="col"><b>' + esc(fa ? fa.name : 'Cuenta eliminada') + ' → ' + esc(ta ? ta.name : 'Cuenta eliminada') + '</b><span class="muted">' + esc(t.dateISO) + (t.note ? ' · ' + esc(t.note) : '') + '</span></div><button class="linkbtn" data-a="delete-transfer" data-id="' + esc(t.id) + '">Eliminar</button></div><div class="row"><span>' + esc(fmt(t.fromAmountMinor, t.fromCurrency)) + ' → ' + esc(fmt(t.toAmountMinor, t.toCurrency)) + '</span></div></div>'; }).join('') : '<div class="empty"><b>Aún no hay transferencias</b></div>');
    return h;
  }
  async function saveTransferClick() {
    if (offline) { toast('Sin conexión: por ahora solo puedes mirar tus datos.'); return; }
    var from = accById(document.getElementById('tr-from').value), to = accById(document.getElementById('tr-to').value), fromAmount = parseAmount(document.getElementById('tr-fromamount').value), toRaw = document.getElementById('tr-toamount').value.trim(), toAmount = toRaw ? parseAmount(toRaw) : fromAmount, date = document.getElementById('tr-date').value, note = document.getElementById('tr-note').value.trim();
    if (!from || !to || from.id === to.id) { toast('Elige dos cuentas distintas.'); return; }
    if (!(fromAmount > 0) || !(toAmount > 0) || fromAmount > 1e13 || toAmount > 1e13) { toast('Escribe montos mayores que cero y dentro del límite permitido.'); return; }
    if (!validDate(date)) { toast('Revisa la fecha de la transferencia.'); return; }
    if (from.currency === to.currency && toAmount !== fromAmount) { toast('Si las cuentas usan la misma moneda, los montos deben coincidir.'); return; }
    if (from.currency !== to.currency && !toRaw) { toast('Escribe el monto que llega a la cuenta cuando cambia la moneda.'); return; }
    if (from.currency !== to.currency && !(S.rate.rateE4 > 0)) { toast('Define la tasa del dólar antes de registrar una transferencia entre monedas.'); return; }
    var t = { id: uuid(), fromAccountId: from.id, toAccountId: to.id, fromAmountMinor: fromAmount, toAmountMinor: toAmount, fromCurrency: from.currency, toCurrency: to.currency, rateE4: S.rate.rateE4, dateISO: date, note: note.slice(0, 120), createdAt: new Date().toISOString() };
    var ok = await act(async function () { await B.saveTransfer(t); S.transfers.push(t); persist(); });
    if (ok) { motionRefreshRequested = true; toast('Transferencia guardada sin alterar los reportes de ingresos y gastos'); render(); }
  }
  function viewGoals() {
    var h = '<button class="back" data-a="sub" data-v="menu">‹ Volver</button><h1 class="h2">Metas de ahorro</h1>' + banners() + '<div class="card"><div class="label">Nueva meta</div><div class="field"><label class="label" for="goal-name">Nombre</label><input id="goal-name" maxlength="60" placeholder="Ej. Equipo de trabajo"></div><div class="field"><label class="label" for="goal-target">Monto objetivo</label><input id="goal-target" inputmode="decimal" placeholder="200,00"></div><div class="field"><label class="label" for="goal-saved">Ya ahorrado</label><input id="goal-saved" inputmode="decimal" value="0"></div><div class="field"><label class="label" for="goal-currency">Moneda</label><select id="goal-currency"><option value="USD">Dólares</option><option value="VES">Bolívares</option></select></div><div class="field"><label class="label" for="goal-due">Fecha objetivo (opcional)</label><input id="goal-due" type="date"></div><div class="field"><label class="label" for="goal-note">Nota (opcional)</label><input id="goal-note" maxlength="120"></div><button class="btn" data-a="save-goal">Crear meta</button></div>';
    if (!(S.goals || []).length) return h + '<div class="empty"><b>Empieza con una meta pequeña</b><span class="muted">El progreso se actualiza manualmente; no mueve dinero entre cuentas.</span></div>';
    h += '<div class="label">Tus metas</div>' + S.goals.map(function (g) { var pct = g.targetMinor > 0 ? Math.min(100, Math.round(g.savedMinor / g.targetMinor * 100)) : 0; return '<div class="card' + (pct >= 100 ? ' goal-complete' : '') + '"><div class="row"><b>' + esc(g.name) + '</b><button class="linkbtn" data-a="delete-goal" data-id="' + esc(g.id) + '">Eliminar</button></div><div class="row"><span class="num">' + fmt(g.savedMinor, g.currency) + ' / ' + fmt(g.targetMinor, g.currency) + '</span><b>' + pct + '%</b></div><div class="bar"><i style="width:' + pct + '%"></i></div>' + (g.dueDate ? '<div class="muted">Objetivo: ' + esc(g.dueDate) + '</div>' : '') + '<div class="field"><label class="label" for="goal-contrib-' + esc(g.id) + '">Nuevo aporte para esta meta</label><input id="goal-contrib-' + esc(g.id) + '" inputmode="decimal" placeholder="Monto a reservar"></div><button class="btn" data-a="goal-contribute" data-id="' + esc(g.id) + '">Registrar aporte</button>' +
      '<div class="field"><label class="label" for="goal-progress-' + esc(g.id) + '">Corregir monto acumulado (opcional)</label><input id="goal-progress-' + esc(g.id) + '" inputmode="decimal" value="' + esc(minorToText(g.savedMinor)) + '"></div><button class="btn quiet" data-a="goal-progress" data-id="' + esc(g.id) + '">Corregir progreso</button>' +
      ((S.goalContributions || []).filter(function (x) { return x.goalId === g.id; }).length ? '<div class="muted">Aportes registrados: ' + (S.goalContributions || []).filter(function (x) { return x.goalId === g.id; }).length + '</div>' : '') + '</div>'; }).join('');
    h += '<div class="muted">Los aportes reservan dinero para la meta, no son un gasto ni un movimiento bancario. El monto reservado se resta del dinero estimado que puedes gastar.</div>'; return h;
  }
  async function saveGoalClick() {
    var name = document.getElementById('goal-name').value.trim(), target = parseAmount(document.getElementById('goal-target').value), saved = parseAmount(document.getElementById('goal-saved').value || '0'), due = document.getElementById('goal-due').value, note = document.getElementById('goal-note').value.trim();
    if (!name) { toast('Ponle un nombre a la meta.'); return; }
    if (!(target > 0) || target > 1e13 || saved === null || saved < 0 || saved > target) { toast('Revisa los montos de la meta; el objetivo debe ser válido y lo ahorrado debe estar entre cero y el objetivo.'); return; }
    if (due && !validDate(due)) { toast('Revisa la fecha objetivo.'); return; }
    var g = { id: uuid(), name: name.slice(0, 60), targetMinor: target, savedMinor: saved, currency: document.getElementById('goal-currency').value === 'VES' ? 'VES' : 'USD', dueDate: due, note: note.slice(0, 120), createdAt: new Date().toISOString() };
    var ok = await act(async function () { await B.saveGoal(g); S.goals.push(g); persist(); }); if (ok) { motionRefreshRequested = true; toast('Meta creada'); render(); }
  }
  async function addGoalContribution(id) {
    var g = (S.goals || []).filter(function (x) { return x.id === id; })[0]; if (!g) return;
    var inp = document.getElementById('goal-contrib-' + id), amount = inp ? parseAmount(inp.value) : null;
    if (!(amount > 0) || amount > (g.targetMinor - g.savedMinor)) { toast('El aporte debe ser mayor que cero y no superar lo que falta para la meta.'); return; }
    var now = new Date().toISOString(), c = { id: uuid(), goalId: g.id, amountMinor: amount, currency: g.currency, dateISO: today(), note: 'Aporte a ' + g.name, createdAt: now };
    var updated = Object.assign({}, g, { savedMinor: g.savedMinor + amount });
    var ok = await act(async function () { await B.saveGoalContribution(c); if (!CLOUD) await B.saveGoal(updated); S.goalContributions = (S.goalContributions || []).concat([c]); S.goals = S.goals.map(function (x) { return x.id === id ? updated : x; }); persist(); });
    if (ok) { motionRefreshRequested = true; toast('Aporte reservado para la meta'); render(); }
  }
  async function updateGoalProgress(id) {
    var g = (S.goals || []).filter(function (x) { return x.id === id; })[0]; if (!g) return;
    var inp = document.getElementById('goal-progress-' + id), n = inp ? parseAmount(inp.value) : null;
    if (n === null || n < 0 || n > g.targetMinor) { toast('El progreso debe estar entre cero y el monto objetivo.'); return; }
    var updated = Object.assign({}, g, { savedMinor: n }); var ok = await act(async function () { await B.saveGoal(updated); S.goals = S.goals.map(function (x) { return x.id === id ? updated : x; }); persist(); }); if (ok) { motionRefreshRequested = true; toast('Progreso actualizado'); render(); }
  }
  function viewAllocation() {
    var a = S.allocation || { invest: 10, enjoyment: 20, savings: 20, emergency: 10, needs: 40 }, income = monthSummary(today().slice(0, 7), S.displayCurrency).inc;
    var fields = [['invest','Inversión'],['enjoyment','Disfrutar'],['savings','Ahorro'],['emergency','Emergencias'],['needs','Necesidades']];
    return '<button class="back" data-a="sub" data-v="menu">‹ Volver</button><h1 class="h2">Distribución del ingreso</h1>' + banners() + '<div class="card"><div class="label">Reparte cada ingreso como prefieras</div><div class="muted">Los porcentajes deben sumar 100 %. Cuadre calcula una sugerencia por cada destino; no mueve automáticamente dinero entre cuentas ni crea gastos.</div>' + fields.map(function (x) { var k = ({invest:'invest',enjoyment:'enjoyment',savings:'savings',emergency:'emergency',needs:'needs'})[x[0]]; return '<div class="field"><label class="label" for="alloc-' + x[0] + '">' + x[1] + ' (%)</label><input id="alloc-' + x[0] + '" inputmode="numeric" value="' + esc(a[k]) + '"></div><div class="muted">Estimación este mes: ' + fmt(Math.round(income * a[k] / 100), S.displayCurrency) + '</div>'; }).join('') + '<div class="muted">Ingresos registrados este mes: ' + fmt(income, S.displayCurrency) + '</div><button class="btn" data-a="save-allocation">Guardar porcentajes</button></div>';
  }
  async function saveAllocationClick() {
    var a = { invest: Number(document.getElementById('alloc-invest').value), enjoyment: Number(document.getElementById('alloc-enjoyment').value), savings: Number(document.getElementById('alloc-savings').value), emergency: Number(document.getElementById('alloc-emergency').value), needs: Number(document.getElementById('alloc-needs').value) };
    var vals = Object.keys(a).map(function (k) { return a[k]; }); if (vals.some(function (n) { return !Number.isInteger(n) || n < 0 || n > 100; }) || vals.reduce(function (n, x) { return n + x; }, 0) !== 100) { toast('Los porcentajes deben ser números enteros entre 0 y 100 que sumen exactamente 100 %.'); return; }
    var ok = await act(async function () { await B.saveAllocation(a); S.allocation = a; persist(); }); if (ok) { motionRefreshRequested = true; toast('Distribución guardada'); render(); }
  }

  function assistantSnapshot() {
    var m = monthSummary(today().slice(0, 7), S.displayCurrency), p = availablePlan(S.displayCurrency), fc = monthForecast(S.displayCurrency);
    var budgets = (S.budgets || []).map(function (b) { var c = catById(b.categoryId), pace = budgetPace(b); return { category: c ? c.name : 'Categoría', spent: fmt(pace.spent, b.currency), limit: fmt(b.limitMinor, b.currency), projection: fmt(pace.projected, b.currency), currency: b.currency }; });
    var goals = (S.goals || []).map(function (g) { return { name: g.name, percent: Math.round(100 * g.savedMinor / Math.max(1, g.targetMinor)), remaining: fmt(Math.max(0, g.targetMinor - g.savedMinor), g.currency), currency: g.currency }; });
    return { displayCurrency: S.displayCurrency, balance: fmt(p.balance, S.displayCurrency), availableToSpend: fmt(p.available, S.displayCurrency), upcomingObligations30Days: fmt(p.obligations30, S.displayCurrency), goalsReserved: fmt(p.goalsReserved, S.displayCurrency), monthIncome: fmt(m.inc, S.displayCurrency), monthExpenses: fmt(m.exp, S.displayCurrency), projectedMonthEndBalance: fmt(fc.projectedBalance, S.displayCurrency), budgets: budgets, goals: goals };
  }
  function localAssistantAnswer(question) {
    var q = normWords(question), disp = S.displayCurrency, month = today().slice(0, 7), sm = monthSummary(month, disp), plan = availablePlan(disp), forecast = monthForecast(disp);
    if (/\b(saldo|disponible|puedo gastar|dinero tengo|dinero hay)\b/.test(q)) return 'Tu saldo total es ' + fmt(plan.balance, disp) + '. Después de reservar ' + fmt(plan.goalsReserved, disp) + ' para metas y ' + fmt(plan.obligations30, disp) + ' para obligaciones de los próximos 30 días, tu disponible estimado para gastar es ' + fmt(plan.available, disp) + '.';
    if (/\b(proyeccion|proyectar|fin de mes|terminar el mes|cerrar el mes)\b/.test(q)) return 'Con el promedio neto de ' + fmt(forecast.dailyNet, disp) + ' por día observado durante ' + forecast.sampleDays + ' día(s), tu saldo estimado al cierre del mes sería ' + fmt(forecast.projectedBalance, disp) + '. Es una proyección simple, no una garantía.';
    if (/\b(presupuesto|presupuestos|limite|limites)\b/.test(q)) {
      if (!S.budgets.length) return 'Aún no tienes presupuestos configurados. En Más → Presupuestos puedes fijar un límite para cada categoría.';
      return 'Resumen de tus presupuestos: ' + S.budgets.map(function (b) { var c = catById(b.categoryId), p = budgetPace(b); return (c ? c.name : 'Categoría') + ': ' + fmt(p.spent, b.currency) + ' de ' + fmt(b.limitMinor, b.currency) + ', proyección ' + fmt(p.projected, b.currency) + (p.ahead ? ' (ritmo alto)' : ''); }).join('; ') + '.';
    }
    if (/\b(meta|metas|ahorro|ahorrar)\b/.test(q)) {
      if (!(S.goals || []).length) return 'Todavía no tienes metas. Crea una en Más → Metas de ahorro; los aportes reservan dinero sin registrarse como gasto.';
      return 'Tus metas: ' + S.goals.map(function (g) { return g.name + ' (' + Math.round(g.savedMinor / Math.max(1, g.targetMinor) * 100) + '%; faltan ' + fmt(Math.max(0, g.targetMinor - g.savedMinor), g.currency) + ')'; }).join('; ') + '.';
    }
    if (/\b(tasa|dolar|bolivar|cambio|cambiaria)\b/.test(q)) {
      var hist = (S.rateHistory || []).filter(function (x) { return x.rateE4 > 0; }).sort(function (a, b) { return a.recordedAt.localeCompare(b.recordedAt); });
      if (!S.rate.rateE4) return 'Todavía no hay una tasa del dólar guardada. Abre Más → Tasas para consultarla o registrar una manualmente.';
      if (hist.length > 1) return 'La tasa actual guardada es Bs ' + fmtRate(S.rate.rateE4) + ' por dólar. El historial contiene ' + hist.length + ' registros. En Reportes puedes consultar el efecto referencial sobre tu saldo en bolívares.';
      return 'La tasa guardada es Bs ' + fmtRate(S.rate.rateE4) + ' por dólar. Cuadre guarda las tasas históricas que registre a partir de esta versión; aún hay pocos datos para comparar.';
    }
    var named = S.categories.filter(function (c) { return c.kind === 'expense' && normWords(c.name) && q.indexOf(normWords(c.name)) >= 0; })[0];
    if (named || /\b(gasto|gastos|gaste|gastado|compras|comida|ingreso|ingresos)\b/.test(q)) {
      var type = /\b(ingreso|ingresos|gane|ganado|cobre)\b/.test(q) ? 'income' : 'expense';
      var rows = S.transactions.filter(function (t) { return t.dateISO.slice(0, 7) === month && t.type === type && (!named || t.categoryId === named.id); });
      var sum = rows.reduce(function (n, t) { return n + convert(type === 'income' ? t.amountMinor : myMinor(t), t.currency, disp, t.rateE4); }, 0);
      return (type === 'income' ? 'Tus ingresos' : 'Tus gastos') + (named ? ' en ' + named.name : '') + ' durante ' + monthLabel(month) + ': ' + fmt(sum, disp) + ' en ' + rows.length + ' movimiento(s).';
    }
    return 'Puedo ayudarte con tu saldo disponible, la proyección de fin de mes, gastos por categoría, presupuestos, metas de ahorro y tasas. También puedes escribir un movimiento como “almuerzo 5$ efectivo”; revisa siempre la interpretación antes de guardarla.';
  }
  async function askAssistant() {
    var qel = document.getElementById('assistant-query'); assistantQuestion = qel ? qel.value.trim() : assistantQuestion;
    if (!assistantQuestion) { assistantAnswer = 'Escribe una pregunta o un movimiento para empezar.'; render(); return; }
    var q = assistantQuestion, normalized = normWords(q);
    var isEntry = /\d/.test(q) && !/\b(cuanto|total|saldo|compar|presupuesto|ahorro|meta|proyeccion|proyectar|tasa|gastado|gaste este mes|cuanto gaste)\b/.test(normalized);
    if (isEntry) {
      assistantDraft = parseQuickEntry(q); quickParsed = assistantDraft;
      assistantAnswer = assistantDraft.error && !assistantDraft.amountMinor ? assistantDraft.error : 'He preparado una propuesta. Revisa la cuenta, categoría, moneda y monto antes de guardarla.';
      render(); return;
    }
    assistantBusy = true; assistantAnswer = ''; render();
    try {
      if (CLOUD && user && sb && sb.functions && sb.functions.invoke) {
        var result = await sb.functions.invoke('financial-assistant', { body: { question: q, snapshot: assistantSnapshot() } });
        if (!result.error && result.data && typeof result.data.answer === 'string' && result.data.answer.trim()) assistantAnswer = result.data.answer.trim();
        else assistantAnswer = localAssistantAnswer(q);
      } else assistantAnswer = localAssistantAnswer(q);
    } catch (e) { assistantAnswer = localAssistantAnswer(q); }
    assistantBusy = false; render();
  }
  function viewAssistant() {
    var preview = '';
    if (assistantDraft && assistantDraft.amountMinor && assistantDraft.account && assistantDraft.category) {
      preview = '<div class="card"><div class="label">Propuesta de movimiento · revisar</div><b>' + esc(assistantDraft.type === 'income' ? 'Ingreso' : 'Gasto') + ' · ' + esc(assistantDraft.category.name) + '</b><div class="num">' + esc(fmt(assistantDraft.amountMinor, assistantDraft.currency)) + '</div><div class="muted">' + esc(assistantDraft.account.name) + ' · ' + esc(assistantDraft.note || 'Sin nota') + '</div>' + (assistantDraft.error ? '<div class="err">' + esc(assistantDraft.error) + '</div>' : '') + '<button class="btn" data-a="assistant-save"' + (assistantDraft.error ? ' disabled' : '') + '>Confirmar y guardar</button><button class="btn quiet" data-a="assistant-cancel">Cancelar propuesta</button></div>';
    }
    return '<button class="back" data-a="sub" data-v="menu">‹ Volver</button><h1 class="h2">Asistente financiero</h1><div class="card"><div class="label">Pregunta con tus palabras</div><div class="muted">Ejemplos: “¿cuánto puedo gastar?”, “¿cómo voy en comida?”, “proyección de fin de mes” o “almuerzo 5$ efectivo”. Las respuestas locales se calculan con tus datos; con Supabase puedes desplegar una función de IA opcional. Los movimientos siempre necesitan tu confirmación.</div><div class="field"><label class="label" for="assistant-query">Tu pregunta</label><input id="assistant-query" maxlength="500" value="' + esc(assistantQuestion) + '" placeholder="¿Cuánto gasté este mes?"></div><button class="btn" data-a="assistant-ask"' + (assistantBusy ? ' disabled' : '') + '>' + (assistantBusy ? 'Consultando…' : 'Preguntar') + '</button>' + (assistantAnswer ? '<div class="card"><div class="label">Respuesta</div><div>' + esc(assistantAnswer) + '</div></div>' : '') + preview + '</div>' +
      '<div class="card"><div class="label">Tu resumen actual</div><div class="row"><span class="muted">Disponible estimado</span><b>' + fmt(availablePlan(S.displayCurrency).available, S.displayCurrency) + '</b></div><div class="row"><span class="muted">Gastos este mes</span><b>' + fmt(monthSummary(today().slice(0, 7), S.displayCurrency).exp, S.displayCurrency) + '</b></div><div class="row"><span class="muted">Saldo estimado a fin de mes</span><b>' + fmt(monthForecast(S.displayCurrency).projectedBalance, S.displayCurrency) + '</b></div></div>';
  }
  function viewFamily() {
    var h = '<button class="back" data-a="sub" data-v="menu">‹ Volver</button><h1 class="h2">Espacio compartido</h1>';
    if (!CLOUD || !user) return h + '<div class="banner">Los espacios compartidos necesitan una sesión de Supabase. Configura el modo nube e inicia sesión para invitar a otra persona.</div>';
    if (S.familyMissing) return h + '<div class="banner bad">Falta actualizar la base de datos. Ejecuta el schema.sql de esta versión en Supabase para habilitar los espacios familiares.</div>';
    h += '<div class="card"><div class="label">Crear espacio</div><div class="muted">Crea un libro compartido separado de tus finanzas personales. Sus gastos se ven por los miembros, pero no modifican automáticamente tus saldos personales.</div><div class="field"><label class="label" for="family-name">Nombre del hogar o grupo</label><input id="family-name" maxlength="60" placeholder="Ej. Casa" value=""></div><button class="btn" data-a="family-create">Crear espacio e invitación</button>' + (familyInviteCode ? '<div class="banner">Código de invitación (compártelo solo con quien corresponda): <b>' + esc(familyInviteCode) + '</b> <button class="linkbtn plain" data-a="family-copy-code">Copiar código</button></div>' : '') + '</div>' +
      '<div class="card"><div class="label">Unirte a un espacio</div><div class="field"><label class="label" for="family-code">Código de invitación</label><input id="family-code" maxlength="24" autocapitalize="characters" placeholder="Pega el código que recibiste"></div><button class="btn quiet" data-a="family-join">Unirme</button>' + (familyError ? '<div class="err">' + esc(familyError) + '</div>' : '') + '</div>';
    if (!(S.familySpaces || []).length) return h + '<div class="empty"><div class="big">👥</div><b>Aún no perteneces a un espacio</b><span class="muted">Crea uno o únete con un código.</span></div>';
    var active = selectedFamilyId(), spaces = S.familySpaces || [];
    h += '<div class="card"><div class="label">Tus espacios</div><div class="chips">' + spaces.map(function (sp) { return '<button class="chip" data-a="family-select" data-v="' + esc(sp.id) + '" aria-pressed="' + (sp.id === active) + '">' + esc(sp.name) + (sp.role === 'owner' ? ' · Admin' : '') + '</button>'; }).join('') + '</div></div>';
    var activeSpace = spaces.filter(function (x) { return x.id === active; })[0];
    if (!activeSpace) return h;
    h += '<div class="card"><div class="label">Registrar gasto compartido · ' + esc(activeSpace.name) + '</div><div class="field"><label class="label" for="family-expense-title">Concepto</label><input id="family-expense-title" maxlength="80" placeholder="Ej. Compra del supermercado"></div><div class="grid2"><div class="field"><label class="label" for="family-expense-amount">Monto</label><input id="family-expense-amount" inputmode="decimal" placeholder="0,00"></div><div class="field"><label class="label" for="family-expense-currency">Moneda</label><select id="family-expense-currency"><option value="USD">Dólares</option><option value="VES">Bolívares</option></select></div></div><div class="field"><label class="label" for="family-expense-paid">Quién pagó</label><input id="family-expense-paid" maxlength="60" placeholder="Nombre de la persona"></div><div class="field"><label class="label" for="family-expense-category">Categoría</label><input id="family-expense-category" maxlength="40" placeholder="Ej. Comida"></div><div class="field"><label class="label" for="family-expense-date">Fecha</label><input id="family-expense-date" type="date" value="' + today() + '"></div><div class="field"><label class="label" for="family-expense-note">Nota opcional</label><input id="family-expense-note" maxlength="120"></div><button class="btn" data-a="family-save-expense" data-id="' + esc(activeSpace.id) + '">Guardar gasto compartido</button></div>';
    var items = (S.familyExpenses || []).filter(function (x) { return x.spaceId === active; });
    h += '<div class="label">Movimientos compartidos</div>' + (items.length ? items.map(function (x) { return '<div class="card"><div class="row"><b>' + esc(x.title) + '</b><b>' + fmt(x.amountMinor, x.currency) + '</b></div><div class="muted">' + esc(x.dateISO) + ' · Pagó: ' + esc(x.paidBy || 'Sin especificar') + (x.category ? ' · ' + esc(x.category) : '') + '</div>' + (x.note ? '<div class="muted">' + esc(x.note) + '</div>' : '') + ((x.createdBy === user.id || activeSpace.ownerId === user.id) ? '<button class="linkbtn" data-a="family-delete-expense" data-id="' + esc(x.id) + '">Eliminar</button>' : '') + '</div>'; }).join('') : '<div class="empty"><b>Aún no hay gastos compartidos</b></div>');
    h += '<div class="muted">Cada espacio admite un máximo de 10 usos del código inicial. No introduzcas aquí información confidencial; estos movimientos son visibles para los miembros del espacio.</div>';
    return h;
  }
  function csvSplit(line, delimiter) {
    var out = [], cell = '', quoted = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '"') { if (quoted && line[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
      else if (ch === delimiter && !quoted) { out.push(cell); cell = ''; }
      else cell += ch;
    }
    out.push(cell); return out;
  }
  function parseCsvDate(value) {
    var x = String(value || '').trim(), m;
    if (validDate(x)) return x;
    m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(x);
    if (!m) return '';
    var a = +m[1], b = +m[2], y = +m[3], d, mo;
    // For slash dates exported from local banks, default to DD/MM/YYYY unless the first part cannot be a day.
    if (a > 12) { d = a; mo = b; } else if (b > 12) { mo = a; d = b; } else { d = a; mo = b; }
    var isoDate = y + '-' + p2(mo) + '-' + p2(d); return validDate(isoDate) ? isoDate : '';
  }
  function parseCsvImport(text) {
    var lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
    if (lines.length < 2) return { rows: [], errors: ['El CSV debe tener una fila de encabezados y al menos una fila de datos.'] };
    var first = lines[0], delimiters = [';', ',', '\t'], delim = delimiters.sort(function (a, b) { return csvSplit(first, b).length - csvSplit(first, a).length; })[0];
    var heads = csvSplit(first, delim).map(function (x) { return normWords(x); });
    function idx(names) { for (var i = 0; i < names.length; i++) { var n = normWords(names[i]), j = heads.indexOf(n); if (j >= 0) return j; } return -1; }
    var ix = { date: idx(['fecha','date','transaction date','fecha de operacion','fecha operación']), type: idx(['tipo','type','movimiento','naturaleza']), amount: idx(['monto','amount','importe','valor','total']), currency: idx(['moneda','currency','divisa']), account: idx(['cuenta','account','cuenta origen']), category: idx(['categoria','category','rubro']), note: idx(['nota','note','descripcion','description','concepto','detalle']), paid: idx(['debito','debit','cargo']), received: idx(['credito','credit','abono']) };
    if (ix.date < 0) return { rows: [], errors: ['El CSV necesita una columna Fecha/Date para no asignar fechas equivocadas.'] };
    if (ix.amount < 0 && ix.paid < 0 && ix.received < 0) return { rows: [], errors: ['No encontré una columna Monto/Amount ni columnas Débito/Crédito.'] };
    var rows = [], errors = [];
    lines.slice(1).forEach(function (line, ri) {
      var cells = csvSplit(line, delim).map(function (x) { return x.trim(); });
      function get(k) { return ix[k] >= 0 ? (cells[ix[k]] || '') : ''; }
      var rawAmount = get('amount'), typeText = normWords(get('type')), amountText = rawAmount, type = /ingreso|income|credito|credit|abono|deposit|deposito/.test(typeText) ? 'income' : 'expense';
      if (!rawAmount && (get('paid') || get('received'))) { if (get('received')) { amountText = get('received'); type = 'income'; } else { amountText = get('paid'); type = 'expense'; } }
      amountText = String(amountText).replace(/\$/g, '').replace(/\b(?:usd|ves|bs\.?|bolivares?|dolares?)\b/ig, '').trim();
      var amount = parseAmount(amountText), currencyRaw = String(get('currency') || '') + ' ' + String(rawAmount || '') + ' ' + String(get('paid') || '') + ' ' + String(get('received') || ''), currencyWords = normWords(currencyRaw), currency = /usd|dolar|\$/.test(currencyRaw.toLowerCase()) || /usd|dolar/.test(currencyWords) ? 'USD' : /ves|bolivar|\bbs\b/.test(currencyWords) ? 'VES' : S.displayCurrency;
      var date = parseCsvDate(get('date')), accountName = get('account').toLowerCase(), catName = normWords(get('category'));
      var account = accountName ? S.accounts.filter(function (a) { return a.name.toLowerCase() === accountName && a.currency === currency; })[0] : null;
      if (!account) account = S.accounts.filter(function (a) { return a.id === defaultAccount(currency); })[0];
      var category = catName ? S.categories.filter(function (c) { return normWords(c.name) === catName && c.kind === type; })[0] : null;
      if (!category) category = S.categories.filter(function (c) { return c.kind === type; }).sort(function (a,b) { return a.sortOrder-b.sortOrder; })[0];
      if (!(amount > 0)) errors.push('Fila ' + (ri + 2) + ': monto inválido');
      else if (!account) errors.push('Fila ' + (ri + 2) + ': no hay cuenta para ' + currency);
      else if (!category) errors.push('Fila ' + (ri + 2) + ': no hay categoría de ' + type);
      else if (!date || !validDate(date)) errors.push('Fila ' + (ri + 2) + ': fecha inválida');
      else if (!(S.rate.rateE4 > 0)) errors.push('Fila ' + (ri + 2) + ': define la tasa antes de importar movimientos');
      else rows.push({ type: type, amountMinor: amount, currency: currency, rateE4: S.rate.rateE4, categoryId: category.id, accountId: account.id, note: String(get('note') || category.name).slice(0, 120), dateISO: date });
    });
    return { rows: rows, errors: errors };
  }
  async function confirmCsvImport() {
    if (!csvImportDraft || !csvImportDraft.rows.length) { toast('No hay movimientos válidos para importar.'); return; }
    if (offline) { toast('Sin conexión: por ahora solo puedes mirar tus datos.'); return; }
    var now = new Date().toISOString(), list = csvImportDraft.rows.map(function (x) { return Object.assign({ id: uuid(), createdAt: now, updatedAt: now, split: null, receiptImage: '' }, x); });
    var ok = await act(async function () { await B.addTxs(list); S.transactions = S.transactions.concat(list); persist(); });
    if (ok) { toast('Importados ' + list.length + ' movimientos.'); csvImportDraft = null; msg = null; render(); }
  }
  async function createFamilySpace() {
    if (!CLOUD || !user) { toast('Inicia sesión en Supabase para crear un espacio compartido.'); return; }
    var name = document.getElementById('family-name') ? document.getElementById('family-name').value.trim() : '';
    if (!name || name.length > 60) { toast('Escribe un nombre de entre 1 y 60 caracteres.'); return; }
    try {
      var r = check(await sb.rpc('create_family_space', { p_name: name })), payload = r.data || {};
      familyInviteCode = payload.invite_code || payload.inviteCode || '';
      await refreshFamilyData();
      activeFamilyId = payload.space_id || payload.spaceId || selectedFamilyId();
      try { localStorage.setItem('cuadre:family:selected:' + user.id, activeFamilyId); } catch (e) {}
      familyError = ''; toast('Espacio compartido creado. Guarda el código de invitación.'); render();
    } catch (e) { familyError = humanError(e); render(); }
  }
  async function joinFamilySpace() {
    if (!CLOUD || !user) { toast('Inicia sesión en Supabase para unirte.'); return; }
    var code = document.getElementById('family-code') ? document.getElementById('family-code').value.trim().toUpperCase() : '';
    if (!code) { familyError = 'Escribe el código de invitación.'; render(); return; }
    try {
      var r = check(await sb.rpc('join_family_space', { p_invite_code: code }));
      await refreshFamilyData(); activeFamilyId = r.data || selectedFamilyId();
      try { localStorage.setItem('cuadre:family:selected:' + user.id, activeFamilyId); } catch (e) {}
      familyError = ''; familyInviteCode = ''; toast('Te uniste al espacio compartido.'); render();
    } catch (e) { familyError = humanError(e); render(); }
  }
  async function saveFamilyExpense(spaceId) {
    if (!CLOUD || offline) { toast('Necesitas conexión para guardar gastos compartidos.'); return; }
    var title = document.getElementById('family-expense-title').value.trim(), amount = parseAmount(document.getElementById('family-expense-amount').value), currency = document.getElementById('family-expense-currency').value === 'VES' ? 'VES' : 'USD', paidBy = document.getElementById('family-expense-paid').value.trim(), category = document.getElementById('family-expense-category').value.trim(), dateISO = document.getElementById('family-expense-date').value, note = document.getElementById('family-expense-note').value.trim();
    if (!title || title.length > 80 || !(amount > 0) || amount > 1e13 || !validDate(dateISO)) { toast('Revisa concepto, monto y fecha del gasto compartido.'); return; }
    var e = { id: uuid(), spaceId: spaceId, title: title, amountMinor: amount, currency: currency, paidBy: paidBy.slice(0,60), category: category.slice(0,40), dateISO: dateISO, note: note.slice(0,120), createdAt: new Date().toISOString(), createdBy: user.id };
    var ok = await act(async function () { await B.saveFamilyExpense(e); S.familyExpenses = [e].concat(S.familyExpenses || []); persist(); }); if (ok) { toast('Gasto compartido guardado'); render(); }
  }
  async function deleteFamilyExpense(id) {
    var item = (S.familyExpenses || []).filter(function (x) { return x.id === id; })[0]; if (!item) return;
    var space = (S.familySpaces || []).filter(function (x) { return x.id === item.spaceId; })[0];
    if (item.createdBy !== user.id && (!space || space.ownerId !== user.id)) { toast('Solo quien creó el movimiento o el administrador puede eliminarlo.'); return; }
    var ok = await act(async function () { await B.removeFamilyExpense(id); S.familyExpenses = S.familyExpenses.filter(function (x) { return x.id !== id; }); persist(); }); if (ok) render();
  }

  function viewHelp() {
    var back = '<button class="back" data-a="sub" data-v="menu">‹ Volver</button>';
    return back + '<h1 class="h2">Ayuda y primeros pasos</h1>' + banners() +
      '<div class="card"><div class="label">Empieza por lo básico</div><div class="help-step"><b>1. Crea o revisa tus cuentas</b><div class="muted">En Más › Cuentas, configura efectivo, bancos y billeteras en la moneda que realmente usan.</div></div><div class="help-step"><b>2. Registra ingresos y gastos</b><div class="muted">Usa el botón + o escribe una frase en Entrada rápida. Revisa la interpretación antes de guardarla.</div></div><div class="help-step"><b>3. Registra transferencias como transferencias</b><div class="muted">Mover dinero entre tus propias cuentas no debe aumentar ingresos ni gastos.</div></div><div class="help-step"><b>4. Guarda copias</b><div class="muted">Ve a Más › Copia de seguridad y descarga un JSON periódicamente. Guárdalo en un lugar seguro.</div></div></div>' +
      '<div class="card"><div class="label">Cómo se calculan las cifras</div><b>Saldo total</b><div class="muted">Suma los saldos de las cuentas conocidas por Cuadre y convierte otras monedas con la tasa guardada disponible. No es una conexión bancaria automática.</div><b>Disponible estimado</b><div class="muted">Saldo total − montos reservados para metas − obligaciones identificadas dentro de los próximos 30 días. Una reserva no mueve el dinero físicamente.</div><b>Proyección de fin de mes</b><div class="muted">Extrapola el promedio diario neto registrado en el mes actual. Puede variar mucho si hay pocos datos o ingresos irregulares.</div><b>Efecto de la tasa</b><div class="muted">Compara el valor equivalente de los saldos en moneda extranjera usando tasas guardadas. Es una diferencia de valoración referencial, no ingreso ni pérdida contable.</div></div>' +
      '<div class="card"><div class="label">Guardado y sincronización</div><div class="muted">En modo local, los cambios se guardan en este navegador y no pasan a otros dispositivos. Con Supabase, la sincronización depende de la conexión y de las políticas de la base de datos. Comprueba el estado de guardado y guarda copias externas.</div></div>' +
      '<div class="card"><div class="label">Accesibilidad y atajos</div><div class="muted">Escape cierra una ventana de registro o el menú rápido. En Movimientos, pulsa / cuando no estés escribiendo para ir al buscador. Pulsa ? para volver a esta guía desde cualquier pantalla.</div><div class="muted">Puedes configurar tamaño de texto, mayor contraste, movimiento reducido y ocultar saldos en Más › Apariencia.</div></div>' +
      '<button class="btn" data-a="start-onboarding-again">Repetir bienvenida guiada</button><button class="btn quiet" data-a="sub" data-v="demo">Probar con datos de ejemplo</button>';
  }
  function viewDemo() {
    return '<button class="back" data-a="sub" data-v="menu">‹ Volver</button><h1 class="h2">Modo demostración</h1>' + banners() +
      '<div class="card"><div class="demo-mark">🧪</div><h2 class="h2">Explora Cuadre sin miedo</h2><div class="muted">Usa cuentas, movimientos, presupuestos y metas ficticios. Las operaciones realizadas durante la demostración se guardan en una zona local separada; no envían datos a Supabase ni modifican tus finanzas reales.</div><div class="muted">Salir vuelve a tus datos habituales. La demostración no representa recomendaciones de inversión ni saldos reales.</div><button class="btn" data-a="start-demo">Entrar a la demostración</button></div>';
  }

  function viewUniversalSearch() {
    var q = universalQuery.trim().toLowerCase();
    var h = '<button class="back" data-a="sub" data-v="menu">‹ Volver</button><h1 class="h2">Buscar en Cuadre</h1>' + banners() +
      '<div class="card"><div class="field"><label class="label" for="universal-q">¿Qué quieres encontrar?</label><input id="universal-q" type="search" value="' + esc(universalQuery) + '" placeholder="Ej. supermercado, efectivo, meta equipo" autocomplete="off"></div><div class="muted">Busca en movimientos, cuentas, categorías, metas, pagos fijos y deudas.</div></div>';
    if (!q) return h + '<div class="empty"><div class="big">🔎</div><b>Todo a tu alcance</b><span class="muted">Escribe una palabra o nombre para ver resultados.</span></div>';
    var results = [];
    S.transactions.forEach(function(t){ var c=catById(t.categoryId), a=accById(t.accountId), text=[t.note,c&&c.name,a&&a.name,t.type,t.dateISO,t.currency].join(' ').toLowerCase(); if(text.indexOf(q)>=0) results.push({kind:'Movimiento',title:t.note||(c?c.name:'Movimiento'),sub:(c?c.name:'Sin categoría')+' · '+shortDate(t.dateISO),amount:fmt(t.amountMinor,t.currency),act:'edit',id:t.id}); });
    S.accounts.forEach(function(a){ if([a.name,a.currency].join(' ').toLowerCase().indexOf(q)>=0) results.push({kind:'Cuenta',title:a.name,sub:'Cuenta '+(a.currency==='USD'?'en dólares':'en bolívares'),amount:fmt(balance(a),a.currency),act:'search-account',id:a.id}); });
    S.categories.forEach(function(c){ if([c.name,c.kind].join(' ').toLowerCase().indexOf(q)>=0) results.push({kind:'Categoría',title:c.icon+' '+c.name,sub:c.kind==='income'?'Ingresos':'Gastos',amount:'',act:'search-category',id:c.id}); });
    (S.goals||[]).forEach(function(g){ if([g.name,g.note,g.currency].join(' ').toLowerCase().indexOf(q)>=0) results.push({kind:'Meta',title:g.name,sub:'Meta de ahorro',amount:fmt(g.savedMinor||0,g.currency)+' / '+fmt(g.targetMinor,g.currency),act:'search-goal',id:g.id}); });
    (S.scheduled||[]).forEach(function(x){ if([x.name,x.note].join(' ').toLowerCase().indexOf(q)>=0) results.push({kind:'Pago fijo',title:x.name,sub:'Próximo: '+dueLabel(x.nextDue),amount:fmt(x.amountMinor,x.currency),act:'search-pay',id:x.id}); });
    (S.debts||[]).forEach(function(d){ if([d.person,d.note].join(' ').toLowerCase().indexOf(q)>=0) results.push({kind:'Deuda',title:d.person,sub:d.kind==='owe'?'Debes':'Te deben',amount:fmt(debtLeft(d),d.currency),act:'search-debt',id:d.id}); });
    if(!results.length) return h+'<div class="empty"><div class="big">🫧</div><b>No encontré coincidencias</b><span class="muted">Prueba con otro nombre, categoría o descripción.</span></div>';
    h += '<div class="label">'+results.length+' resultado(s)</div><div class="col" style="gap:8px">'+results.slice(0,80).map(function(r){return '<button class="tx" data-a="'+r.act+'" data-id="'+esc(r.id)+'"><span class="ico">'+(r.kind==='Movimiento'?'↕️':r.kind==='Cuenta'?'🏦':r.kind==='Meta'?'🎯':r.kind==='Pago fijo'?'🔁':r.kind==='Deuda'?'🤝':'🏷️')+'</span><span class="mid"><b>'+esc(r.title)+'</b><span>'+esc(r.kind)+' · '+esc(r.sub)+'</span></span><span class="amt"><b>'+esc(r.amount)+'</b></span></button>';}).join('')+'</div>';
    if(results.length>80) h+='<div class="muted">Mostrando los primeros 80 resultados. Afina la búsqueda para encontrar algo concreto.</div>';
    return h;
  }
  function viewCalendar() {
    var month = /^\d{4}-\d{2}$/.test(calendarMonth) ? calendarMonth : today().slice(0,7), from=month+'-01', to=month+'-'+p2(new Date(+month.slice(0,4),+month.slice(5,7),0).getDate());
    var events=[];
    S.transactions.forEach(function(t){ if(t.dateISO>=from && t.dateISO<=to) events.push({date:t.dateISO,title:t.note||(catById(t.categoryId)||{}).name||'Movimiento',kind:t.type==='income'?'Ingreso':'Gasto',amount:fmt(t.amountMinor,t.currency),id:t.id,act:'edit',icon:t.type==='income'?'↙️':'↗️'}); });
    (S.scheduled||[]).forEach(function(x){if(x.active && x.nextDue>=from && x.nextDue<=to) events.push({date:x.nextDue,title:x.name,kind:'Pago previsto',amount:fmt(x.amountMinor,x.currency),id:x.id,act:'edit-sch',icon:'🔁'});});
    (S.plans||[]).forEach(function(x){var d=planDue(x);if(x.paidCount<x.count && d>=from && d<=to) events.push({date:d,title:x.name+' · cuota '+(x.paidCount+1),kind:'Cuota',amount:fmt(planAmount(x,x.paidCount),x.currency),id:x.id,act:'edit-plan',icon:'🛍️'});});
    events.sort(function(a,b){return a.date.localeCompare(b.date)||a.title.localeCompare(b.title);});
    var sumInc=0,sumExp=0; S.transactions.forEach(function(t){if(t.dateISO>=from&&t.dateISO<=to){if(t.type==='income')sumInc+=convert(t.amountMinor,t.currency,S.displayCurrency,t.rateE4);else sumExp+=convert(myMinor(t),t.currency,S.displayCurrency,t.rateE4);}});
    var h='<button class="back" data-a="sub" data-v="menu">‹ Volver</button><h1 class="h2">Calendario financiero</h1>'+banners()+'<div class="card"><div class="field"><label class="label" for="calendar-month">Mes</label><input id="calendar-month" type="month" value="'+esc(month)+'"></div><div class="grid2"><div><div class="label">Ingresos registrados</div><b class="pos">'+fmt(sumInc,S.displayCurrency)+'</b></div><div><div class="label">Gastos registrados</div><b>'+fmt(sumExp,S.displayCurrency)+'</b></div></div><div class="muted">Incluye movimientos registrados, pagos fijos y próximas cuotas. Las fechas futuras son compromisos previstos, no cargos bancarios confirmados.</div></div>';
    if(!events.length) return h+'<div class="empty"><div class="big">🗓️</div><b>Mes tranquilo</b><span class="muted">No hay movimientos ni pagos previstos en este mes.</span></div>';
    var grouped={}; events.forEach(function(e){(grouped[e.date]||(grouped[e.date]=[])).push(e);});
    Object.keys(grouped).sort().forEach(function(date){h+='<div class="label">'+new Date(date+'T12:00:00').toLocaleDateString('es-VE',{weekday:'long',day:'numeric',month:'long'})+'</div><div class="col" style="gap:8px">'+grouped[date].map(function(e){return '<button class="tx" data-a="'+e.act+'" data-id="'+esc(e.id)+'"><span class="ico">'+e.icon+'</span><span class="mid"><b>'+esc(e.title)+'</b><span>'+esc(e.kind)+'</span></span><span class="amt"><b>'+esc(e.amount)+'</b></span></button>';}).join('')+'</div>';});
    return h;
  }
  function viewHomeSettings() {
    return '<button class="back" data-a="sub" data-v="menu">‹ Volver</button><h1 class="h2">Personalizar inicio</h1>'+banners()+'<div class="card"><div class="label">Cantidad de información</div><label class="pref-row"><span><b>Vista compacta</b><span class="muted">Oculta proyección y resumen mensual de la pantalla Inicio para dejar más espacio a lo esencial.</span></span><input type="checkbox" data-home-pref="compact" '+(homePrefs.compact?'checked':'')+'></label><label class="pref-row"><span><b>Consejos de Cuadre</b><span class="muted">Muestra pequeños consejos para entender transferencias, metas y pagos.</span></span><input type="checkbox" data-home-pref="showTips" '+(homePrefs.showTips?'checked':'')+'></label><button class="btn quiet" data-a="home-prefs-reset">Restablecer preferencias de inicio</button></div><div class="card"><b>Consejo</b><div class="muted">Puedes cambiar estas opciones cuando quieras. No modifican tus movimientos, cuentas ni cálculos.</div></div>';
  }
  function viewSecurityCenter() {
    var cloudText=CLOUD&&user?'Sesión iniciada en Supabase. Los cambios se sincronizan cuando hay conexión.':'Modo local en este navegador. Si borras los datos del navegador podrías perder tu información.';
    return '<button class="back" data-a="sub" data-v="menu">‹ Volver</button><h1 class="h2">Privacidad y seguridad</h1>'+banners()+'<div class="card"><div class="label">Estado de almacenamiento</div>'+syncStatusHtml()+'<div class="muted">'+esc(cloudText)+'</div></div><div class="card"><div class="label">Recomendaciones</div><ul><li>Descarga copias JSON periódicamente y guárdalas fuera del dispositivo.</li><li>No compartas capturas con saldos, correos ni códigos de recuperación visibles.</li><li>Usa una contraseña única y cierra sesión en equipos compartidos.</li><li>Ocultar saldos es solo una ayuda visual; no protege la cuenta si otra persona tiene acceso al dispositivo desbloqueado.</li></ul></div><button class="btn" data-a="sub" data-v="backup">Abrir copias de seguridad</button><button class="btn quiet" data-a="sub" data-v="theme">Privacidad visual y accesibilidad</button>'+(CLOUD&&user?'<button class="btn quiet" data-a="logout">Cerrar sesión en este dispositivo</button>':'');
  }

  function viewMore() {
    if (sub === 'menu') {
      var r = S.rate.rateE4;
      var items = [
        ['search', '🔎', 'Buscar en Cuadre', 'Movimientos, cuentas, categorías y metas'],
        ['calendar', '🗓️', 'Calendario financiero', 'Movimientos y compromisos por fecha'],
        ['home-settings', '🧩', 'Personalizar inicio', 'Ajusta la vista a tu manera'],
        ['security', '🛡️', 'Privacidad y seguridad', 'Sincronización, copias y privacidad'],
        ['accounts', '🏦', 'Cuentas', S.accounts.length + ' cuentas'],
        ['cats', '🏷️', 'Categorías', S.categories.length + ' categorías'],
        ['budgets', '🎯', 'Presupuestos', S.budgets.length ? S.budgets.length + (S.budgets.length === 1 ? ' activo' : ' activos') : 'Pon límites por categoría'],
        ['reports', '📊', 'Reportes', 'Gráficos y exportar PDF / Excel'],
        ['quick', '⚡', 'Entrada rápida', 'Escribe un gasto o ingreso en una frase'],
        ['transfers', '🔄', 'Transferencias', (S.transfers || []).length + ' transferencias entre cuentas'],
        ['goals', '🎯', 'Metas de ahorro', (S.goals || []).length + ' metas activas'],
        ['allocation', '🪙', 'Distribución del ingreso', 'Porcentajes para organizar tu dinero'],
        ['assistant', '✨', 'Asistente financiero', 'Pregunta sobre tus datos o prepara movimientos'],
        ['help', '❔', 'Ayuda y primeros pasos', 'Guía, cálculos y preguntas frecuentes'],
        ['demo', '🧪', 'Modo demostración', 'Explora con movimientos ficticios separados'],
        ['family', '👨‍👩‍👧', 'Espacio compartido', 'Cuentas compartidas para hogar o pareja'],
        ['rate', '💱', 'Tasas', r > 0 ? 'Dólar BCV: Bs ' + fmtRate(r) : 'Sin definir'],
        ['remind', '🔔', 'Avisos', S.prefs.remindDays + (S.prefs.remindDays === 1 ? ' día antes' : ' días antes')],
        ['theme', '🌗', 'Apariencia', { light: 'Claro', dark: 'Oscuro', system: 'Como el dispositivo' }[readTheme()]],
        ['backup', '💾', CLOUD ? 'Exportar e importar' : 'Copia de seguridad', CLOUD ? 'Descarga o trae datos' : 'Guarda o restaura tus datos']
      ];
      var pf = S.profile || {}, h = '<h1 class="h2">Más</h1>' + banners();
      if (CLOUD && user) {
        h += '<button class="link" data-a="sub" data-v="profile">' + pic(pf.avatar, pf.username || user.email, 'md') +
          '<span class="col"><b>' + (pf.username ? '@' + esc(pf.username) : 'Tu perfil') + '</b><span class="muted who">' + esc(user.email || '') + '</span></span><span class="chev" aria-hidden="true">›</span></button>';
      }
      h += items.map(function (i) {
        return '<button class="link" data-a="sub" data-v="' + i[0] + '"><span class="e" aria-hidden="true">' + i[1] + '</span><span class="col"><b>' + i[2] + '</b><span class="muted">' + i[3] + '</span></span><span class="chev" aria-hidden="true">›</span></button>';
      }).join('');
      if (CLOUD && user) h += '<button class="btn quiet" data-a="logout">Cerrar sesión</button>';
      h += '<div class="card privacy-note"><b>Estado de tus datos</b>' + syncStatusHtml() + '<div class="muted">Haz copias JSON periódicas y guárdalas fuera de este dispositivo. Una copia en el navegador no reemplaza un respaldo externo.</div></div>';
      return h + '<div class="muted">Cuadre v0.9 Recovery Code Edition · ' + (demoMode ? 'demostración aislada.' : CLOUD ? 'tus datos sincronizan con la nube cuando la conexión está disponible.' : 'modo local: tus datos se guardan en este navegador.') + '</div>';
    }
    var back = '<button class="back" data-a="sub" data-v="menu">‹ Volver</button>';
    if (sub === 'help') return viewHelp();
    if (sub === 'search') return viewUniversalSearch();
    if (sub === 'calendar') return viewCalendar();
    if (sub === 'home-settings') return viewHomeSettings();
    if (sub === 'security') return viewSecurityCenter();
    if (sub === 'demo') return viewDemo();
    if (sub === 'budgets') return viewBudgets();
    if (sub === 'remind') return viewRemind();
    if (sub === 'f-bud') return viewForm();
    if (sub === 'reports') return viewReports();
    if (sub === 'quick') return viewQuickEntry();
    if (sub === 'transfers') return viewTransfers();
    if (sub === 'goals') return viewGoals();
    if (sub === 'allocation') return viewAllocation();
    if (sub === 'assistant') return viewAssistant();
    if (sub === 'family') return viewFamily();
    if (sub === 'accounts') {
      var ha = back + '<h1 class="h2">Cuentas</h1>' + banners() + '<div class="muted">Toca una cuenta para cambiarle el nombre o ponerle un logo.</div>';
      S.accounts.forEach(function (a) {
        ha += '<button class="card cardbtn" data-a="edit-acc" data-id="' + esc(a.id) + '" aria-label="Editar cuenta ' + esc(a.name) + '"><div class="row"><div class="rowl">' + pic(a.logo, a.name, 'md') + '<div class="col"><b>' + esc(a.name) + '</b><span class="muted">' + (a.currency === 'USD' ? 'Dólares' : 'Bolívares') + '</span></div></div><span class="num">' + fmt(balance(a), a.currency) + '</span></div></button>';
      });
      ha += '<div class="card"><div class="label">Nueva cuenta</div>' +
        '<div class="field"><label for="an">Nombre</label><input id="an" maxlength="30" placeholder="Ej. Banesco" autocomplete="off"></div>' +
        '<div class="seg" role="group" aria-label="Moneda de la cuenta"><button data-a="acur" data-v="VES" aria-pressed="' + (newAccCur === 'VES') + '">Bolívares</button><button data-a="acur" data-v="USD" aria-pressed="' + (newAccCur === 'USD') + '">Dólares</button></div>' +
        '<div class="field"><label for="ao">Saldo actual (opcional)</label><input id="ao" inputmode="decimal" placeholder="0,00" autocomplete="off"></div>' +
        (msg ? '<div class="err" role="alert">' + esc(msg) + '</div>' : '') +
        '<button class="btn" data-a="add-account">Agregar cuenta</button></div>';
      return ha;
    }
    if (sub === 'acc-edit' && editAcc) {
      var ea = accById(editAcc.id);
      if (!ea) { sub = 'accounts'; return viewMore(); }
      return '<button class="back" data-a="sub" data-v="accounts">‹ Cuentas</button><h1 class="h2">Editar cuenta</h1>' + banners() +
        '<div class="card"><div class="rowl">' + pic(editAcc.logo, editAcc.name || ea.name, 'lg') +
        '<div class="col"><label class="btn quiet small" for="logofile">' + (editAcc.logo ? 'Cambiar logo' : 'Subir logo') + '</label>' +
        '<input id="logofile" class="file" type="file" accept="image/*">' +
        (editAcc.logo ? '<button class="linkbtn" data-a="rm-logo">Quitar logo</button>' : '') + '</div></div>' +
        '<div class="muted">Opcional. Se recorta en cuadrado; funciona mejor con el logo del banco en una imagen cuadrada.</div></div>' +
        '<div class="card"><div class="field"><label class="label" for="en">Nombre</label><input id="en" maxlength="30" autocomplete="off" value="' + esc(editAcc.name) + '"></div>' +
        '<div class="muted">Moneda: ' + (ea.currency === 'USD' ? 'Dólares' : 'Bolívares') + ' (no se puede cambiar). Cambiar el nombre no afecta tus movimientos.</div>' +
        (editAcc.msg ? '<div class="err" role="alert">' + esc(editAcc.msg) + '</div>' : '') +
        '<button class="btn" data-a="save-acc"' + (editAcc.saving ? ' disabled' : '') + '>' + (editAcc.saving ? 'Guardando…' : 'Guardar cambios') + '</button></div>' +
        (function () {
          var n = S.transactions.filter(function (t) { return t.accountId === ea.id; }).length;
          var warn = n ? 'Esta cuenta tiene ' + n + (n === 1 ? ' movimiento' : ' movimientos') + ': también se eliminarán y los totales cambiarán.' : 'Esta cuenta no tiene movimientos.';
          return '<div class="card dangerzone">' + (arm && arm.kind === 'acc' && arm.id === ea.id
            ? slideHtml('acc', ea.id, esc(warn))
            : '<button class="btn danger" data-a="ask-del" data-k="acc" data-id="' + esc(ea.id) + '"' + (editAcc.saving ? ' disabled' : '') + '>Eliminar cuenta</button>') + '</div>';
        })();
    }
    if (sub === 'theme') {
      var th = readTheme();
      return back + '<h1 class="h2">Apariencia y accesibilidad</h1>' + banners() +
        '<div class="card"><div class="label">Tema</div><div class="seg" role="group" aria-label="Tema"><button data-a="theme" data-v="system" aria-pressed="' + (th === 'system') + '">Sistema</button><button data-a="theme" data-v="light" aria-pressed="' + (th === 'light') + '">Claro</button><button data-a="theme" data-v="dark" aria-pressed="' + (th === 'dark') + '">Oscuro</button></div><div class="muted">Sistema sigue el modo de tu dispositivo. La elección se guarda en este navegador.</div></div>' +
        '<div class="card"><div class="label">Tamaño de texto</div><div class="seg" role="group" aria-label="Tamaño de texto"><button data-a="pref-font" data-v="small" aria-pressed="' + (uiPrefs.fontSize === 'small') + '">Pequeño</button><button data-a="pref-font" data-v="normal" aria-pressed="' + (uiPrefs.fontSize === 'normal') + '">Normal</button><button data-a="pref-font" data-v="large" aria-pressed="' + (uiPrefs.fontSize === 'large') + '">Grande</button></div><div class="pref-preview">Este es un ejemplo de cómo se verá el texto en Cuadre.</div></div>' +
        '<div class="card pref-list"><label class="pref-row"><span><b>Ocultar saldos</b><span class="muted">Difumina los importes en pantalla cuando estés en público.</span></span><input type="checkbox" data-pref="hideBalances" ' + (uiPrefs.hideBalances ? 'checked' : '') + ' aria-label="Ocultar saldos"></label>' +
        '<label class="pref-row"><span><b>Reducir animaciones</b><span class="muted">Reduce transiciones y movimiento. También se respeta la preferencia del sistema.</span></span><input type="checkbox" data-pref="reduceMotion" ' + (uiPrefs.reduceMotion ? 'checked' : '') + ' aria-label="Reducir animaciones"></label>' +
        '<label class="pref-row"><span><b>Mayor contraste</b><span class="muted">Resalta bordes y separación entre elementos.</span></span><input type="checkbox" data-pref="highContrast" ' + (uiPrefs.highContrast ? 'checked' : '') + ' aria-label="Mayor contraste"></label></div>' +
        '<button class="btn quiet" data-a="reset-onboarding">Volver a ver la guía de bienvenida</button><div class="muted">Estas preferencias solo afectan a este dispositivo. Ocultar saldos es una ayuda visual de privacidad, no un control de acceso.</div>';
    }
    if (sub === 'profile' && CLOUD && user) {
      var pd = profDraft || { username: '', avatar: '' }, pf2 = S.profile || {};
      return back + '<h1 class="h2">Tu perfil</h1>' + banners() +
        (pf2.available === false ? '<div class="banner bad" role="alert">Falta actualizar la base de datos: ejecuta schema.sql completo en el SQL Editor de Supabase y recarga.</div>' : '') +
        '<div class="card"><div class="rowl">' + pic(pd.avatar, pd.username || user.email, 'xl') +
        '<div class="col"><label class="btn quiet small" for="avfile">' + (pd.avatar ? 'Cambiar foto' : 'Subir foto') + '</label>' +
        '<input id="avfile" class="file" type="file" accept="image/*">' +
        (pd.avatar ? '<button class="linkbtn" data-a="rm-avatar">Quitar foto</button>' : '') + '</div></div>' +
        '<div class="muted">La foto es opcional y solo la ves tú.</div></div>' +
        '<div class="card"><div class="field"><label class="label" for="pu">Usuario</label><input id="pu" maxlength="20" autocapitalize="none" autocomplete="username" placeholder="ej. daniela_14" value="' + esc(pd.username) + '"></div>' +
        '<div class="muted">De 3 a 20 caracteres: letras sin acento, números, punto o guion bajo.</div>' +
        '<div class="field"><label class="label" for="pe">Correo</label><input id="pe" value="' + esc(user.email || '') + '" disabled></div>' +
        (msg ? '<div class="' + (msgOk ? 'muted' : 'err') + '" role="alert">' + esc(msg) + '</div>' : '') +
        '<button class="btn" data-a="save-profile"' + (busy ? ' disabled' : '') + '>' + (busy ? 'Guardando…' : 'Guardar perfil') + '</button></div>' +
        '<button class="btn quiet" data-a="logout">Cerrar sesión</button>';
    }
    if (sub === 'cats') {
      var hc = back + '<h1 class="h2">Categorías</h1>' + banners() + (topMsg ? '<div class="banner bad" role="alert">' + esc(topMsg) + '</div>' : '');
      [['expense', 'Gastos'], ['income', 'Ingresos']].forEach(function (k) {
        hc += '<div class="label">' + k[1] + '</div>';
        S.categories.filter(function (c) { return c.kind === k[0]; }).sort(function (a, b) { return a.sortOrder - b.sortOrder; }).forEach(function (c) {
          var armed = arm && arm.kind === 'cat' && arm.id === c.id;
          hc += '<div class="card"><div class="row"><span>' + esc(c.icon) + ' ' + esc(c.name) + '</span>' + (armed ? '' : '<button style="color:var(--expense);font-weight:800;min-height:44px" data-a="ask-del" data-k="cat" data-id="' + esc(c.id) + '" aria-label="Eliminar categoría ' + esc(c.name) + '">Eliminar</button>') + '</div>' + (armed ? slideHtml('cat', c.id, '') : '') + '</div>';
        });
      });
      hc += '<div class="card"><div class="label">Nueva categoría</div>' +
        '<div class="seg" role="group" aria-label="Tipo de categoría"><button data-a="ckind" data-v="expense" aria-pressed="' + (newCatKind === 'expense') + '">Gasto</button><button data-a="ckind" data-v="income" aria-pressed="' + (newCatKind === 'income') + '">Ingreso</button></div>' +
        '<div class="field"><label for="cn">Nombre</label><input id="cn" maxlength="24" placeholder="Ej. Mascotas" autocomplete="off"></div>' +
        '<div class="field"><label for="ci">Ícono (un emoji)</label><input id="ci" maxlength="4" value="🏷️"></div>' +
        (msg ? '<div class="err" role="alert">' + esc(msg) + '</div>' : '') +
        '<button class="btn" data-a="add-cat">Agregar categoría</button></div>';
      return hc;
    }
    if (sub === 'rate') {
      var rr = S.rate, srcTxt = rr.source === 'bcv' ? 'Actualizada automáticamente' : rr.source === 'manual' ? 'Escrita a mano' : 'Todavía no hay tasa';
      var when = rr.updatedAt && !isNaN(new Date(rr.updatedAt)) ? ' · ' + new Date(rr.updatedAt).toLocaleDateString('es-VE') : '';
      return back + '<h1 class="h2">Tasa del dólar</h1>' + banners() + '<div class="card"><div class="label">Dólar oficial (BCV)</div><div class="hero">' + (rr.rateE4 > 0 ? 'Bs ' + fmtRate(rr.rateE4) : 'Sin definir') +
        '</div><div class="muted">' + srcTxt + (rr.rateE4 > 0 ? when : '') + '</div></div>' +
        (msg ? '<div class="banner bad" role="alert">' + esc(msg) + '</div>' : '') +
        '<button class="btn" data-a="fetch-rate"' + (busy ? ' disabled' : '') + '>' + (busy ? 'Buscando…' : 'Actualizar desde internet') + '</button>' +
        '<div class="card"><div class="label">Escribirla a mano</div><div class="field"><input id="rm" inputmode="decimal" placeholder="Ej. 873,87" aria-label="Tasa a mano" autocomplete="off"></div>' +
        (rateErr ? '<div class="err" role="alert">' + esc(rateErr) + '</div>' : '') +
        '<button class="btn quiet" data-a="save-rate">Guardar tasa</button></div>' +
        '<div class="muted">Cada movimiento guarda la tasa del día en que lo registras, así tu historial no cambia cuando sube el dólar.</div>' + refCards();
    }
    if (sub === 'backup') {
      var hb = back + '<h1 class="h2">' + (CLOUD ? 'Copias e importación' : 'Copia de seguridad') + '</h1>' + banners() +
        '<div class="muted">Crea una copia JSON completa y guárdala fuera del dispositivo. No incluye información de sesión ni claves. Restaura con cuidado: en modo local reemplaza los datos actuales; en la nube intenta sumar los registros.</div>' +
        '<textarea class="box" id="bk" readonly aria-label="Vista previa de copia JSON">' + esc(JSON.stringify(S, function (k, v) { return k === 'profile' ? undefined : v; })) + '</textarea>' +
        '<button class="btn" data-a="download-backup">Descargar copia JSON</button><button class="btn quiet" data-a="copy-backup">Copiar copia JSON</button>' +
        '<div class="card"><div class="label">Restaurar una copia JSON</div><label class="label" for="backupfile">Selecciona un archivo .json</label><input id="backupfile" class="file" type="file" accept="application/json,.json"><label class="btn quiet small" for="backupfile">Elegir archivo JSON</label>' +
        '<div class="field"><label class="label" for="rs">O pega una copia JSON</label><textarea class="box" id="rs" aria-label="Pegar copia JSON">' + esc(restoreDraftText) + '</textarea></div>' +
        (msg ? '<div class="' + (msgOk ? 'muted' : 'err') + '" role="alert">' + esc(msg) + '</div>' : '') +
        '<button class="btn quiet" data-a="restore"' + (busy ? ' disabled' : '') + '>Restaurar / importar JSON</button></div>' +
        '<div class="card"><div class="label">Importar movimientos CSV</div><div class="muted">Usa columnas como Fecha, Tipo, Monto, Moneda, Cuenta, Categoría y Nota. Se mostrará una vista previa antes de añadir los movimientos. No se modifica ni borra lo existente.</div><label class="label" for="csvfile">Archivo CSV (exportado desde banco o Excel)</label><input id="csvfile" class="file" type="file" accept=".csv,text/csv"><label class="btn quiet small" for="csvfile">Elegir archivo CSV</label>' +
        (csvImportDraft ? '<div class="muted">Filas válidas detectadas: ' + csvImportDraft.rows.length + ' · filas omitidas: ' + csvImportDraft.errors.length + '</div>' + (csvImportDraft.errors.length ? '<div class="err">' + esc(csvImportDraft.errors.slice(0, 5).join(' · ')) + '</div>' : '') + '<button class="btn" data-a="confirm-csv-import">Importar movimientos válidos</button>' : '') +
        '</div>';
      return hb;
    }
    return '';
  }

  function animateHeroNumbers() {
    if (!motionAllowed()) return;
    var els = $app.querySelectorAll('.hero');
    if (!els.length || typeof window.requestAnimationFrame !== 'function') return;
    if (heroAnimationFrame) cancelAnimationFrame(heroAnimationFrame);
    els.forEach(function (el) {
      var finalText = el.textContent || '', match = /(\d[\d.]*)(?:,(\d{1,2}))?/.exec(finalText);
      if (!match) return;
      var whole = Number(match[1].replace(/\./g, '')), cents = Number((match[2] || '').padEnd(2, '0') || 0);
      var targetMinor = whole * 100 + cents;
      if (!Number.isFinite(targetMinor) || targetMinor < 0 || targetMinor > 1e15) return;
      var prefix = finalText.slice(0, match.index), suffix = finalText.slice(match.index + match[0].length);
      var started = 0, duration = 560;
      function tick(now) {
        if (!started) started = now;
        var progress = Math.min(1, (now - started) / duration);
        // Easing out: rápido al inicio y suave al terminar.
        var eased = 1 - Math.pow(1 - progress, 3);
        var current = Math.round(targetMinor * eased), nWhole = Math.floor(current / 100), nCents = current % 100;
        var number = group(String(nWhole)) + (match[2] !== undefined ? ',' + String(nCents).padStart(2, '0') : '');
        el.textContent = prefix + number + suffix;
        if (progress < 1 && el.isConnected) heroAnimationFrame = requestAnimationFrame(tick);
        else el.textContent = finalText;
      }
      el.textContent = prefix + (match[2] !== undefined ? '0,00' : '0') + suffix;
      heroAnimationFrame = requestAnimationFrame(tick);
    });
  }
  function renderQuickActions() {
    if (!$quickActions) return;
    $quickActions.hidden = !quickActionsOpen;
    $quickActions.innerHTML = quickActionsOpen
      ? '<button class="quick-action" data-a="quick-action" data-v="expense"><span class="quick-icon" aria-hidden="true">↗</span><span>Gasto</span></button>' +
        '<button class="quick-action" data-a="quick-action" data-v="income"><span class="quick-icon" aria-hidden="true">↙</span><span>Ingreso</span></button>' +
        '<button class="quick-action" data-a="quick-action" data-v="transfer"><span class="quick-icon" aria-hidden="true">⇄</span><span>Transferir</span></button>'
      : '';
  }
  function closeQuickActions() {
    quickActionsOpen = false;
    renderQuickActions();
    var plus = $nav ? $nav.querySelector('.plus') : null;
    if (plus) { plus.textContent = '+'; plus.setAttribute('aria-expanded', 'false'); plus.setAttribute('aria-label', 'Registrar un movimiento'); }
  }
  function onboardingDoneKey() { return 'cuadre:onboarding:v08:done:' + (demoMode ? 'demo' : user ? user.id : 'local'); }
  function onboardingIsDone() { try { return localStorage.getItem(onboardingDoneKey()) === '1'; } catch (e) { return false; } }
  function renderOnboardingOverlay() {
    var root = document.getElementById('onboarding-root');
    if (!root) { root = document.createElement('div'); root.id = 'onboarding-root'; document.body.appendChild(root); }
    if (!S || demoMode || onboardingIsDone()) { root.innerHTML = ''; onboardingState = null; return; }
    if (!onboardingState) onboardingState = { step: 0, currency: S.displayCurrency || 'VES', focus: 'control' };
    var o = onboardingState, content = '', progress = (o.step + 1) + ' de 4';
    if (o.step === 0) content = '<div class="onboard-emoji">✦</div><p class="label">BIENVENIDO A CUADRE</p><h2>Tu dinero, más claro y a tu manera.</h2><p>En unos pasos tendrás una base sencilla para registrar gastos, entender tus cuentas y planificar tus metas.</p><div class="onboard-benefits"><span>✓ Sin tutoriales interminables</span><span>✓ Puedes saltar lo que no necesites</span><span>✓ Tus cálculos explican qué incluyen</span></div><button class="btn" data-a="onboard-next">Empezar</button>';
    else if (o.step === 1) content = '<p class="label">PASO 2 · PREFERENCIAS</p><h2>¿En qué moneda quieres ver el resumen?</h2><p>Esto cambia la moneda de visualización; no convierte ni mueve físicamente el saldo de tus cuentas.</p><div class="seg onboard-seg"><button data-a="onboard-currency" data-v="VES" aria-pressed="' + (o.currency === 'VES') + '">Bolívares (Bs)</button><button data-a="onboard-currency" data-v="USD" aria-pressed="' + (o.currency === 'USD') + '">Dólares ($)</button></div><button class="btn" data-a="onboard-next">Continuar</button>';
    else if (o.step === 2) content = '<p class="label">PASO 3 · TU PRIORIDAD</p><h2>¿Qué te gustaría mejorar primero?</h2><p>Solo usaremos esta preferencia para adaptar consejos iniciales. Puedes cambiarla después.</p><div class="onboard-options"><button data-a="onboard-focus" data-v="control" aria-pressed="' + (o.focus === 'control') + '"><span>📒</span><b>Controlar mis gastos</b><small>Entender dónde va mi dinero</small></button><button data-a="onboard-focus" data-v="saving" aria-pressed="' + (o.focus === 'saving') + '"><span>🎯</span><b>Ahorrar para metas</b><small>Reservar dinero con intención</small></button><button data-a="onboard-focus" data-v="bills" aria-pressed="' + (o.focus === 'bills') + '"><span>🗓️</span><b>Organizar mis pagos</b><small>Anticiparme a los vencimientos</small></button></div><button class="btn" data-a="onboard-next">Continuar</button>';
    else content = '<div class="onboard-emoji">✓</div><p class="label">PASO 4 · TODO LISTO</p><h2>Ya puedes empezar.</h2><p>Cuadre te mostrará saldos estimados, presupuestos y movimientos. Si no hay datos aún, algunas cifras aparecerán vacías hasta registrar tus primeras operaciones.</p><button class="btn" data-a="onboard-finish">Ir a Cuadre</button><button class="btn quiet" data-a="onboard-first-move">Registrar mi primer movimiento</button>';
    root.innerHTML = '<div class="onboarding-backdrop"><section class="onboarding-card" role="dialog" aria-modal="true" aria-labelledby="onboard-title"><div class="onboard-top"><span class="brand">Cuadre</span><span class="onboard-count">' + progress + '</span></div><div id="onboard-title" class="onboard-content">' + content + '</div><div class="onboard-footer"><span class="onboard-progress"><i style="width:' + ((o.step + 1) * 25) + '%"></i></span><button class="switch" data-a="onboard-skip">Saltar guía</button></div></section></div>';
    var focus = root.querySelector('.onboard-content button'); if (focus) focus.focus({ preventScroll: true });
  }
  function finishOnboarding(openFirstMove) {
    var o = onboardingState || { currency: S.displayCurrency, focus: 'control' };
    S.displayCurrency = o.currency === 'USD' ? 'USD' : 'VES';
    persist();
    try { localStorage.setItem(onboardingDoneKey(), '1'); localStorage.setItem('cuadre:onboarding:focus:' + (user ? user.id : 'local'), o.focus || 'control'); } catch (e) {}
    onboardingState = null;
    var root = document.getElementById('onboarding-root'); if (root) root.innerHTML = '';
    render();
    if (openFirstMove) openSheet(); else toast('Bienvenido a Cuadre. Puedes empezar registrando tu primer movimiento.');
  }
  function makeDemoData() {
    var d = initialData();
    var acc = function (name) { return d.accounts.filter(function (a) { return a.name === name; })[0]; };
    var cat = function (name, kind) { return d.categories.filter(function (c) { return c.name === name && c.kind === kind; })[0]; };
    var usdCash = acc('Efectivo $'), vesCash = acc('Efectivo Bs'), bank = acc('Banco 1'), binance = acc('Binance');
    usdCash.openingMinor = 12000; vesCash.openingMinor = 650000; bank.openingMinor = 4800000; binance.openingMinor = 23000;
    d.rate = { rateE4: 3650000, updatedAt: new Date().toISOString(), source: 'demo' }; d.rateHistory = [{ rateE4: 3650000, source: 'demo', recordedAt: new Date().toISOString() }];
    var now = new Date().toISOString();
    function add(type, amount, currency, account, category, note, daysAgo) { d.transactions.push({ id: uuid(), type: type, amountMinor: amount, currency: currency, rateE4: d.rate.rateE4, categoryId: cat(category, type).id, accountId: account.id, note: note, dateISO: addDays(today(), -daysAgo), createdAt: now, updatedAt: now, split: null, receiptImage: '' }); }
    add('income', 85000, 'USD', binance, 'Freelance', 'Proyecto freelance', 4);
    add('expense', 1850, 'USD', usdCash, 'Alimentación', 'Almuerzo', 1);
    add('expense', 900, 'USD', usdCash, 'Transporte', 'Taxi', 2);
    add('expense', 520000, 'VES', vesCash, 'Servicios', 'Internet y teléfono', 5);
    add('income', 1500000, 'VES', bank, 'Sueldo', 'Pago recibido', 7);
    add('expense', 3400, 'USD', binance, 'Compras', 'Material de trabajo', 3);
    var food = cat('Alimentación','expense'), transit = cat('Transporte','expense');
    d.budgets = [{ id: uuid(), categoryId: food.id, limitMinor: 15000, currency: 'USD', createdAt: now }, { id: uuid(), categoryId: transit.id, limitMinor: 7500, currency: 'USD', createdAt: now }];
    d.goals = [{ id: uuid(), name: 'Equipo de trabajo', targetMinor: 100000, savedMinor: 37500, currency: 'USD', dueDate: addDays(today(), 90), note: 'Meta de ejemplo', createdAt: now }, { id: uuid(), name: 'Fondo de emergencias', targetMinor: 200000, savedMinor: 60000, currency: 'USD', dueDate: '', note: '', createdAt: now }];
    d.scheduled = [{ id: uuid(), name: 'Internet', amountMinor: 2500, currency: 'VES', categoryId: cat('Servicios','expense').id, accountId: bank.id, frequency: 'monthly', nextDue: addDays(today(), 5), anchorDay: new Date().getDate(), remindDays: 3, active: true, createdAt: now }];
    d.displayCurrency = 'USD';
    return norm(d);
  }
  function startDemoMode() {
    demoMode = true; CLOUD = false; user = null; offline = false; S = makeDemoData();
    tab = 'home'; sub = 'menu'; onboardingState = null; quickActionsOpen = false; undoLastTx = null; quickParsed = null; assistantDraft = null; sheet = null; renderSheet();
    try { localStorage.setItem(onboardingDoneKey(), '1'); } catch (e) {}
    render(); window.scrollTo(0, 0); toast('Modo demostración iniciado. Tus datos reales están separados.');
  }
  async function exitDemoMode() {
    demoMode = false; CLOUD = CLOUD_CONFIGURED; user = null; S = null; onboardingState = null; undoLastTx = null; quickParsed = null; assistantDraft = null; tab = 'home'; sub = 'menu';
    try { localStorage.removeItem(DEMO_KEY); } catch (e) {}
    if (CLOUD_CONFIGURED) await boot();
    else { await startApp(); }
  }

  function render() {
    if (!S) return;
    var motionViewKey = tab + ':' + sub;
    var shouldAnimateView = motionViewKey !== lastMotionViewKey || motionRefreshRequested;
    motionRefreshRequested = false;
    lastMotionViewKey = motionViewKey;
    $app.innerHTML = tab === 'home' ? viewHome() : tab === 'moves' ? viewMoves() : tab === 'pay' ? viewPay() : viewMore();
    if (shouldAnimateView && motionAllowed()) {
      $app.classList.remove('motion-enter');
      // Fuerza un nuevo ciclo de animación solo al cambiar de pantalla, no al actualizar cifras.
      void $app.offsetWidth;
      $app.classList.add('motion-enter');
      clearTimeout(motionResetTimer);
      motionResetTimer = setTimeout(function () { $app.classList.remove('motion-enter'); }, 900);
      if (tab === 'home') animateHeroNumbers();
    } else {
      $app.classList.remove('motion-enter');
    }
    $navwrap.hidden = false;
    var tabs = [['home', '🏠', 'Inicio'], ['moves', '↕️', 'Movimientos'], ['pay', '🗓️', 'Pagos'], ['more', '⋯', 'Más']], nb = urgent().filter(function (i) { return i.level === 'late' || i.level === 'today'; }).length;
    var btn = function (t) {
      return '<button data-a="tab" data-v="' + t[0] + '"' + (tab === t[0] ? ' aria-current="page"' : '') + '><span class="e" aria-hidden="true">' + t[1] + '</span>' + t[2] + (t[0] === 'pay' && nb ? '<i class="dot" aria-label="' + nb + ' por atender">' + nb + '</i>' : '') + '</button>';
    };
    $nav.innerHTML = btn(tabs[0]) + btn(tabs[1]) + '<button class="plus" data-a="new" aria-label="' + (quickActionsOpen ? 'Cerrar acciones rápidas' : 'Registrar un movimiento') + '" aria-expanded="' + quickActionsOpen + '">' + (quickActionsOpen ? '×' : '+') + '</button>' + btn(tabs[2]) + btn(tabs[3]);
    renderQuickActions();
    applyUiPrefs();
    renderOnboardingOverlay();
  }

  /* ---------- 10. Pantalla de acceso (modo nube) ---------- */
  function renderAuth() {
    quickActionsOpen = false; renderQuickActions();
    $navwrap.hidden = true; sheet = null; renderSheet();
    var signup = authMode === 'signup', resetMode = authMode === 'reset', codeMode = authMode === 'resetCode', updateMode = authMode === 'updatePassword';
    var heading = signup ? 'Crea tu cuenta para guardar tus finanzas en la nube y usarlas desde cualquier dispositivo.' : resetMode ? 'Te enviaremos un código de verificación por correo.' : codeMode ? 'Escribe el código que recibiste por correo para verificar tu identidad.' : updateMode ? 'Elige una contraseña nueva para tu cuenta.' : 'Inicia sesión para ver tus finanzas.';
    $app.innerHTML = '<div class="auth"><div class="brand">Cuadre</div>' +
      '<div class="muted">' + heading + '</div>' +
      '<form id="authform" novalidate>' +
      (signup ? '<div class="field"><label class="label" for="un">Usuario</label><input id="un" maxlength="20" autocomplete="username" autocapitalize="none" placeholder="ej. daniela_14" value="' + esc(authDraft.username) + '" required></div>' : '') +
      (!updateMode ? '<div class="field"><label class="label" for="em">Correo</label><input id="em" type="email" autocomplete="email" inputmode="email" autocapitalize="none" value="' + esc(authDraft.email) + '" ' + (codeMode ? 'readonly aria-describedby="code-help"' : '') + ' required></div>' : '') +
      (codeMode ? '<div class="field"><label class="label" for="recovery-code">Código de verificación</label><input id="recovery-code" class="otp-input" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,8}" minlength="6" maxlength="8" placeholder="Código recibido por correo" aria-describedby="code-help" required></div><div class="muted" id="code-help">Introduce los números del correo de recuperación. No compartas este código con nadie.</div>' : '') +
      (!resetMode && !codeMode ? '<div class="field"><label class="label" for="pw">' + (updateMode ? 'Nueva contraseña' : 'Contraseña') + '</label><input id="pw" type="password" autocomplete="' + (signup || updateMode ? 'new-password' : 'current-password') + '" minlength="' + (signup || updateMode ? 8 : 6) + '" required></div>' : '') +
      ((signup || updateMode) ? '<div class="field"><label class="label" for="pw2">Confirmar contraseña</label><input id="pw2" type="password" autocomplete="new-password" required></div><div class="muted">Mínimo 8 caracteres.</div>' : '') +
      (authMsg ? '<div class="' + (authMsg.ok ? 'muted' : 'err') + '" role="alert">' + esc(authMsg.text) + '</div>' : '') +
      '<button class="btn" type="submit"' + (authBusy ? ' disabled' : '') + '>' + (authBusy ? 'Un momento…' : signup ? 'Crear cuenta' : resetMode ? 'Enviar código' : codeMode ? 'Verificar código' : updateMode ? 'Guardar nueva contraseña' : 'Entrar') + '</button></form>' +
      (!updateMode ? '<button class="switch" data-a="auth-switch">' + (signup ? 'Ya tengo cuenta · Entrar' : (resetMode || codeMode) ? 'Volver a iniciar sesión' : 'No tengo cuenta · Crear una') + '</button>' : '') +
      (codeMode ? '<button class="switch" data-a="resend-recovery-code">Volver a enviar código</button><button class="switch" data-a="change-recovery-email">Usar otro correo</button>' : '') +
      (!signup && !resetMode && !codeMode && !updateMode ? '<button class="switch" data-a="forgot-password">Olvidé mi contraseña</button>' : '') +
      (!updateMode && !codeMode ? '<div class="auth-divider"><span>o conoce la app</span></div><button class="btn quiet" data-a="start-demo">Explorar con datos de ejemplo</button><div class="muted auth-note">La demostración usa datos ficticios y no necesita iniciar sesión.</div>' : '') + '</div>';
  }
  async function submitAuth() {
    if (authMode === 'reset') {
      var resetEmail = (document.getElementById('em') ? document.getElementById('em').value : '').trim();
      if (!resetEmail) { authMsg = { ok: false, text: 'Escribe el correo de tu cuenta.' }; renderAuth(); return; }
      authDraft.email = resetEmail;
      authBusy = true; authMsg = null; renderAuth();
      try {
        check(await sb.auth.resetPasswordForEmail(resetEmail, { redirectTo: location.origin + location.pathname }));
        authBusy = false; authMode = 'resetCode';
        authMsg = { ok: true, text: 'Si el correo corresponde a una cuenta, recibirás un código para recuperar el acceso. Revisa también spam.' };
        renderAuth();
      } catch (e) { authBusy = false; authMsg = { ok: false, text: humanError(e) }; renderAuth(); }
      return;
    }
    if (authMode === 'resetCode') {
      var recoveryEmail = (document.getElementById('em') ? document.getElementById('em').value : authDraft.email).trim();
      var recoveryCode = (document.getElementById('recovery-code') ? document.getElementById('recovery-code').value : '').replace(/\s+/g, '');
      if (!recoveryEmail) { authMsg = { ok: false, text: 'Escribe el correo donde recibiste el código.' }; renderAuth(); return; }
      if (!/^\d{6,8}$/.test(recoveryCode)) { authMsg = { ok: false, text: 'Introduce el código numérico completo que recibiste por correo.' }; renderAuth(); return; }
      authDraft.email = recoveryEmail; authBusy = true; authMsg = null; renderAuth();
      try {
        var verified = check(await sb.auth.verifyOtp({ email: recoveryEmail, token: recoveryCode, type: 'recovery' }));
        user = verified && verified.data && verified.data.user ? verified.data.user : null;
        if (!user) throw new Error('No se pudo verificar el código. Solicita uno nuevo e inténtalo otra vez.');
        authBusy = false; authMode = 'updatePassword';
        authMsg = { ok: true, text: 'Código verificado. Ahora elige tu nueva contraseña.' };
        renderAuth();
      } catch (e) { authBusy = false; authMode = 'resetCode'; authMsg = { ok: false, text: humanError(e) }; renderAuth(); }
      return;
    }
    if (authMode === 'updatePassword') {
      var newPw = document.getElementById('pw').value, newPw2 = document.getElementById('pw2').value;
      if (newPw.length < 8 || newPw !== newPw2) { authMsg = { ok: false, text: newPw.length < 8 ? 'La contraseña debe tener al menos 8 caracteres.' : 'Las contraseñas no coinciden.' }; renderAuth(); return; }
      authBusy = true; authMsg = null; renderAuth();
      try { check(await sb.auth.updateUser({ password: newPw })); authBusy = false; authMsg = null; authMode = 'login'; await startApp(); toast('Contraseña actualizada.'); }
      catch (e) { authBusy = false; authMsg = { ok: false, text: humanError(e) }; authMode = 'updatePassword'; renderAuth(); }
      return;
    }
    var email = document.getElementById('em').value.trim(), pw = document.getElementById('pw').value;
    var signupMode = authMode === 'signup', un = signupMode ? normUser(document.getElementById('un').value) : '', pw2 = signupMode ? document.getElementById('pw2').value : '';
    authDraft.email = email; if (signupMode) authDraft.username = un;
    var bad = null;
    if (!email || !pw) bad = 'Escribe tu correo y tu contraseña.';
    else if (signupMode && !validUser(un)) bad = 'El usuario debe tener de 3 a 20 caracteres: letras sin acento, números, punto o guion bajo.';
    else if (signupMode && pw.length < 8) bad = 'La contraseña debe tener al menos 8 caracteres.';
    else if (signupMode && pw !== pw2) bad = 'Las contraseñas no coinciden.';
    if (bad) { authMsg = { ok: false, text: bad }; renderAuth(); return; }
    authBusy = true; authMsg = null; renderAuth();
    try {
      var r;
      if (authMode === 'signup') {
        r = check(await sb.auth.signUp({ email: email, password: pw, options: { data: { username: un } } }));
        if (!r.data || !r.data.session) {
          authBusy = false; authMode = 'login';
          authMsg = { ok: true, text: 'Cuenta creada. Te enviamos un correo para confirmarla; ábrelo y luego inicia sesión aquí.' };
          renderAuth(); return;
        }
      } else {
        r = check(await sb.auth.signInWithPassword({ email: email, password: pw }));
      }
      user = r.data.user || r.data.session.user;
      authBusy = false; authMsg = null; authDraft = { email: '', username: '' };
      await startApp();
    } catch (e) {
      authBusy = false; authMsg = { ok: false, text: humanError(e) }; renderAuth();
    }
  }

  /* ---------- 11. Hoja para registrar / editar ---------- */
  function catsFor(kind) {
    var counts = {};
    sorted().slice(0, 100).forEach(function (t) { counts[t.categoryId] = (counts[t.categoryId] || 0) + 1; });
    return S.categories.filter(function (c) { return c.kind === kind; })
      .sort(function (a, b) { return (counts[b.id] || 0) - (counts[a.id] || 0) || a.sortOrder - b.sortOrder; });
  }
  function defaultAccount(cur) {
    var last = sorted().filter(function (t) { return t.currency === cur && accById(t.accountId); })[0];
    if (last) return last.accountId;
    var a = S.accounts.filter(function (x) { return x.currency === cur; })[0];
    return a ? a.id : null;
  }
  function openSheet(id) {
    if (offline) { toast('Sin conexión: por ahora solo puedes mirar tus datos.'); return; }
    var t = id ? S.transactions.filter(function (x) { return x.id === id; })[0] : null;
    if (id && !t) return;
    var d = today();
    sheet = t ? {
      id: t.id, type: t.type, currency: t.currency, amountText: minorToText(t.amountMinor), categoryId: t.categoryId, accountId: t.accountId,
      dateMode: t.dateISO === d ? 'today' : t.dateISO === addDays(d, -1) ? 'yesterday' : 'other', customDate: t.dateISO, note: t.note, receiptImage: safeImg(t.receiptImage), errors: {}, confirmDelete: false, saving: false, pay: null, split: t.split ? { people: t.split.map(function (x) { return { name: x.name, share: minorToText(x.shareMinor), settled: !!x.settled }; }) } : null
    } : {
      id: null, type: 'expense', currency: S.displayCurrency, amountText: '', categoryId: (catsFor('expense')[0] || {}).id || null,
      accountId: defaultAccount(S.displayCurrency), dateMode: 'today', customDate: d, note: '', receiptImage: '', errors: {}, confirmDelete: false, saving: false, pay: null, split: null
    };
    renderSheet(!t);
  }
  function chipBtns(list, selId, action) {
    return list.map(function (x) { return '<button class="chip" data-a="' + action + '" data-v="' + esc(x.id) + '" aria-pressed="' + (selId === x.id) + '">' + x.label + '</button>'; }).join('');
  }
  function renderSheet(focusAmount) {
    if (!sheet) { $sheet.innerHTML = ''; return; }
    var s = sheet, e = s.errors, accs = S.accounts.filter(function (a) { return a.currency === s.currency; }), ttl = s.pay ? 'Registrar pago' : s.id ? 'Editar movimiento' : 'Nuevo movimiento';
    $sheet.innerHTML = '<div class="scrim" data-a="close-scrim"><div class="sheet" role="dialog" aria-modal="true" aria-label="' + ttl + '">' +
      '<div class="row"><h2 class="h2">' + ttl + '</h2><button class="back" data-a="close">Cerrar</button></div>' +
      '<div class="seg" role="group" aria-label="Tipo"><button data-a="stype" data-v="expense" aria-pressed="' + (s.type === 'expense') + '">Gasto</button><button data-a="stype" data-v="income" aria-pressed="' + (s.type === 'income') + '">Ingreso</button></div>' +
      (e.rate ? '<div class="banner">' + esc(e.rate) + '</div>' : '') +
      '<div class="seg" role="group" aria-label="Moneda"><button data-a="scur" data-v="VES" aria-pressed="' + (s.currency === 'VES') + '">Bolívares</button><button data-a="scur" data-v="USD" aria-pressed="' + (s.currency === 'USD') + '">Dólares</button></div>' +
      '<div><div class="amount' + (e.amount ? ' bad' : '') + '"><span>' + (s.currency === 'USD' ? '$' : 'Bs') + '</span><input id="amt" data-f="amountText" inputmode="decimal" placeholder="0,00" aria-label="Monto" autocomplete="off" value="' + esc(s.amountText) + '"></div>' +
      (e.amount ? '<div class="err" role="alert">' + esc(e.amount) + '</div>' : '') + '</div>' +
      '<div class="col" style="gap:8px"><div class="label">Categoría</div><div class="chips">' + chipBtns(catsFor(s.type).map(function (c) { return { id: c.id, label: esc(c.icon) + ' ' + esc(c.name) }; }), s.categoryId, 'scat') + '</div>' + (e.category ? '<div class="err">' + esc(e.category) + '</div>' : '') + '</div>' +
      '<div class="col" style="gap:8px"><div class="label">' + (s.type === 'expense' ? 'Pagado desde' : 'Recibido en') + '</div><div class="chips">' + chipBtns(accs.map(function (a) { return { id: a.id, label: esc(a.name) }; }), s.accountId, 'sacc') + '</div>' +
      (accs.length === 0 ? '<div class="muted">No tienes cuentas en esta moneda. Crea una en Más › Cuentas.</div>' : '') + (e.account ? '<div class="err">' + esc(e.account) + '</div>' : '') + '</div>' +
      splitHtml(s) +
      '<div class="col" style="gap:8px"><div class="label">Fecha</div><div class="chips"><button class="chip" data-a="sdate" data-v="today" aria-pressed="' + (s.dateMode === 'today') + '">Hoy</button><button class="chip" data-a="sdate" data-v="yesterday" aria-pressed="' + (s.dateMode === 'yesterday') + '">Ayer</button><button class="chip" data-a="sdate" data-v="other" aria-pressed="' + (s.dateMode === 'other') + '">Otra fecha</button></div>' +
      (s.dateMode === 'other' ? '<div class="field"><input id="cd" data-f="customDate" placeholder="AAAA-MM-DD" aria-label="Fecha en formato año-mes-día" value="' + esc(s.customDate) + '"' + (e.date ? ' aria-invalid="true"' : '') + '></div>' : '') +
      (e.date ? '<div class="err">' + esc(e.date) + '</div>' : '') + '</div>' +
      '<div class="field"><label class="label" for="nt">Nota (opcional)</label><input id="nt" data-f="note" maxlength="120" placeholder="Ej. Almuerzo" autocomplete="off" value="' + esc(s.note) + '"></div>' +
      '<div class="card"><div class="label">Foto del recibo (opcional)</div><label class="btn quiet small" for="receiptfile">' + (s.receiptImage ? 'Cambiar foto' : 'Adjuntar foto') + '</label><input id="receiptfile" class="file" type="file" accept="image/*">' + (s.receiptImage ? '<img class="receipt-preview" alt="Vista previa del recibo" src="' + s.receiptImage + '"><button class="linkbtn" data-a="remove-receipt">Quitar recibo</button>' : '<div class="muted">Se comprime para ocupar menos espacio.</div>') + '</div>' +
      '<button class="btn" data-a="save-tx"' + (s.saving ? ' disabled' : '') + '>' + (s.saving ? 'Guardando…' : s.id ? 'Guardar cambios' : 'Listo') + '</button>' +
      (s.id ? '<button class="btn quiet" data-a="repeat-tx"' + (s.saving ? ' disabled' : '') + '>Repetir como nuevo movimiento</button>' + (s.confirmDelete ? slideHtml('tx', s.id, '') : '<button class="btn danger" data-a="del-tx"' + (s.saving ? ' disabled' : '') + '>Eliminar movimiento</button>') : '') +
      '</div></div>';
    if (focusAmount) { var el = document.getElementById('amt'); if (el) el.focus(); }
  }
  async function saveTx() {
    var s = sheet; if (!s || s.saving) return;
    var err = {}, a = parseAmount(s.amountText), acc = accById(s.accountId);
    var dateISO = s.dateMode === 'today' ? today() : s.dateMode === 'yesterday' ? addDays(today(), -1) : s.customDate.trim();
    var existing = s.id ? S.transactions.filter(function (x) { return x.id === s.id; })[0] : null;
    var rate = existing ? existing.rateE4 : S.rate.rateE4;
    if (a === null) err.amount = 'Escribe un monto válido, por ejemplo 25,50';
    else if (a <= 0) err.amount = 'El monto debe ser mayor que cero';
    else if (a > 1e13) err.amount = 'Ese monto es demasiado grande';
    if (!s.categoryId) err.category = 'Elige una categoría';
    if (!acc) err.account = 'Elige una cuenta'; else if (acc.currency !== s.currency) err.account = 'La cuenta debe estar en la misma moneda del monto';
    if (!validDate(dateISO)) err.date = 'La fecha debe tener el formato AAAA-MM-DD';
    if (!(rate > 0)) err.rate = 'Primero define la tasa del dólar en Más › Tasa del dólar.';
    var splitArr = null;
    if (s.type === 'expense' && s.split) {
      splitArr = []; var sumS = 0;
      for (var i = 0; i < s.split.people.length; i++) {
        var pp = s.split.people[i], nm = String(pp.name || '').trim(), sh = parseAmount(pp.share);
        if (!nm || sh === null || sh <= 0) { err.split = 'Cada persona necesita nombre y una parte mayor que cero.'; break; }
        sumS += sh; splitArr.push({ name: nm.slice(0, 30), shareMinor: sh, settled: !!pp.settled });
      }
      if (!err.split && a !== null && sumS >= a) err.split = 'Las partes de los demás deben sumar menos que el total.';
    }
    if (Object.keys(err).length) { s.errors = err; renderSheet(false); return; }
    var now = new Date().toISOString();
    var tx = { id: existing ? existing.id : uuid(), type: s.type, amountMinor: a, currency: s.currency, rateE4: rate, categoryId: s.categoryId,
      accountId: s.accountId, note: s.note.trim().slice(0, 120), dateISO: dateISO, createdAt: existing ? existing.createdAt : now, updatedAt: now, split: splitArr, receiptImage: safeImg(s.receiptImage) };
    s.saving = true; renderSheet(false);
    var ok = await act(async function () {
      await B.saveTx(tx);
      if (existing) S.transactions = S.transactions.map(function (x) { return x.id === tx.id ? tx : x; }); else S.transactions.push(tx);
      persist();
    });
    if (ok) { if (s.pay) await afterPay(s.pay); else if (!existing) registerUndoTx(tx); sheet = null; renderSheet(); motionRefreshRequested = true; render(); if (!existing && !tx.pay && !s.pay) toastUndo('Movimiento guardado.'); } else if (sheet) { sheet.saving = false; renderSheet(false); }
  }
  async function deleteTx() {
    var s = sheet; if (!s || s.saving) return;
    s.saving = true; renderSheet(false);
    var ok = await act(async function () {
      await B.removeTx(s.id);
      S.transactions = S.transactions.filter(function (x) { return x.id !== s.id; });
      persist();
    });
    if (ok) { sheet = null; renderSheet(); motionRefreshRequested = true; render(); } else if (sheet) { sheet.saving = false; sheet.confirmDelete = false; renderSheet(false); }
  }

  /* ---------- 11b. Cuentas y perfil ---------- */
  async function saveAccountEdit() {
    var e = editAcc; if (!e || e.saving) return;
    var a = accById(e.id), name = e.name.trim();
    if (!a) return;
    if (!name) { e.msg = 'Ponle un nombre a la cuenta'; render(); return; }
    if (S.accounts.some(function (x) { return x.id !== a.id && x.currency === a.currency && x.name.toLowerCase() === name.toLowerCase(); })) { e.msg = 'Ya tienes una cuenta con ese nombre en esa moneda'; render(); return; }
    var fields = { name: name };
    if ((e.logo || '') !== (a.logo || '')) fields.logo = e.logo || null;
    e.saving = true; e.msg = null; render();
    var ok = await act(async function () {
      await B.saveAccount(a.id, fields);
      a.name = name; if ('logo' in fields) a.logo = e.logo || '';
      persist();
    });
    if (ok) { editAcc = null; sub = 'accounts'; toast('Cuenta actualizada'); }
    else if (editAcc) { editAcc.saving = false; }
    render();
  }
  async function doDelete(kind, id) {
    if (kind === 'acc') {
      var a = accById(id); if (!a || (editAcc && editAcc.saving)) return;
      var ok = await act(async function () {
        if (CLOUD) check(await sb.rpc('delete_account', { p_id: id }));
        S.transactions = S.transactions.filter(function (t) { return t.accountId !== id; });
        S.transfers = (S.transfers || []).filter(function (t) { return t.fromAccountId !== id && t.toAccountId !== id; });
        S.accounts = S.accounts.filter(function (x) { return x.id !== id; });
        S.scheduled.forEach(function (x) { if (x.accountId === id) x.accountId = null; }); S.plans.forEach(function (x) { if (x.accountId === id) x.accountId = null; });
        persist();
      });
      arm = null;
      if (ok) { editAcc = null; sub = 'accounts'; toast('Cuenta eliminada'); }
      render(); return;
    }
    if (kind === 'sch' || kind === 'plan' || kind === 'debt' || kind === 'bud') {
      var M = { sch: ['scheduled_payments', 'scheduled'], plan: ['installment_plans', 'plans'], debt: ['debts', 'debts'], bud: ['budgets', 'budgets'] }[kind];
      var ok3 = await act(async function () { await B.delRow(M[0], id); S[M[1]] = S[M[1]].filter(function (x) { return x.id !== id; }); persist(); });
      arm = null; if (ok3) { fd = null; sub = kind === 'bud' ? 'budgets' : 'menu'; toast('Eliminado'); }
      render(); return;
    }
    if (kind === 'cat') {
      var c = catById(id); if (!c) { arm = null; render(); return; }
      var ok2 = await act(async function () { await B.removeCategory(id); S.categories = S.categories.filter(function (x) { return x.id !== id; }); S.budgets = S.budgets.filter(function (b) { return b.categoryId !== id; }); S.scheduled.forEach(function (x) { if (x.categoryId === id) x.categoryId = null; }); S.plans.forEach(function (x) { if (x.categoryId === id) x.categoryId = null; }); persist(); });
      arm = null; if (ok2) toast('Categoría eliminada');
      render(); return;
    }
  }
  async function slideDone(kind, id) {
    if (kind === 'tx') await deleteTx(); else await doDelete(kind, id);
  }
  /* ---------- 11c. Acciones: pagos, cuotas, deudas, presupuestos, división, tasas ---------- */
  function me() { return user ? user.id : null; }
  function schRow(x) { return { id: x.id, user_id: me(), name: x.name, amount_minor: x.amountMinor, currency: x.currency, category_id: x.categoryId || null, account_id: x.accountId || null, frequency: x.frequency, next_due: x.nextDue, anchor_day: x.anchorDay, remind_days: x.remindDays == null ? null : x.remindDays, active: !!x.active, created_at: x.createdAt }; }
  function planRow(p) { return { id: p.id, user_id: me(), name: p.name, total_minor: p.totalMinor, currency: p.currency, installments: p.count, paid_count: p.paidCount, frequency: p.frequency, first_due: p.firstDue, anchor_day: p.anchorDay, category_id: p.categoryId || null, account_id: p.accountId || null, remind_days: p.remindDays == null ? null : p.remindDays, created_at: p.createdAt }; }
  function debtRow(d) { return { id: d.id, user_id: me(), kind: d.kind, person: d.person, note: d.note || '', total_minor: d.totalMinor, paid_minor: d.paidMinor, currency: d.currency, due_date: d.dueDate || null, remind_days: d.remindDays == null ? null : d.remindDays, created_at: d.createdAt }; }
  function budRow(b) { return { id: b.id, user_id: me(), category_id: b.categoryId, limit_minor: b.limitMinor, currency: b.currency, created_at: b.createdAt }; }
  function replaceOrPush(list, x) { var i = list.findIndex(function (y) { return y.id === x.id; }); if (i >= 0) list[i] = x; else list.push(x); }
  function parseRemind(s) { s = String(s == null ? '' : s).trim(); if (s === '') return null; if (!/^\d{1,2}$/.test(s)) return NaN; var n = +s; return n <= 30 ? n : NaN; }
  function byId(list, id) { return list.filter(function (x) { return x.id === id; })[0]; }

  function openForm(t, id) {
    var cur = S.displayCurrency, x;
    if (t === 'sch') {
      x = id ? byId(S.scheduled, id) : null;
      fd = x ? { t: t, id: x.id, name: x.name, amount: minorToText(x.amountMinor), currency: x.currency, categoryId: x.categoryId, accountId: x.accountId, frequency: x.frequency, due: x.nextDue, remind: x.remindDays == null ? '' : String(x.remindDays), active: x.active }
        : { t: t, id: null, name: '', amount: '', currency: cur, categoryId: null, accountId: null, frequency: 'monthly', due: today(), remind: '', active: true };
      tab = 'pay'; sub = 'f-sch';
    } else if (t === 'plan') {
      x = id ? byId(S.plans, id) : null;
      fd = x ? { t: t, id: x.id, name: x.name, total: minorToText(x.totalMinor), currency: x.currency, count: String(x.count), frequency: x.frequency, due: x.firstDue, paid: String(x.paidCount), categoryId: x.categoryId, accountId: x.accountId, remind: x.remindDays == null ? '' : String(x.remindDays) }
        : { t: t, id: null, name: '', total: '', currency: cur, count: '3', frequency: 'biweekly', due: addDays(today(), 14), paid: '0', categoryId: null, accountId: null, remind: '' };
      tab = 'pay'; sub = 'f-plan';
    } else if (t === 'debt') {
      x = id ? byId(S.debts, id) : null;
      fd = x ? { t: t, id: x.id, kind: x.kind, person: x.person, note: x.note || '', total: minorToText(x.totalMinor), currency: x.currency, due: x.dueDate || '', remind: x.remindDays == null ? '' : String(x.remindDays), abono: '', abonoAcc: null }
        : { t: t, id: null, kind: 'owe', person: '', note: '', total: '', currency: cur, due: '', remind: '', abono: '', abonoAcc: null };
      tab = 'pay'; sub = 'f-debt';
    } else if (t === 'bud') {
      x = id ? byId(S.budgets, id) : null;
      fd = x ? { t: t, id: x.id, categoryId: x.categoryId, amount: minorToText(x.limitMinor), currency: x.currency } : { t: t, id: null, categoryId: null, amount: '', currency: cur };
      tab = 'more'; sub = 'f-bud';
    }
    arm = null; msg = null; render(); window.scrollTo(0, 0);
  }
  async function saveForm() {
    var f = fd; if (!f || f.saving) return;
    var now = new Date().toISOString(), rem = parseRemind(f.remind), bad = null;
    var amt = parseAmount(f.t === 'plan' || f.t === 'debt' ? f.total : f.amount);
    var okAmt = amt !== null && amt > 0 && amt <= 1e13;
    var date = f.due || '';
    if (f.t !== 'bud' && !String(f.name == null ? f.person : f.name).trim()) bad = f.t === 'debt' ? 'Escribe la persona o el lugar.' : 'Ponle un nombre.';
    else if (!okAmt) bad = 'Escribe un monto válido, por ejemplo 25,50.';
    else if (rem !== null && isNaN(rem)) bad = 'Los días de aviso deben ser un número del 0 al 30.';
    else if (f.t !== 'debt' && f.t !== 'bud' && !validDate(date)) bad = 'Elige una fecha válida.';
    else if (f.t === 'debt' && date && !validDate(date)) bad = 'La fecha límite no es válida.';
    var obj = null, existing = null;
    if (!bad) {
      var acc = f.accountId ? accById(f.accountId) : null, accId = acc && acc.currency === f.currency ? acc.id : null;
      var catId = f.categoryId && catById(f.categoryId) ? f.categoryId : null;
      if (f.t === 'sch') {
        existing = f.id ? byId(S.scheduled, f.id) : null;
        obj = { id: f.id || uuid(), name: f.name.trim().slice(0, 40), amountMinor: amt, currency: f.currency, categoryId: catId, accountId: accId, frequency: f.frequency, nextDue: date,
          anchorDay: existing && existing.nextDue === date ? existing.anchorDay : +date.slice(8), remindDays: rem, active: f.active !== false, createdAt: existing ? existing.createdAt : now };
      } else if (f.t === 'plan') {
        var n = /^\d{1,2}$/.test(String(f.count).trim()) ? +f.count : 0, pd = /^\d{1,2}$/.test(String(f.paid).trim()) ? +f.paid : -1;
        if (n < 1 || n > 60) bad = 'El número de cuotas debe estar entre 1 y 60.';
        else if (pd < 0 || pd > n) bad = 'Las cuotas ya pagadas deben estar entre 0 y ' + n + '.';
        else {
          existing = f.id ? byId(S.plans, f.id) : null;
          obj = { id: f.id || uuid(), name: f.name.trim().slice(0, 40), totalMinor: amt, currency: f.currency, count: n, paidCount: pd, frequency: f.frequency, firstDue: date,
            anchorDay: existing && existing.firstDue === date ? existing.anchorDay : +date.slice(8), categoryId: catId, accountId: accId, remindDays: rem, createdAt: existing ? existing.createdAt : now };
        }
      } else if (f.t === 'debt') {
        existing = f.id ? byId(S.debts, f.id) : null;
        if (existing && amt < existing.paidMinor) bad = 'El total no puede ser menor a lo ya abonado (' + fmt(existing.paidMinor, f.currency) + ').';
        else obj = { id: f.id || uuid(), kind: f.kind, person: f.person.trim().slice(0, 40), note: (f.note || '').trim().slice(0, 120), totalMinor: amt, paidMinor: existing ? existing.paidMinor : 0,
          currency: f.currency, dueDate: date || null, remindDays: rem, createdAt: existing ? existing.createdAt : now };
      } else if (f.t === 'bud') {
        if (!catId) bad = 'Elige una categoría.';
        else if (S.budgets.some(function (b) { return b.categoryId === catId && b.id !== f.id; })) bad = 'Esa categoría ya tiene presupuesto.';
        else { existing = f.id ? byId(S.budgets, f.id) : null; obj = { id: f.id || uuid(), categoryId: catId, limitMinor: amt, currency: f.currency, createdAt: existing ? existing.createdAt : now }; }
      }
    }
    if (bad) { f.msg = bad; render(); return; }
    var T = { sch: ['scheduled_payments', 'scheduled', schRow], plan: ['installment_plans', 'plans', planRow], debt: ['debts', 'debts', debtRow], bud: ['budgets', 'budgets', budRow] }[f.t];
    f.saving = true; f.msg = null; render();
    var ok = await act(async function () { await B.upsertRow(T[0], T[2](obj)); replaceOrPush(S[T[1]], obj); persist(); });
    if (ok) { fd = null; if (f.t === 'bud') sub = 'budgets'; else { sub = 'menu'; ptab = f.t; } toast('Guardado'); }
    else if (fd) fd.saving = false;
    render(); window.scrollTo(0, 0);
  }
  async function ensureCat(kind, name, icon) {
    var c = S.categories.filter(function (x) { return x.kind === kind && x.name.toLowerCase() === name.toLowerCase(); })[0];
    if (c) return c;
    c = { id: uuid(), name: name, icon: icon, kind: kind, sortOrder: S.categories.filter(function (x) { return x.kind === kind; }).length };
    await B.addCategories([c]); S.categories.push(c); return c;
  }
  async function doAbono() {
    var f = fd, d = f && f.id ? byId(S.debts, f.id) : null; if (!d || f.saving) return;
    var a = parseAmount(f.abono), acc = f.abonoAcc ? accById(f.abonoAcc) : null;
    var bad = a === null || a <= 0 ? 'Escribe un monto válido.' : a > debtLeft(d) ? 'El abono es mayor a lo que falta (' + fmt(debtLeft(d), d.currency) + ').' : acc && !(S.rate.rateE4 > 0) ? 'Primero define la tasa del dólar para anotarlo en una cuenta.' : null;
    if (bad) { f.abMsg = bad; render(); return; }
    f.saving = true; f.abMsg = null; render();
    var ok = await act(async function () {
      var now = new Date().toISOString(), tx = null;
      var nd = Object.assign({}, d, { paidMinor: d.paidMinor + a });
      await B.upsertRow('debts', debtRow(nd));
      if (acc) {
        var owe = d.kind === 'owe', cat = await ensureCat(owe ? 'expense' : 'income', owe ? 'Deudas' : 'Cobros', owe ? '💸' : '🤝');
        tx = { id: uuid(), type: owe ? 'expense' : 'income', amountMinor: a, currency: d.currency, rateE4: S.rate.rateE4, categoryId: cat.id, accountId: acc.id,
          note: (owe ? 'Abono a ' : 'Cobro de ') + d.person, dateISO: today(), createdAt: now, updatedAt: now, split: null };
        await B.saveTx(tx); S.transactions.push(tx);
      }
      d.paidMinor = nd.paidMinor; persist();
    });
    f.saving = false;
    if (ok) { f.abono = ''; f.abonoAcc = null; toast('Abono registrado'); }
    render();
  }
  function openPaySheet(kind, id) {
    if (offline) { toast('Sin conexión: por ahora solo puedes mirar tus datos.'); return; }
    var it = kind === 'sch' ? byId(S.scheduled, id) : byId(S.plans, id); if (!it) return;
    var amt = kind === 'sch' ? it.amountMinor : planAmount(it, it.paidCount);
    var cat = it.categoryId && catById(it.categoryId) ? it.categoryId : (catsFor('expense')[0] || {}).id || null;
    var ac = it.accountId && accById(it.accountId) && accById(it.accountId).currency === it.currency ? it.accountId : defaultAccount(it.currency);
    sheet = { id: null, type: 'expense', currency: it.currency, amountText: minorToText(amt), categoryId: cat, accountId: ac, dateMode: 'today', customDate: today(),
      note: (kind === 'plan' ? it.name + ' · cuota ' + (it.paidCount + 1) + '/' + it.count : it.name).slice(0, 120), errors: {}, confirmDelete: false, saving: false, split: null, pay: { kind: kind, id: id } };
    renderSheet(false);
  }
  /* Después de registrar un pago: pasa al siguiente vencimiento o cuenta la cuota. */
  async function afterPay(pay) {
    try {
      if (pay.kind === 'sch') {
        var x = byId(S.scheduled, pay.id);
        if (x) { var nx = Object.assign({}, x, { nextDue: nextAfter(x.nextDue, x.frequency, x.anchorDay) }); await B.upsertRow('scheduled_payments', schRow(nx)); x.nextDue = nx.nextDue; }
      } else {
        var p = byId(S.plans, pay.id);
        if (p) { var np = Object.assign({}, p, { paidCount: p.paidCount + 1 }); await B.upsertRow('installment_plans', planRow(np)); p.paidCount = np.paidCount; }
      }
      persist();
    } catch (e) { toast('El pago se registró, pero no se pudo actualizar el calendario: ' + humanError(e)); }
  }

  /* Tasas de referencia: euro BCV y dólar paralelo (solo informativas; las cuentas usan el dólar BCV). */
  async function fetchJson(url) {
    var ctrl = new AbortController(), timer = setTimeout(function () { ctrl.abort(); }, 8000);
    try { var r = await fetch(url, { signal: ctrl.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } finally { clearTimeout(timer); }
  }
  async function fetchRefRates() {
    var out = {};
    function pick(arr, src) { var o = (Array.isArray(arr) ? arr : []).filter(function (x) { return x && x.fuente === src; })[0], v = o ? Number(o.promedio) : 0; return v > 0 ? { rateE4: Math.round(v * 10000), updatedAt: typeof o.fechaActualizacion === 'string' ? o.fechaActualizacion : new Date().toISOString() } : null; }
    try { var e = pick(await fetchJson('https://ve.dolarapi.com/v1/euros'), 'oficial'); if (e) out.eur = e; } catch (e1) { /* sigue */ }
    try { var p = pick(await fetchJson('https://ve.dolarapi.com/v1/dolares'), 'paralelo'); if (p) out.par = p; } catch (e2) { /* sigue */ }
    return out;
  }
  async function applyRefs(out) {
    if (!out.eur && !out.par) return false;
    var ref = { eur: out.eur || S.ref.eur, par: out.par || S.ref.par };
    await B.saveRefRates(ref); S.ref = ref; persist(); return true;
  }
  async function autoRefs() {
    if (offline) return;
    try {
      if (localStorage.getItem('cuadre:refcheck') === today()) return;
      var out = await fetchRefRates();
      if (await applyRefs(out)) { localStorage.setItem('cuadre:refcheck', today()); if (!sheet && (tab === 'home' || (tab === 'more' && sub === 'rate'))) render(); }
    } catch (e) { /* en silencio */ }
  }

  async function handleExtra(a, el, id, v) {
    if (a === 'quick-action') {
      closeQuickActions();
      if (v === 'expense') { openSheet(null); return true; }
      if (v === 'income') {
        openSheet(null);
        if (sheet) { sheet.type = 'income'; sheet.categoryId = (catsFor('income')[0] || {}).id || null; sheet.accountId = defaultAccount(sheet.currency); renderSheet(true); }
        return true;
      }
      if (v === 'transfer') { tab = 'more'; sub = 'transfers'; render(); window.scrollTo(0, 0); return true; }
      return true;
    }
    if (a === 'quick-close') { quickActionsOpen = false; render(); return true; }
    if (a === 'refresh-report') { render(); return true; }
    if (a === 'download-backup') { var backup = JSON.stringify(S, function (k, value) { return k === 'profile' ? undefined : value; }, 2); downloadBlob(backup, 'application/json;charset=utf-8', 'Cuadre_copia_' + today() + '.json'); toast('Copia JSON descargada'); return true; }
    if (a === 'confirm-csv-import') { await confirmCsvImport(); return true; }
    if (a === 'toggle-push') { await togglePushSubscription(); return true; }
    if (a === 'assistant-ask') { await askAssistant(); return true; }
    if (a === 'assistant-save') { await saveParsedQuickEntry(assistantDraft || quickParsed, 'assistant'); return true; }
    if (a === 'assistant-cancel') { assistantDraft = null; assistantAnswer = 'Propuesta cancelada; no se guardó ningún movimiento.'; render(); return true; }
    if (a === 'family-create') { await createFamilySpace(); return true; }
    if (a === 'family-join') { await joinFamilySpace(); return true; }
    if (a === 'family-copy-code') { try { await navigator.clipboard.writeText(familyInviteCode); toast('Código copiado'); } catch (e) { toast('No se pudo copiar automáticamente; selecciona el código y cópialo.'); } return true; }
    if (a === 'family-select') { activeFamilyId = v; try { localStorage.setItem('cuadre:family:selected:' + (user ? user.id : 'local'), activeFamilyId); } catch (e) {} render(); return true; }
    if (a === 'family-save-expense') { await saveFamilyExpense(id); return true; }
    if (a === 'family-delete-expense') { await deleteFamilyExpense(id); return true; }
    if (a === 'goal-contribute') { await addGoalContribution(id); return true; }
    if (a === 'export-xlsx') { exportExcel(); return true; }
    if (a === 'export-pdf') { exportPdf(); return true; }
    if (a === 'quick-parse') { quickParsed = parseQuickEntry(document.getElementById('quick-text') ? document.getElementById('quick-text').value : ''); render(); return true; }
    if (a === 'quick-save') { await saveQuickEntry(); return true; }
    if (a === 'save-transfer') { await saveTransferClick(); return true; }
    if (a === 'delete-transfer') {
      var tr = (S.transfers || []).filter(function (x) { return x.id === id; })[0]; if (!tr) return true;
      var tdOk = await act(async function () { await B.removeTransfer(id); S.transfers = S.transfers.filter(function (x) { return x.id !== id; }); persist(); }); if (tdOk) { toast('Transferencia eliminada'); render(); } return true;
    }
    if (a === 'save-goal') { await saveGoalClick(); return true; }
    if (a === 'delete-goal') {
      var tgOk = await act(async function () { await B.removeGoal(id); S.goals = (S.goals || []).filter(function (x) { return x.id !== id; }); persist(); }); if (tgOk) { toast('Meta eliminada'); render(); } return true;
    }
    if (a === 'goal-progress') { await updateGoalProgress(id); return true; }
    if (a === 'save-allocation') { await saveAllocationClick(); return true; }
    if (a === 'ptab') { ptab = v; render(); return true; }
    if (a === 'goto-pay') { tab = 'pay'; sub = 'menu'; arm = null; fd = null; render(); window.scrollTo(0, 0); return true; }
    if (a === 'new-sch') { openForm('sch'); return true; }
    if (a === 'new-plan') { openForm('plan'); return true; }
    if (a === 'new-debt') { openForm('debt'); return true; }
    if (a === 'new-bud') { openForm('bud'); return true; }
    if (a === 'edit-sch') { openForm('sch', id); return true; }
    if (a === 'edit-plan') { openForm('plan', id); return true; }
    if (a === 'edit-debt') { openForm('debt', id); return true; }
    if (a === 'edit-bud') { openForm('bud', id); return true; }
    if (a === 'pay-sch' || a === 'pay-plan') { openPaySheet(a === 'pay-sch' ? 'sch' : 'plan', id); return true; }
    if (a === 'fd-set') {
      var f = el.dataset.f; if (!fd) return true;
      if (f === 'active') fd.active = !fd.active;
      else if ((f === 'categoryId' || f === 'accountId' || f === 'abonoAcc') && fd[f] === v) fd[f] = null;
      else fd[f] = v;
      if (f === 'currency') { ['accountId', 'abonoAcc'].forEach(function (k) { var ac = fd[k] ? accById(fd[k]) : null; if (ac && ac.currency !== v) fd[k] = null; }); }
      render(); return true;
    }
    if (a === 'fd-cancel') { fd = null; arm = null; if (sub === 'f-bud') sub = 'budgets'; else sub = 'menu'; render(); window.scrollTo(0, 0); return true; }
    if (a === 'fd-save') { await saveForm(); return true; }
    if (a === 'abono') { await doAbono(); return true; }
    if (a === 'settle') {
      var t = byId(S.transactions, id), i = +el.dataset.i; if (!t || !t.split || !t.split[i]) return true;
      var t2 = Object.assign({}, t, { split: t.split.map(function (x, j) { return j === i ? Object.assign({}, x, { settled: true }) : x; }), updatedAt: new Date().toISOString() });
      var ok = await act(async function () { await B.saveTx(t2); S.transactions = S.transactions.map(function (x) { return x.id === t2.id ? t2 : x; }); persist(); });
      if (ok) toast('Marcado como cobrado'); render(); return true;
    }
    if (a === 'sp-toggle') {
      if (!sheet) return true;
      if (sheet.split) sheet.split = null; else { sheet.split = { people: [{ name: '', share: '', settled: false }] }; equalSplit(); }
      renderSheet(false); return true;
    }
    if (a === 'sp-add') { if (sheet && sheet.split && sheet.split.people.length < 9) { sheet.split.people.push({ name: '', share: '', settled: false }); equalSplit(); } renderSheet(false); return true; }
    if (a === 'sp-rm') { if (sheet && sheet.split) { sheet.split.people.splice(+id, 1); if (!sheet.split.people.length) sheet.split = null; else equalSplit(); } renderSheet(false); return true; }
    if (a === 'sp-eq') { equalSplit(); renderSheet(false); return true; }
    if (a === 'notify-toggle') {
      if (notifyEnabled()) { try { localStorage.setItem('cuadre:notify', '0'); } catch (e) { /* nada */ } msg = null; render(); return true; }
      try {
        var perm = await Notification.requestPermission();
        if (perm === 'granted') { localStorage.setItem('cuadre:notify', '1'); msg = null; notifyOnOpen(); } else { msg = 'No se activaron: el navegador no dio permiso.'; msgOk = false; }
      } catch (e) { msg = 'Este navegador no permite activar notificaciones.'; msgOk = false; }
      render(); return true;
    }
    if (a === 'save-remind') {
      var n = parseRemind(document.getElementById('rd').value);
      if (n === null || isNaN(n)) { msg = 'Escribe un número del 0 al 30.'; msgOk = false; render(); return true; }
      var ok2 = await act(async function () { await B.saveRemind(n); S.prefs.remindDays = n; persist(); });
      msg = ok2 ? 'Guardado.' : null; msgOk = ok2; render(); return true;
    }
    return false;
  }
  function equalSplit() {
    var s = sheet; if (!s || !s.split) return;
    var total = parseAmount(s.amountText), n = s.split.people.length + 1;
    if (!total) return;
    var each = Math.floor(total / n);
    s.split.people.forEach(function (p) { p.share = minorToText(each); });
  }

  function startProfileDraft() {
    var pf = S.profile || {};
    profDraft = { username: pf.username || '', avatar: pf.avatar || '' };
  }
  async function saveProfileClick() {
    if (busy || !profDraft) return;
    var un = normUser(profDraft.username);
    if (un && !validUser(un)) { msg = 'El usuario debe tener de 3 a 20 caracteres: letras sin acento, números, punto o guion bajo.'; msgOk = false; render(); return; }
    busy = true; msg = null; render();
    var next = { available: true, username: un, avatar: profDraft.avatar || '' };
    var ok = await act(async function () { await B.saveProfile(next); S.profile = next; persist(); });
    busy = false;
    if (ok) { profDraft = { username: un, avatar: next.avatar }; msg = 'Perfil guardado.'; msgOk = true; } else { msg = 'No se pudo guardar el perfil.'; msgOk = false; }
    render();
  }

  /* ---------- 12. Tasa BCV ---------- */
  async function fetchBcv() {
    var ctrl = new AbortController(), timer = setTimeout(function () { ctrl.abort(); }, 8000);
    try {
      var r = await fetch(RATE_URL, { signal: ctrl.signal });
      if (!r.ok) throw new Error('El servicio respondió ' + r.status);
      var j = await r.json(), v = Number(j.promedio);
      if (!isFinite(v) || v <= 0) throw new Error('La respuesta no trae una tasa válida');
      return { rateE4: Math.round(v * 10000), updatedAt: typeof j.fechaActualizacion === 'string' ? j.fechaActualizacion : new Date().toISOString(), source: 'bcv' };
    } finally { clearTimeout(timer); }
  }
  async function applyRate(rate) {
    await B.saveRate(rate);
    S.rate = rate; S.rateHistory = S.rateHistory || [];
    if (!S.rateHistory.some(function (x) { return x.rateE4 === rate.rateE4 && x.recordedAt === rate.updatedAt; })) S.rateHistory.push({ rateE4: rate.rateE4, source: rate.source || 'manual', recordedAt: rate.updatedAt || new Date().toISOString() });
    persist();
  }
  async function fetchRateClick() {
    if (offline) { toast('Sin conexión: por ahora solo puedes mirar tus datos.'); return; }
    busy = true; msg = null; render();
    try {
      await applyRate(await fetchBcv());
    } catch (e) {
      msg = 'No se pudo actualizar (' + (e && e.name === 'AbortError' ? 'tardó demasiado' : 'sin conexión o bloqueado') + '). Puedes escribir la tasa a mano más abajo.';
    }
    try { await applyRefs(await fetchRefRates()); } catch (e2) { /* la referencia es opcional */ }
    busy = false; render();
  }
  function needsAutoRate() {
    var r = S.rate;
    if (!(r.rateE4 > 0) || !r.updatedAt) return true;
    var d = new Date(r.updatedAt);
    return isNaN(d) || iso(d) !== today();
  }
  async function autoRate() {
    if (offline || !needsAutoRate()) return;
    try {
      var rate = await fetchBcv();
      await applyRate(rate);
      if (!sheet && tab === 'home') render();
    } catch (e) { /* en silencio: se queda la última tasa */ }
  }

  /* ---------- 13. Importar / restaurar copias ---------- */
  async function importBackup(text) {
    var d = JSON.parse(text);
    if (!valid(d)) throw new Error('formato');
    if (!CLOUD) { S = norm(d); persist(); return 'Datos restaurados.'; }
    var now = new Date().toISOString(), accMap = {}, catMap = {}, newAcc = [], newCat = [], rows = [], skipped = 0;
    d.accounts.forEach(function (a) {
      var ex = S.accounts.filter(function (x) { return x.name.toLowerCase() === String(a.name).toLowerCase() && x.currency === a.currency; })[0];
      if (ex) { accMap[a.id] = ex; return; }
      var na = { id: uuid(), name: String(a.name).slice(0, 30), currency: a.currency === 'USD' ? 'USD' : 'VES', openingMinor: Number.isSafeInteger(a.openingMinor) ? a.openingMinor : 0, createdAt: now };
      newAcc.push(na); accMap[a.id] = na;
    });
    d.categories.forEach(function (c) {
      var kind = c.kind === 'income' ? 'income' : 'expense';
      var ex = S.categories.filter(function (x) { return x.kind === kind && x.name.toLowerCase() === String(c.name).toLowerCase(); })[0];
      if (ex) { catMap[c.id] = ex; return; }
      var nc = { id: uuid(), name: String(c.name).slice(0, 24), icon: String(c.icon || '🏷️').slice(0, 16), kind: kind, sortOrder: S.categories.filter(function (x) { return x.kind === kind; }).length + newCat.filter(function (x) { return x.kind === kind; }).length };
      newCat.push(nc); catMap[c.id] = nc;
    });
    d.transactions.forEach(function (t) {
      var a = accMap[t.accountId], c = catMap[t.categoryId];
      if (S.transactions.some(function (ex) { return ex.id === t.id; })) { skipped++; return; }
      if (!a || !c || a.currency !== t.currency || !Number.isSafeInteger(t.amountMinor) || t.amountMinor <= 0 || !Number.isSafeInteger(t.rateE4) || t.rateE4 <= 0 || !validDate(t.dateISO)) { skipped++; return; }
      rows.push({ id: uuid(), type: t.type === 'income' ? 'income' : 'expense', amountMinor: t.amountMinor, currency: t.currency, rateE4: t.rateE4, categoryId: c.id, accountId: a.id,
        note: String(t.note || '').slice(0, 120), dateISO: t.dateISO, createdAt: t.createdAt || now, updatedAt: now, split: Array.isArray(t.split) ? t.split : null, receiptImage: safeImg(t.receiptImage) });
    });
    await B.addAccounts(newAcc); await B.addCategories(newCat); await B.addTxs(rows);
    S.accounts = S.accounts.concat(newAcc); S.categories = S.categories.concat(newCat); S.transactions = S.transactions.concat(rows);
    var transfersAdded = [], goalsAdded = [], budgetsAdded = 0, extrasSkipped = 0, goalIdMap = {};
    (d.transfers || []).forEach(function (t) {
      var from = accMap[t.fromAccountId], to = accMap[t.toAccountId];
      if (!from || !to || from.id === to.id) { extrasSkipped++; return; }
      var fa = Number(t.fromAmountMinor), ta = Number(t.toAmountMinor), rr = Number(t.rateE4) || S.rate.rateE4;
      if (!(fa > 0 && ta > 0) || (from.currency === to.currency && fa !== ta) || (from.currency !== to.currency && !(rr > 0))) { extrasSkipped++; return; }
      var nt = { id: uuid(), fromAccountId: from.id, toAccountId: to.id, fromAmountMinor: fa, toAmountMinor: ta, fromCurrency: from.currency, toCurrency: to.currency, rateE4: rr, dateISO: validDate(t.dateISO) ? t.dateISO : today(), note: String(t.note || '').slice(0,120), createdAt: t.createdAt || now };
      transfersAdded.push(nt);
    });
    for (var ti = 0; ti < transfersAdded.length; ti++) await B.saveTransfer(transfersAdded[ti]);
    S.transfers = (S.transfers || []).concat(transfersAdded);
    (d.goals || []).forEach(function (g) {
      var target = Number(g.targetMinor), saved = Number(g.savedMinor || 0);
      if (!String(g.name || '').trim() || !Number.isSafeInteger(target) || target <= 0 || !Number.isSafeInteger(saved) || saved < 0 || saved > target || !['USD','VES'].includes(g.currency)) { extrasSkipped++; return; }
      var ng = { id: uuid(), name: String(g.name).slice(0,60), targetMinor: target, savedMinor: saved, currency: g.currency, dueDate: validDate(g.dueDate) ? g.dueDate : '', note: String(g.note || '').slice(0,120), createdAt: g.createdAt || now };
      goalIdMap[g.id] = ng.id; goalsAdded.push(ng);
    });
    for (var gi = 0; gi < goalsAdded.length; gi++) await B.saveGoal(goalsAdded[gi]);
    S.goals = (S.goals || []).concat(goalsAdded);
    for (var bi = 0; bi < (d.budgets || []).length; bi++) {
      var b = d.budgets[bi], catb = catMap[b.categoryId], limitb = Number(b.limitMinor);
      if (!catb || catb.kind !== 'expense' || !(limitb > 0) || !['USD','VES'].includes(b.currency) || S.budgets.some(function (x) { return x.categoryId === catb.id; })) { extrasSkipped++; continue; }
      var nb = { id: uuid(), categoryId: catb.id, limitMinor: limitb, currency: b.currency, createdAt: now };
      try { await B.upsertRow('budgets', { id: nb.id, user_id: user.id, category_id: nb.categoryId, limit_minor: nb.limitMinor, currency: nb.currency, created_at: nb.createdAt }); S.budgets.push(nb); budgetsAdded++; } catch (e) { extrasSkipped++; }
    }
    // Restore records of goal contributions without incrementing savedMinor a second time.
    var contributionRows = [];
    (d.goalContributions || []).forEach(function (c) { var gid = goalIdMap[c.goalId], goal = goalsAdded.filter(function (g) { return g.id === gid; })[0]; if (!gid || !goal || !(Number(c.amountMinor) > 0) || !validDate(c.dateISO)) return; contributionRows.push({ id: uuid(), goalId: gid, amountMinor: Number(c.amountMinor), currency: goal.currency, dateISO: c.dateISO, note: String(c.note || '').slice(0,120), createdAt: c.createdAt || now }); });
    for (var ci = 0; ci < contributionRows.length; ci++) { try { await B.importGoalContributionRecord(contributionRows[ci]); } catch (e) { extrasSkipped++; continue; } }
    S.goalContributions = (S.goalContributions || []).concat(contributionRows);
    for (var si = 0; si < (d.scheduled || []).length; si++) {
      var sx = d.scheduled[si], sac = accMap[sx.accountId], scat = catMap[sx.categoryId];
      if (!sx.name || !(Number(sx.amountMinor) > 0) || !validDate(sx.nextDue) || !FREQ[sx.frequency] || !['USD','VES'].includes(sx.currency)) { extrasSkipped++; continue; }
      var srow = { id: uuid(), user_id: user.id, name: String(sx.name).slice(0,40), amount_minor: Number(sx.amountMinor), currency: sx.currency, category_id: scat ? scat.id : null, account_id: sac ? sac.id : null, frequency: sx.frequency, next_due: sx.nextDue, anchor_day: Number(sx.anchorDay) || 1, remind_days: Number.isInteger(sx.remindDays) ? sx.remindDays : null, active: sx.active !== false, created_at: sx.createdAt || now };
      try { await B.upsertRow('scheduled_payments', srow); S.scheduled.push({ id: srow.id, name: srow.name, amountMinor: srow.amount_minor, currency: srow.currency, categoryId: srow.category_id, accountId: srow.account_id, frequency: srow.frequency, nextDue: srow.next_due, anchorDay: srow.anchor_day, remindDays: srow.remind_days, active: srow.active, createdAt: srow.created_at }); } catch(e) { extrasSkipped++; }
    }
    for (var pi = 0; pi < (d.plans || []).length; pi++) {
      var px = d.plans[pi], pac = accMap[px.accountId], pcat = catMap[px.categoryId];
      if (!px.name || !(Number(px.totalMinor) > 0) || !validDate(px.firstDue) || !FREQ[px.frequency] || !(Number(px.count) >= 1) || Number(px.count) > 60 || Number(px.paidCount) > Number(px.count) || !['USD','VES'].includes(px.currency)) { extrasSkipped++; continue; }
      var prow = { id: uuid(), user_id: user.id, name: String(px.name).slice(0,40), total_minor: Number(px.totalMinor), currency: px.currency, installments: Number(px.count), paid_count: Number(px.paidCount)||0, frequency: px.frequency, first_due: px.firstDue, anchor_day: Number(px.anchorDay)||1, category_id: pcat ? pcat.id : null, account_id: pac ? pac.id : null, remind_days: Number.isInteger(px.remindDays) ? px.remindDays : null, created_at: px.createdAt || now };
      try { await B.upsertRow('installment_plans', prow); S.plans.push({ id: prow.id, name: prow.name, totalMinor: prow.total_minor, currency: prow.currency, count: prow.installments, paidCount: prow.paid_count, frequency: prow.frequency, firstDue: prow.first_due, anchorDay: prow.anchor_day, categoryId: prow.category_id, accountId: prow.account_id, remindDays: prow.remind_days, createdAt: prow.created_at }); } catch(e) { extrasSkipped++; }
    }
    for (var di = 0; di < (d.debts || []).length; di++) {
      var dx = d.debts[di];
      if (!dx.person || !(Number(dx.totalMinor) > 0) || !['owe','owed'].includes(dx.kind) || Number(dx.paidMinor || 0) > Number(dx.totalMinor) || !['USD','VES'].includes(dx.currency)) { extrasSkipped++; continue; }
      var drow = { id: uuid(), user_id: user.id, kind: dx.kind, person: String(dx.person).slice(0,40), note: String(dx.note||'').slice(0,120), total_minor: Number(dx.totalMinor), paid_minor: Number(dx.paidMinor)||0, currency: dx.currency, due_date: validDate(dx.dueDate) ? dx.dueDate : null, remind_days: Number.isInteger(dx.remindDays) ? dx.remindDays : null, created_at: dx.createdAt || now };
      try { await B.upsertRow('debts', drow); S.debts.push({ id: drow.id, kind: drow.kind, person: drow.person, note: drow.note, totalMinor: drow.total_minor, paidMinor: drow.paid_minor, currency: drow.currency, dueDate: drow.due_date, remindDays: drow.remind_days, createdAt: drow.created_at }); } catch(e) { extrasSkipped++; }
    }
    if (d.allocation) { var av = ['invest','enjoyment','savings','emergency','needs'].map(function (k) { return Number(d.allocation[k]); }); if (av.every(function (n) { return Number.isInteger(n) && n >= 0 && n <= 100; }) && av.reduce(function (n,x) { return n+x; },0) === 100) { try { await B.saveAllocation(d.allocation); S.allocation = d.allocation; } catch(e) {} } }
    if (d.rateHistory && d.rateHistory.length) S.rateHistory = (S.rateHistory || []).concat(d.rateHistory.filter(function (x) { return x.rateE4 > 0; }));
    persist();
    return 'Importado: ' + rows.length + ' movimientos, ' + transfersAdded.length + ' transferencias, ' + goalsAdded.length + ' metas, ' + budgetsAdded + ' presupuestos, ' + newAcc.length + ' cuentas nuevas y ' + newCat.length + ' categorías nuevas' + (skipped || extrasSkipped ? ' (' + (skipped + extrasSkipped) + ' registros omitidos o no importados).' : '.');
  }

  /* ---------- 14. Eventos ---------- */
  document.addEventListener('change', function (ev) {
    var prefInput = ev.target;
    if (prefInput && prefInput.dataset && prefInput.dataset.homePref) { var hk=prefInput.dataset.homePref; if (hk==='compact'||hk==='showTips') { homePrefs[hk]=!!prefInput.checked; saveHomePrefs(); render(); } return; }
    if (!prefInput || !prefInput.dataset || !prefInput.dataset.pref) return;
    var prefName = prefInput.dataset.pref;
    if (['hideBalances','reduceMotion','highContrast'].indexOf(prefName) < 0) return;
    uiPrefs[prefName] = !!prefInput.checked; saveUiPrefs();
    if (S && tab === 'more' && sub === 'theme') render();
  });
  document.addEventListener('input', function (ev) {
    var t = ev.target;
    if (t.dataset && t.dataset.fd && fd) { fd[t.dataset.fd] = t.value; return; }
    if (t.dataset && t.dataset.sp && sheet && sheet.split) { var q2 = t.dataset.sp.split(':'); sheet.split.people[+q2[0]][q2[1]] = t.value; return; }
    if (t.id === 'q') { query = t.value; var l = document.getElementById('list'); if (l) l.innerHTML = movesList(); return; }
    if (t.id === 'universal-q') { universalQuery = t.value; var pos=t.selectionStart; render(); var uq=document.getElementById('universal-q'); if(uq){uq.focus();try{uq.setSelectionRange(pos,pos);}catch(e){}} return; }
    if (t.id === 'calendar-month') { calendarMonth = /^\d{4}-\d{2}$/.test(t.value) ? t.value : today().slice(0,7); render(); return; }
    if (t.id === 'en' && editAcc) { editAcc.name = t.value; return; }
    if (t.id === 'pu' && profDraft) { profDraft.username = t.value; return; }
    if (t.id === 'assistant-query') { assistantQuestion = t.value; return; }
    if (t.id === 'rs') { restoreDraftText = t.value; return; }
    if (sheet && t.dataset && t.dataset.f) sheet[t.dataset.f] = t.value;
  });
  document.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (ev.target.id === 'authform') submitAuth();
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && quickActionsOpen) closeQuickActions();
    if (ev.key === 'Enter' && ev.target && ev.target.id === 'quick-text' && !ev.isComposing) { ev.preventDefault(); var qp = document.querySelector('[data-a="quick-parse"]'); if (qp) qp.click(); }
    var tag = ev.target && ev.target.tagName ? ev.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (ev.target && ev.target.isContentEditable)) return;
    if (ev.key === '/' && tab === 'moves') { ev.preventDefault(); var searchBox = document.getElementById('q'); if (searchBox) searchBox.focus(); }
    if (ev.key === '?') { ev.preventDefault(); tab = 'more'; sub = 'help'; render(); window.scrollTo(0, 0); }
  });
  document.addEventListener('click', async function (ev) {
    var el = ev.target.closest('[data-a]');
    if (!el) {
      if (quickActionsOpen && !ev.target.closest('#quick-actions, .nav .plus')) closeQuickActions();
      return;
    }
    var a = el.dataset.a, v = el.dataset.v, id = el.dataset.id;
    if (quickActionsOpen && a !== 'new' && a !== 'quick-action' && a !== 'quick-close') closeQuickActions();
    try {
      if (await handleExtra(a, el, id, v)) return;
      if (a === 'close-scrim') { if (ev.target === el) { sheet = null; renderSheet(); } return; }
      if (a === 'close') { sheet = null; renderSheet(); return; }
      if (a === 'auth-switch') { authMode = (authMode === 'signup' || authMode === 'reset' || authMode === 'resetCode') ? 'login' : 'signup'; authMsg = null; renderAuth(); return; }
      if (a === 'forgot-password') { authMode = 'reset'; authMsg = null; renderAuth(); return; }
      if (a === 'change-recovery-email') { authMode = 'reset'; authMsg = null; renderAuth(); return; }
      if (a === 'resend-recovery-code') {
        if (!authDraft.email) { authMode = 'reset'; authMsg = { ok: false, text: 'Escribe tu correo para solicitar un código.' }; renderAuth(); return; }
        authBusy = true; authMsg = null; renderAuth();
        try { check(await sb.auth.resetPasswordForEmail(authDraft.email, { redirectTo: location.origin + location.pathname })); authBusy = false; authMode = 'resetCode'; authMsg = { ok: true, text: 'Si el correo corresponde a una cuenta, te enviaremos otro código. Si acabas de solicitar uno, espera un minuto antes de volver a intentarlo.' }; renderAuth(); }
        catch (e) { authBusy = false; authMode = 'resetCode'; authMsg = { ok: false, text: humanError(e) }; renderAuth(); }
        return;
      }
      if (a === 'start-demo') { startDemoMode(); return; }
      if (a === 'exit-demo') { await exitDemoMode(); return; }
      if (a === 'onboard-next') { if (onboardingState) { onboardingState.step = Math.min(3, onboardingState.step + 1); renderOnboardingOverlay(); } return; }
      if (a === 'onboard-skip' || a === 'onboard-finish') { finishOnboarding(false); return; }
      if (a === 'onboard-first-move') { finishOnboarding(true); return; }
      if (a === 'onboard-currency') { if (onboardingState) { onboardingState.currency = v === 'USD' ? 'USD' : 'VES'; renderOnboardingOverlay(); } return; }
      if (a === 'onboard-focus') { if (onboardingState) { onboardingState.focus = ['control','saving','bills'].indexOf(v) >= 0 ? v : 'control'; renderOnboardingOverlay(); } return; }
      if (a === 'dismiss-tip') { try { localStorage.setItem('cuadre:tip:transferencias:v1', '1'); } catch (e) {} render(); return; }
      if (a === 'toggle-available-help') { showAvailableExplanation = !showAvailableExplanation; render(); return; }
      if (a === 'toggle-pref') { var pk = el.dataset.pref, inputPref = el.matches && el.matches('input') ? el : el.querySelector && el.querySelector('input[data-pref]'); if (['hideBalances','reduceMotion','highContrast'].indexOf(pk) >= 0) { uiPrefs[pk] = inputPref ? !!inputPref.checked : !uiPrefs[pk]; saveUiPrefs(); render(); } return; }
      if (a === 'pref-font') { uiPrefs.fontSize = ['small','normal','large'].indexOf(v) >= 0 ? v : 'normal'; saveUiPrefs(); render(); return; }
      if (a === 'reset-onboarding' || a === 'start-onboarding-again') { try { localStorage.removeItem(onboardingDoneKey()); } catch (e) {} onboardingState = { step: 0, currency: S.displayCurrency || 'VES', focus: 'control' }; renderOnboardingOverlay(); return; }
      if (a === 'undo-tx') { await undoLastCreatedTx(); return; }
      if (a === 'favorite-tx') { var fi=favoriteIds.indexOf(id); if(fi>=0) favoriteIds.splice(fi,1); else favoriteIds.unshift(id); favoriteIds=favoriteIds.slice(0,100); saveFavorites(); render(); toast(fi>=0?'Quitado de favoritos':'Guardado en favoritos'); return; }
      if (a === 'remove-receipt') { if (sheet) { sheet.receiptImage = ''; renderSheet(false); } return; }
      if (a === 'repeat-tx') { if (sheet) { var oldSheet = sheet; sheet = Object.assign({}, oldSheet, { id: null, dateMode: 'today', customDate: today(), receiptImage: '', errors: {}, confirmDelete: false, saving: false, pay: null }); renderSheet(false); toast('Movimiento listo para repetir. Revisa el monto y guárdalo.'); } return; }
      if (a === 'tab') { quickActionsOpen = false; arm = null; fd = null; tab = v; sub = 'menu'; msg = null; topMsg = null; render(); window.scrollTo(0, 0); return; }
      if (a === 'goto-profile') { tab = 'more'; sub = 'profile'; msg = null; startProfileDraft(); render(); window.scrollTo(0, 0); return; }
      if (a === 'goto-rate') { tab = 'more'; sub = 'rate'; msg = null; render(); window.scrollTo(0, 0); return; }
      if (a === 'sub') { arm = null; sub = v; msg = null; topMsg = null; rateErr = null; if (v === 'profile') startProfileDraft(); render(); window.scrollTo(0, 0); return; }
      if (a === 'search-account') { tab='more'; sub='accounts'; render(); return; }
      if (a === 'search-category') { tab='more'; sub='cats'; render(); return; }
      if (a === 'search-goal') { tab='more'; sub='goals'; render(); return; }
      if (a === 'search-pay') { tab='pay'; ptab='sch'; sub='menu'; render(); return; }
      if (a === 'search-debt') { tab='pay'; ptab='debt'; sub='menu'; render(); return; }
      if (a === 'home-prefs-reset') { homePrefs={compact:false,showTips:true}; saveHomePrefs(); render(); return; }
      if (a === 'theme') { setTheme(v); render(); return; }
      if (a === 'edit-acc') { arm = null; var ea0 = accById(id); if (!ea0) return; editAcc = { id: id, name: ea0.name, logo: ea0.logo || '', msg: null, saving: false }; sub = 'acc-edit'; render(); window.scrollTo(0, 0); return; }
      if (a === 'rm-logo') { editAcc.logo = ''; render(); return; }
      if (a === 'save-acc') { await saveAccountEdit(); return; }
      if (a === 'rm-avatar') { profDraft.avatar = ''; render(); return; }
      if (a === 'save-profile') { await saveProfileClick(); return; }
      if (a === 'disp') { S.displayCurrency = v; persist(); render(); return; }
      if (a === 'filter') { filter = v; render(); return; }
      if (a === 'new') { quickActionsOpen = !quickActionsOpen; render(); return; }
      if (a === 'edit') { openSheet(id); return; }
      if (a === 'retry') { await startApp(); return; }
      if (a === 'logout') {
        try { await sb.auth.signOut({ scope: 'local' }); } catch (e) { /* si falla, igual se limpia abajo */ }
        user = null; S = null; tab = 'home'; sub = 'menu'; authMode = 'login'; authMsg = null; renderAuth(); return;
      }
      if (a === 'stype') { sheet.type = v; if (v !== 'expense') sheet.split = null; sheet.categoryId = (catsFor(v)[0] || {}).id || null; renderSheet(false); return; }
      if (a === 'scur') { sheet.currency = v; sheet.accountId = defaultAccount(v); renderSheet(false); return; }
      if (a === 'scat') { sheet.categoryId = v; renderSheet(false); return; }
      if (a === 'sacc') { sheet.accountId = v; renderSheet(false); return; }
      if (a === 'sdate') { sheet.dateMode = v; renderSheet(false); return; }
      if (a === 'save-tx') { await saveTx(); return; }
      if (a === 'del-tx') { if (sheet && !sheet.saving) { sheet.confirmDelete = true; renderSheet(false); showSlide(); } return; }
      if (a === 'acur') { newAccCur = v; render(); return; }
      if (a === 'ckind') { newCatKind = v; render(); return; }
      if (a === 'add-account') {
        var name = document.getElementById('an').value.trim(), op = document.getElementById('ao').value.trim();
        var o = op === '' ? 0 : parseAmount(op);
        if (!name) msg = 'Ponle un nombre a la cuenta';
        else if (S.accounts.some(function (x) { return x.name.toLowerCase() === name.toLowerCase() && x.currency === newAccCur; })) msg = 'Ya tienes una cuenta con ese nombre en esa moneda';
        else if (o === null) msg = 'Escribe un monto válido, por ejemplo 100,50';
        else {
          var acc = { id: uuid(), name: name, currency: newAccCur, openingMinor: o, createdAt: new Date().toISOString() };
          msg = null;
          await act(async function () { await B.addAccounts([acc]); S.accounts.push(acc); persist(); });
        }
        render(); return;
      }
      if (a === 'add-cat') {
        var cn = document.getElementById('cn').value.trim(), ic = document.getElementById('ci').value.trim() || '🏷️';
        if (!cn) msg = 'Ponle un nombre a la categoría';
        else if (S.categories.some(function (c) { return c.kind === newCatKind && c.name.toLowerCase() === cn.toLowerCase(); })) msg = 'Ya existe una categoría con ese nombre';
        else {
          var cat = { id: uuid(), name: cn, icon: ic, kind: newCatKind, sortOrder: S.categories.filter(function (c) { return c.kind === newCatKind; }).length };
          msg = null;
          await act(async function () { await B.addCategories([cat]); S.categories.push(cat); persist(); });
        }
        render(); return;
      }
      if (a === 'ask-del') {
        topMsg = null;
        if (v === undefined && el.dataset.k === 'cat') {
          var c = catById(id);
          if (S.transactions.some(function (t) { return t.categoryId === id; })) topMsg = 'No se puede eliminar "' + c.name + '": tiene movimientos. Elimínalos o cámbiales la categoría primero.';
          else if (S.categories.filter(function (x) { return x.kind === c.kind; }).length <= 1) topMsg = 'Debe quedar al menos una categoría de este tipo.';
          else arm = { kind: 'cat', id: id };
          render(); if (topMsg) window.scrollTo(0, 0); else showSlide(); return;
        }
        arm = { kind: el.dataset.k, id: id }; render(); showSlide(); return;
      }
      if (a === 'cancel-del') { arm = null; if (sheet) { sheet.confirmDelete = false; renderSheet(false); } render(); return; }
      if (a === 'fetch-rate') { await fetchRateClick(); return; }
      if (a === 'save-rate') {
        var r = parseRate(document.getElementById('rm').value);
        if (r === null || r <= 0) rateErr = 'Escribe una tasa válida, por ejemplo 873,87';
        else {
          rateErr = null; msg = null;
          await act(async function () { await applyRate({ rateE4: r, updatedAt: new Date().toISOString(), source: 'manual' }); });
        }
        render(); return;
      }
      if (a === 'copy-backup') {
        var box = document.getElementById('bk'), ok2 = false;
        box.focus(); box.select();
        try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(box.value); ok2 = true; } } catch (e) { ok2 = false; }
        msg = ok2 ? 'Copiado. Pégalo en un lugar seguro.' : 'No se pudo copiar solo: el texto quedó seleccionado, cópialo manualmente.'; msgOk = ok2;
        render(); return;
      }
      if (a === 'restore') {
        var text = document.getElementById('rs') ? document.getElementById('rs').value : restoreDraftText;
        busy = true; render();
        try {
          if (offline) throw new Error('Sin conexión');
          msg = await importBackup(text); msgOk = true; restoreDraftText = ''; 
        } catch (e) {
          msg = (e && e.message === 'formato') || e instanceof SyntaxError ? 'Ese texto no es una copia válida de Cuadre.' : humanError(e); msgOk = false;
        }
        busy = false; render(); return;
      }
    } catch (e) { toast(humanError(e)); }
  });
  document.addEventListener('change', async function (ev) {
    var t = ev.target, f = t && t.files && t.files[0];
    if (!f) return;
    try {
      if (t.id === 'backupfile') {
        var backupText = await f.text(); restoreDraftText = backupText;
        msg = 'Archivo cargado. Comprueba que sea una copia de Cuadre y pulsa Restaurar / importar JSON.'; msgOk = true; render();
      } else if (t.id === 'csvfile') {
        var csvText = await f.text(); csvImportDraft = parseCsvImport(csvText); msg = null; render();
        if (!csvImportDraft.rows.length) toast('No se detectaron filas válidas; revisa el formato y la tasa.');
      } else if (t.id === 'logofile' && editAcc) {
        editAcc.logo = safeImg(await imageToDataUrl(f, 96, 'image/png')); editAcc.msg = editAcc.logo ? null : 'No se pudo usar esa imagen.';
        if (editAcc.logo.length > 60000) { editAcc.logo = ''; editAcc.msg = 'Esa imagen es demasiado pesada. Prueba con una más simple.'; }
        render();
      } else if (t.id === 'avfile' && profDraft) {
        profDraft.avatar = safeImg(await imageToDataUrl(f, 256, 'image/jpeg', 0.85)); msg = profDraft.avatar ? null : 'No se pudo usar esa imagen.'; msgOk = false;
        render();
      } else if (t.id === 'receiptfile' && sheet) {
        var receipt = safeImg(await imageBoundedDataUrl(f, 1000, 'image/jpeg', 0.62));
        if (!receipt || receipt.length > 240000) throw new Error('receipt-size');
        sheet.receiptImage = receipt; renderSheet(false);
      }
    } catch (e) {
      if (t.id === 'logofile' && editAcc) editAcc.msg = 'No se pudo leer esa imagen. Prueba con otra (JPG o PNG).';
      else if (t.id === 'receiptfile' && sheet) { toast((e && e.message) === 'receipt-size' ? 'El recibo es demasiado pesado. Prueba una foto más pequeña.' : 'No se pudo leer el recibo. Prueba con otra imagen.'); renderSheet(false); }
      else { msg = 'No se pudo leer esa imagen. Prueba con otra (JPG o PNG).'; msgOk = false; }
      render();
    }
  });
  /* Deslizar para confirmar */
  var drag = null;
  document.addEventListener('pointerdown', function (ev) {
    var th = ev.target.closest && ev.target.closest('.slide-thumb'); if (!th) return;
    var tr = th.parentNode;
    drag = { th: th, tr: tr, fill: tr.querySelector('.slide-fill'), x0: ev.clientX, max: Math.max(1, tr.clientWidth - th.offsetWidth - 8), id: ev.pointerId, dx: 0 };
    try { th.setPointerCapture(ev.pointerId); } catch (e) { /* sigue igual */ }
    th.style.transition = 'none'; ev.preventDefault();
  });
  document.addEventListener('pointermove', function (ev) {
    if (!drag || ev.pointerId !== drag.id) return;
    drag.dx = Math.min(drag.max, Math.max(0, ev.clientX - drag.x0));
    drag.th.style.transform = 'translateX(' + drag.dx + 'px)';
    drag.fill.style.width = (drag.dx + drag.th.offsetWidth + 8) + 'px';
  });
  function endDrag(ev) {
    if (!drag || ev.pointerId !== drag.id) return;
    var d = drag; drag = null;
    if (ev.type === 'pointerup' && d.dx >= d.max * 0.9) {
      d.th.style.transform = 'translateX(' + d.max + 'px)'; d.fill.style.width = '100%';
      slideDone(d.tr.dataset.kind, d.tr.dataset.id);
    } else {
      d.th.style.transition = 'transform .2s ease'; d.th.style.transform = 'translateX(0)'; d.fill.style.width = '0';
    }
  }
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);
  document.addEventListener('keydown', function (ev) {
    var th = ev.target.closest && ev.target.closest('.slide-thumb');
    if (th && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); slideDone(th.parentNode.dataset.kind, th.parentNode.dataset.id); }
  });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && sheet) { sheet = null; renderSheet(); } });

  /* ---------- 15. Arranque ---------- */
  function renderFatal(text, canRetry) {
    $navwrap.hidden = true;
    $app.innerHTML = '<div class="auth"><div class="brand">Cuadre</div><div class="banner bad" role="alert">' + esc(text) + '</div>' +
      (canRetry ? '<button class="btn" data-a="retry">Reintentar</button>' : '') +
      '<button class="btn quiet" data-a="start-demo">Explorar con datos de ejemplo</button><div class="muted auth-note">La demostración funciona sin iniciar sesión y no modifica tus datos reales.</div>' +
      (CLOUD && sb ? '<button class="btn quiet" data-a="logout">Cerrar sesión</button>' : '') + '</div>';
  }
  async function startApp() {
    if (!CLOUD) {
      S = localLoad(); offline = false;
      render(); autoRate(); autoRefs(); notifyOnOpen(); return;
    }
    $navwrap.hidden = true;
    $app.innerHTML = '<div class="auth"><div class="brand">Cuadre</div><div class="muted">Cargando tus datos…</div></div>';
    try {
      S = await cloudLoad(); offline = false; persist();
    } catch (e) {
      var cached = cacheLoad();
      if (cached) { S = cached; offline = true; }
      else { S = null; renderFatal('No se pudieron cargar tus datos. ' + loadError(e), true); return; }
    }
    render(); autoRate(); autoRefs(); notifyOnOpen();
  }
  async function boot() {
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('service-worker.js').catch(function () { /* la app funciona igual */ });
    }
    if (!CLOUD) { await startApp(); return; }
    if (!window.supabase) { renderFatal('No se pudo cargar Supabase. Revisa tu conexión a internet.', true); return; }
    sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
    var session = null;
    var recoveryLink = /type=recovery/i.test(String(location.hash || '') + '&' + String(location.search || ''));
    try { session = check(await sb.auth.getSession()).data.session; } catch (e) { session = null; }
    sb.auth.onAuthStateChange(function (event, sessionInfo) {
      if (event === 'PASSWORD_RECOVERY') { user = sessionInfo && sessionInfo.user ? sessionInfo.user : null; authMode = 'updatePassword'; authMsg = null; renderAuth(); return; }
      if (event === 'SIGNED_OUT' && user) { user = null; S = null; authMode = 'login'; renderAuth(); }
    });
    if (session) { user = session.user; if (recoveryLink) { authMode = 'updatePassword'; authMsg = null; renderAuth(); } else await startApp(); } else renderAuth();
  }
  // Se expone solo lo necesario para las pruebas automáticas.
  applyUiPrefs();
  window.__cuadre = { parseAmount: parseAmount, parseRate: parseRate, fmt: fmt, fmtRate: fmtRate, convert: convert, makeDemoData: makeDemoData };
  boot();
})();
