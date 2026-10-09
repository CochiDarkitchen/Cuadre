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
    SUPABASE_URL: 'https:qfkmtxekvywlcgfimwsg',        // Ejemplo: ''
    SUPABASE_ANON_KEY: 'sb_publishable_JXA4mOZJH3eRJeKd8s6YZw_Y4shklIr'    // Ejemplo: 'eyJhbGciOi...'
  };

  // Limpia lo pegado: agrega https:// si falta y quita barras o rutas de más (/rest/v1).
  (function () {
    var u = String(CONFIG.SUPABASE_URL || '').trim();
    if (u) { if (!/^https?:\/\//i.test(u)) u = 'https://' + u; u = u.replace(/\/+$/, '').replace(/\/(rest|auth)\/v1.*$/i, ''); }
    CONFIG.SUPABASE_URL = u; CONFIG.SUPABASE_ANON_KEY = String(CONFIG.SUPABASE_ANON_KEY || '').trim();
  })();
  var CLOUD = !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
  var LOCAL_KEY = 'cuadre:web:v1';
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
  function setTheme(t) { try { if (t === 'system') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, t); } catch (e) { /* se aplica igual */ } applyTheme(t); }
  applyTheme(readTheme());

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
      categories: cats, transactions: [],
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
  function cacheKey() { return 'cuadre:cloud:cache:v1:' + (user ? user.id : 'x'); }
  function persist() {
    try {
      if (CLOUD) {
        localStorage.setItem(cacheKey(), JSON.stringify(S));
        localStorage.setItem(DISPLAY_KEY, S.displayCurrency);
      } else {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(S));
      }
      saveFailed = false;
    } catch (e) { saveFailed = true; }
  }
  function localLoad() {
    var raw = null;
    try {
      raw = localStorage.getItem(LOCAL_KEY);
      if (raw === null) return initialData();
      var d = JSON.parse(raw);
      if (valid(d)) return norm(d);
      throw new Error('formato');
    } catch (e) {
      try { if (raw !== null) localStorage.setItem(LOCAL_KEY + ':dañado', raw); } catch (e2) { /* nada */ }
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
    return {
      version: 1,
      profile: profile, scheduled: ex.scheduled, plans: ex.plans, debts: ex.debts, budgets: ex.budgets, extrasMissing: ex.missing,
      prefs: { remindDays: Number.isInteger(s.remind_days) ? s.remind_days : 3 },
      ref: { eur: Number(s.eur_rate_e4) > 0 ? { rateE4: Number(s.eur_rate_e4), updatedAt: s.eur_updated_at || null } : null, par: Number(s.par_rate_e4) > 0 ? { rateE4: Number(s.par_rate_e4), updatedAt: s.par_updated_at || null } : null },
      accounts: res[0].map(function (a) { return { id: a.id, name: a.name, currency: a.currency, openingMinor: Number(a.opening_minor), createdAt: a.created_at, logo: safeImg(a.logo) }; }),
      categories: res[1].map(function (c) { return { id: c.id, name: c.name, icon: c.icon, kind: c.kind, sortOrder: c.sort_order }; }),
      transactions: res[2].map(function (t) {
        return { id: t.id, type: t.type, amountMinor: Number(t.amount_minor), currency: t.currency, rateE4: Number(t.rate_e4),
          categoryId: t.category_id, accountId: t.account_id, note: t.note || '', dateISO: t.date, createdAt: t.created_at, updatedAt: t.updated_at, split: Array.isArray(t.split) ? t.split : null };
      }),
      rate: { rateE4: Number(s.rate_e4 || 0), updatedAt: s.rate_updated_at || null, source: s.rate_source || 'none' },
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
      category_id: t.categoryId, account_id: t.accountId, note: t.note, date: t.dateISO, created_at: t.createdAt, updated_at: t.updatedAt };
  }
  function accRow(a) {
    var r = { id: a.id, user_id: user.id, name: a.name, currency: a.currency, opening_minor: a.openingMinor, created_at: a.createdAt };
    if (a.logo) r.logo = a.logo;
    return r;
  }
  function catRow(c) { return { id: c.id, user_id: user.id, name: c.name, icon: c.icon, kind: c.kind, sort_order: c.sortOrder }; }

  /* Operaciones de escritura. En modo local no hacen nada (se guarda con persist()). */
  var B = {
    saveTx: async function (t) { if (CLOUD) check(await sb.from('transactions').upsert(txRow(t))); },
    removeTx: async function (id) { if (CLOUD) check(await sb.from('transactions').delete().eq('id', id)); },
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
  var busy = false, msgOk = false, newAccCur = 'VES', newCatKind = 'expense', authMode = 'login', authMsg = null, authBusy = false;
  var arm = null, editAcc = null, profDraft = null, authDraft = { email: '', username: '' };
  var $app = document.getElementById('app'), $nav = document.getElementById('nav'), $navwrap = document.getElementById('navwrap'), $sheet = document.getElementById('sheet');

  function rateChip() {
    var r = S.rate.rateE4;
    return '<button class="chip-rate" data-a="goto-rate" aria-label="Ver tasa del dólar">' + (r > 0 ? '$ 1 = Bs ' + fmtRate(r) : 'Define la tasa') + '</button>';
  }
  function txRow2(t) {
    var c = catById(t.categoryId), a = accById(t.accountId), other = t.currency === 'USD' ? 'VES' : 'USD', pos = t.type === 'income';
    var title = t.note || (c ? c.name : 'Sin categoría');
    var sub2 = t.note ? (c ? c.name : 'Sin categoría') : (a ? a.name : 'Sin cuenta');
    return '<button class="tx" data-a="edit" data-id="' + esc(t.id) + '">' +
      '<span class="ico" aria-hidden="true">' + (c ? esc(c.icon) : '❔') + '</span>' +
      '<span class="mid"><b>' + esc(title) + '</b><span>' + esc(sub2) + ' · ' + shortDate(t.dateISO) + (t.split ? ' · 👥' : '') + '</span></span>' +
      '<span class="amt"><b class="' + (pos ? 'pos' : '') + '">' + (pos ? '+' : '-') + fmt(t.amountMinor, t.currency) + '</b>' +
      '<span>≈ ' + fmt(convert(t.amountMinor, t.currency, other, t.rateE4), other) + '</span></span></button>';
  }
  function banners() {
    var h = '';
    if (offline) h += '<div class="banner">Sin conexión: ves tus últimos datos guardados y no puedes hacer cambios.<button class="retry" data-a="retry">Reintentar</button></div>';
    if (saveFailed) h += '<div class="banner bad">No se pudo guardar una copia en este dispositivo. Revisa que el navegador permita guardar datos.</div>';
    return h;
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
      (CLOUD && user ? '<button class="avbtn" data-a="goto-profile" aria-label="Mi perfil">' + pic(S.profile && S.profile.avatar, (S.profile && S.profile.username) || user.email, 'sm') + '</button>' : '') + '</div></div>' + banners();
    if (rate <= 0) h += '<div class="banner">Aún no hay tasa del dólar. Toca el botón de arriba para definirla.</div>';
    var urg = urgent(), firm = urg.filter(function (i) { return i.level === 'late' || i.level === 'today'; });
    if (firm.length) h += '<button class="banner bad firm" data-a="goto-pay">⚠️ ' + (firm.length === 1 ? 'Atención: ' : 'Atención, ' + firm.length + ' pagos: ') + firm.slice(0, 2).map(function (i) { return esc(i.title) + (i.level === 'late' ? ' (vencido)' : ' (vence hoy)'); }).join(' · ') + (firm.length > 2 ? ' y más' : '') + '</button>';
    h += '<div class="seg" role="group" aria-label="Moneda a mostrar"><button data-a="disp" data-v="VES" aria-pressed="' + (disp === 'VES') + '">Bs</button><button data-a="disp" data-v="USD" aria-pressed="' + (disp === 'USD') + '">$</button></div>';
    h += '<div class="card"><div class="label">Disponible</div><div class="hero">' + fmt(total, disp) + '</div>' +
      (rate > 0 ? '<div class="muted">≈ ' + fmt(convert(total, disp, other, rate), other) + '</div>' : '') + '</div>';
    h += '<div class="card"><div class="label">' + monthLabel(month) + '</div><div class="row"><div class="col"><span class="muted">Ingresos</span><span class="num pos">' + fmt(sum.inc, disp) +
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
    var c = catById(b.categoryId), spent = budgetSpent(b), pct = Math.min(100, Math.round(spent / b.limitMinor * 100)), raw = spent / b.limitMinor;
    var cls = raw >= 1 ? 'over' : raw >= 0.8 ? 'warnb' : '';
    return '<button class="card cardbtn" data-a="edit-bud" data-id="' + esc(b.id) + '"><div class="row"><span>' + (c ? esc(c.icon) + ' ' + esc(c.name) : 'Categoría') + '</span><span class="num">' + fmt(spent, b.currency) + ' / ' + fmt(b.limitMinor, b.currency) + '</span></div>' +
      '<div class="bar ' + cls + '"><i style="width:' + Math.max(raw > 0 ? 3 : 0, pct) + '%"></i></div><div class="muted">' +
      (raw >= 1 ? 'Te pasaste por ' + fmt(spent - b.limitMinor, b.currency) : 'Te quedan ' + fmt(b.limitMinor - spent, b.currency)) + '</div></button>';
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
      '<div class="muted">Importante: por ahora los avisos salen cuando abres la app. Para que lleguen con la app cerrada hace falta un servidor de notificaciones, que todavía no está incluido. Dentro de la app, lo que vence siempre aparece en Inicio y en Pagos.</div></div>';
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
  function viewMore() {
    if (sub === 'menu') {
      var r = S.rate.rateE4;
      var items = [
        ['accounts', '🏦', 'Cuentas', S.accounts.length + ' cuentas'],
        ['cats', '🏷️', 'Categorías', S.categories.length + ' categorías'],
        ['budgets', '🎯', 'Presupuestos', S.budgets.length ? S.budgets.length + (S.budgets.length === 1 ? ' activo' : ' activos') : 'Pon límites por categoría'],
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
      return h + '<div class="muted">Cuadre v0.3 · ' + (CLOUD ? 'tus datos están en la nube.' : 'modo local: tus datos se guardan en este navegador.') + '</div>';
    }
    var back = '<button class="back" data-a="sub" data-v="menu">‹ Volver</button>';
    if (sub === 'budgets') return viewBudgets();
    if (sub === 'remind') return viewRemind();
    if (sub === 'f-bud') return viewForm();
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
      return back + '<h1 class="h2">Apariencia</h1>' + banners() +
        '<div class="seg" role="group" aria-label="Tema"><button data-a="theme" data-v="system" aria-pressed="' + (th === 'system') + '">Sistema</button><button data-a="theme" data-v="light" aria-pressed="' + (th === 'light') + '">Claro</button><button data-a="theme" data-v="dark" aria-pressed="' + (th === 'dark') + '">Oscuro</button></div>' +
        '<div class="muted">"Sistema" sigue el modo claro u oscuro de tu teléfono o computadora. Esta opción se guarda en este dispositivo.</div>';
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
      var hb = back + '<h1 class="h2">' + (CLOUD ? 'Exportar e importar' : 'Copia de seguridad') + '</h1>' + banners() +
        '<div class="muted">' + (CLOUD ? 'Tus datos ya están guardados en la nube. Aun así, puedes copiar una versión en texto para tenerla a mano.' : 'Tus datos viven solo en este navegador. Copia este texto y guárdalo en un lugar seguro (por ejemplo, envíatelo por WhatsApp).') + '</div>' +
        '<textarea class="box" id="bk" readonly aria-label="Copia de seguridad">' + esc(JSON.stringify(S, function (k, v) { return k === 'profile' ? undefined : v; })) + '</textarea>' +
        '<button class="btn" data-a="copy-backup">Copiar copia de seguridad</button>' +
        '<div class="card"><div class="label">' + (CLOUD ? 'Importar' : 'Restaurar') + '</div><div class="muted">' +
        (CLOUD ? 'Pega aquí una copia de la versión de archivo único de Cuadre. Se suma a lo que ya tienes, sin borrar nada.' : 'Pega aquí una copia anterior. Reemplaza lo que tengas ahora.') + '</div>' +
        '<textarea class="box" id="rs" aria-label="Pegar copia"></textarea>' +
        (msg ? '<div class="' + (msgOk ? 'muted' : 'err') + '" role="alert">' + esc(msg) + '</div>' : '') +
        '<button class="btn quiet" data-a="restore"' + (busy ? ' disabled' : '') + '>' + (CLOUD ? 'Importar datos' : 'Restaurar datos') + '</button></div>';
      return hb;
    }
    return '';
  }

  function render() {
    if (!S) return;
    $app.innerHTML = tab === 'home' ? viewHome() : tab === 'moves' ? viewMoves() : tab === 'pay' ? viewPay() : viewMore();
    $navwrap.hidden = false;
    var tabs = [['home', '🏠', 'Inicio'], ['moves', '↕️', 'Movimientos'], ['pay', '🗓️', 'Pagos'], ['more', '⋯', 'Más']], nb = urgent().filter(function (i) { return i.level === 'late' || i.level === 'today'; }).length;
    var btn = function (t) {
      return '<button data-a="tab" data-v="' + t[0] + '"' + (tab === t[0] ? ' aria-current="page"' : '') + '><span class="e" aria-hidden="true">' + t[1] + '</span>' + t[2] + (t[0] === 'pay' && nb ? '<i class="dot" aria-label="' + nb + ' por atender">' + nb + '</i>' : '') + '</button>';
    };
    $nav.innerHTML = btn(tabs[0]) + btn(tabs[1]) + '<button class="plus" data-a="new" aria-label="Registrar un movimiento">+</button>' + btn(tabs[2]) + btn(tabs[3]);
  }

  /* ---------- 10. Pantalla de acceso (modo nube) ---------- */
  function renderAuth() {
    $navwrap.hidden = true; sheet = null; renderSheet();
    var signup = authMode === 'signup';
    $app.innerHTML = '<div class="auth"><div class="brand">Cuadre</div>' +
      '<div class="muted">' + (signup ? 'Crea tu cuenta para guardar tus finanzas en la nube y usarlas desde cualquier dispositivo.' : 'Inicia sesión para ver tus finanzas.') + '</div>' +
      '<form id="authform" novalidate>' +
      (signup ? '<div class="field"><label class="label" for="un">Usuario</label><input id="un" maxlength="20" autocomplete="username" autocapitalize="none" placeholder="ej. daniela_14" value="' + esc(authDraft.username) + '" required></div>' : '') +
      '<div class="field"><label class="label" for="em">Correo</label><input id="em" type="email" autocomplete="email" inputmode="email" autocapitalize="none" value="' + esc(authDraft.email) + '" required></div>' +
      '<div class="field"><label class="label" for="pw">Contraseña</label><input id="pw" type="password" autocomplete="' + (signup ? 'new-password' : 'current-password') + '" minlength="' + (signup ? 8 : 6) + '" required></div>' +
      (signup ? '<div class="field"><label class="label" for="pw2">Confirmar contraseña</label><input id="pw2" type="password" autocomplete="new-password" required></div><div class="muted">Mínimo 8 caracteres.</div>' : '') +
      (authMsg ? '<div class="' + (authMsg.ok ? 'muted' : 'err') + '" role="alert">' + esc(authMsg.text) + '</div>' : '') +
      '<button class="btn" type="submit"' + (authBusy ? ' disabled' : '') + '>' + (authBusy ? 'Un momento…' : signup ? 'Crear cuenta' : 'Entrar') + '</button></form>' +
      '<button class="switch" data-a="auth-switch">' + (signup ? 'Ya tengo cuenta · Entrar' : 'No tengo cuenta · Crear una') + '</button></div>';
  }
  async function submitAuth() {
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
      dateMode: t.dateISO === d ? 'today' : t.dateISO === addDays(d, -1) ? 'yesterday' : 'other', customDate: t.dateISO, note: t.note, errors: {}, confirmDelete: false, saving: false, pay: null, split: t.split ? { people: t.split.map(function (x) { return { name: x.name, share: minorToText(x.shareMinor), settled: !!x.settled }; }) } : null
    } : {
      id: null, type: 'expense', currency: S.displayCurrency, amountText: '', categoryId: (catsFor('expense')[0] || {}).id || null,
      accountId: defaultAccount(S.displayCurrency), dateMode: 'today', customDate: d, note: '', errors: {}, confirmDelete: false, saving: false, pay: null, split: null
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
      '<button class="btn" data-a="save-tx"' + (s.saving ? ' disabled' : '') + '>' + (s.saving ? 'Guardando…' : s.id ? 'Guardar cambios' : 'Listo') + '</button>' +
      (s.id ? (s.confirmDelete ? slideHtml('tx', s.id, '') : '<button class="btn danger" data-a="del-tx"' + (s.saving ? ' disabled' : '') + '>Eliminar movimiento</button>') : '') +
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
      accountId: s.accountId, note: s.note.trim().slice(0, 120), dateISO: dateISO, createdAt: existing ? existing.createdAt : now, updatedAt: now, split: splitArr };
    s.saving = true; renderSheet(false);
    var ok = await act(async function () {
      await B.saveTx(tx);
      if (existing) S.transactions = S.transactions.map(function (x) { return x.id === tx.id ? tx : x; }); else S.transactions.push(tx);
      persist();
    });
    if (ok) { if (s.pay) await afterPay(s.pay); sheet = null; renderSheet(); render(); } else if (sheet) { sheet.saving = false; renderSheet(false); }
  }
  async function deleteTx() {
    var s = sheet; if (!s || s.saving) return;
    s.saving = true; renderSheet(false);
    var ok = await act(async function () {
      await B.removeTx(s.id);
      S.transactions = S.transactions.filter(function (x) { return x.id !== s.id; });
      persist();
    });
    if (ok) { sheet = null; renderSheet(); render(); } else if (sheet) { sheet.saving = false; sheet.confirmDelete = false; renderSheet(false); }
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
    S.rate = rate; persist();
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
      if (!a || !c || a.currency !== t.currency || !Number.isSafeInteger(t.amountMinor) || t.amountMinor <= 0 || !Number.isSafeInteger(t.rateE4) || t.rateE4 <= 0 || !validDate(t.dateISO)) { skipped++; return; }
      rows.push({ id: uuid(), type: t.type === 'income' ? 'income' : 'expense', amountMinor: t.amountMinor, currency: t.currency, rateE4: t.rateE4, categoryId: c.id, accountId: a.id,
        note: String(t.note || '').slice(0, 120), dateISO: t.dateISO, createdAt: t.createdAt || now, updatedAt: now });
    });
    await B.addAccounts(newAcc); await B.addCategories(newCat); await B.addTxs(rows);
    S.accounts = S.accounts.concat(newAcc); S.categories = S.categories.concat(newCat); S.transactions = S.transactions.concat(rows);
    persist();
    return 'Importado: ' + rows.length + ' movimientos, ' + newAcc.length + ' cuentas nuevas, ' + newCat.length + ' categorías nuevas' + (skipped ? ' (' + skipped + ' omitidos por datos inválidos).' : '.');
  }

  /* ---------- 14. Eventos ---------- */
  document.addEventListener('input', function (ev) {
    var t = ev.target;
    if (t.dataset && t.dataset.fd && fd) { fd[t.dataset.fd] = t.value; return; }
    if (t.dataset && t.dataset.sp && sheet && sheet.split) { var q2 = t.dataset.sp.split(':'); sheet.split.people[+q2[0]][q2[1]] = t.value; return; }
    if (t.id === 'q') { query = t.value; var l = document.getElementById('list'); if (l) l.innerHTML = movesList(); return; }
    if (t.id === 'en' && editAcc) { editAcc.name = t.value; return; }
    if (t.id === 'pu' && profDraft) { profDraft.username = t.value; return; }
    if (sheet && t.dataset && t.dataset.f) sheet[t.dataset.f] = t.value;
  });
  document.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (ev.target.id === 'authform') submitAuth();
  });
  document.addEventListener('click', async function (ev) {
    var el = ev.target.closest('[data-a]'); if (!el) return;
    var a = el.dataset.a, v = el.dataset.v, id = el.dataset.id;
    try {
      if (await handleExtra(a, el, id, v)) return;
      if (a === 'close-scrim') { if (ev.target === el) { sheet = null; renderSheet(); } return; }
      if (a === 'close') { sheet = null; renderSheet(); return; }
      if (a === 'auth-switch') { authMode = authMode === 'login' ? 'signup' : 'login'; authMsg = null; renderAuth(); return; }
      if (a === 'tab') { arm = null; fd = null; tab = v; sub = 'menu'; msg = null; topMsg = null; render(); window.scrollTo(0, 0); return; }
      if (a === 'goto-profile') { tab = 'more'; sub = 'profile'; msg = null; startProfileDraft(); render(); window.scrollTo(0, 0); return; }
      if (a === 'goto-rate') { tab = 'more'; sub = 'rate'; msg = null; render(); window.scrollTo(0, 0); return; }
      if (a === 'sub') { arm = null; sub = v; msg = null; topMsg = null; rateErr = null; if (v === 'profile') startProfileDraft(); render(); window.scrollTo(0, 0); return; }
      if (a === 'theme') { setTheme(v); render(); return; }
      if (a === 'edit-acc') { arm = null; var ea0 = accById(id); if (!ea0) return; editAcc = { id: id, name: ea0.name, logo: ea0.logo || '', msg: null, saving: false }; sub = 'acc-edit'; render(); window.scrollTo(0, 0); return; }
      if (a === 'rm-logo') { editAcc.logo = ''; render(); return; }
      if (a === 'save-acc') { await saveAccountEdit(); return; }
      if (a === 'rm-avatar') { profDraft.avatar = ''; render(); return; }
      if (a === 'save-profile') { await saveProfileClick(); return; }
      if (a === 'disp') { S.displayCurrency = v; persist(); render(); return; }
      if (a === 'filter') { filter = v; render(); return; }
      if (a === 'new') { openSheet(null); return; }
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
        var text = document.getElementById('rs').value;
        busy = true; render();
        try {
          if (offline) throw new Error('Sin conexión');
          msg = await importBackup(text); msgOk = true;
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
      if (t.id === 'logofile' && editAcc) {
        editAcc.logo = safeImg(await imageToDataUrl(f, 96, 'image/png')); editAcc.msg = editAcc.logo ? null : 'No se pudo usar esa imagen.';
        if (editAcc.logo.length > 60000) { editAcc.logo = ''; editAcc.msg = 'Esa imagen es demasiado pesada. Prueba con una más simple.'; }
        render();
      } else if (t.id === 'avfile' && profDraft) {
        profDraft.avatar = safeImg(await imageToDataUrl(f, 256, 'image/jpeg', 0.85)); msg = profDraft.avatar ? null : 'No se pudo usar esa imagen.'; msgOk = false;
        render();
      }
    } catch (e) {
      if (t.id === 'logofile' && editAcc) editAcc.msg = 'No se pudo leer esa imagen. Prueba con otra (JPG o PNG).';
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
    try { session = check(await sb.auth.getSession()).data.session; } catch (e) { session = null; }
    sb.auth.onAuthStateChange(function (event) {
      if (event === 'SIGNED_OUT' && user) { user = null; S = null; authMode = 'login'; renderAuth(); }
    });
    if (session) { user = session.user; await startApp(); } else renderAuth();
  }
  // Se expone solo lo necesario para las pruebas automáticas.
  window.__cuadre = { parseAmount: parseAmount, parseRate: parseRate, fmt: fmt, fmtRate: fmtRate, convert: convert };
  boot();
})();
