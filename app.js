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
    SUPABASE_ANON_KEY: 'sb_publishable_JXA4mOZJH3eRJeKd8s6YZw_Y4shklIr'    // Ejemplo: 'eyJhbGciOi...'
  };

  var CLOUD = !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
  var LOCAL_KEY = 'cuadre:web:v1';
  var DISPLAY_KEY = 'cuadre:display';
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
    if (/Failed to fetch|NetworkError|Load failed|network|fetch/i.test(m)) return 'Sin conexión. Inténtalo de nuevo cuando tengas internet.';
    if (/Invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
    if (/Email not confirmed/i.test(m)) return 'Primero confirma tu correo: revisa tu bandeja de entrada.';
    if (/already registered|already been registered/i.test(m)) return 'Ese correo ya tiene una cuenta. Prueba iniciar sesión.';
    if (/at least \d+ characters|weak/i.test(m)) return 'La contraseña es muy corta: usa al menos 6 caracteres.';
    if (/valid email|invalid format/i.test(m)) return 'Escribe un correo válido.';
    if (/rate limit|too many/i.test(m)) return 'Demasiados intentos. Espera unos minutos y vuelve a probar.';
    if (/row-level security|permission denied/i.test(m)) return 'No tienes permiso para esa acción. Cierra sesión y vuelve a entrar.';
    if (/duplicate key|unique/i.test(m)) return 'Ya existe un registro con ese nombre.';
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
  function initialData() {
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
      if (valid(d)) return d;
      throw new Error('formato');
    } catch (e) {
      try { if (raw !== null) localStorage.setItem(LOCAL_KEY + ':dañado', raw); } catch (e2) { /* nada */ }
      return initialData();
    }
  }
  function cacheLoad() {
    try { var d = JSON.parse(localStorage.getItem(cacheKey())); return valid(d) ? d : null; } catch (e) { return null; }
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
    return {
      version: 1,
      accounts: res[0].map(function (a) { return { id: a.id, name: a.name, currency: a.currency, openingMinor: Number(a.opening_minor), createdAt: a.created_at }; }),
      categories: res[1].map(function (c) { return { id: c.id, name: c.name, icon: c.icon, kind: c.kind, sortOrder: c.sort_order }; }),
      transactions: res[2].map(function (t) {
        return { id: t.id, type: t.type, amountMinor: Number(t.amount_minor), currency: t.currency, rateE4: Number(t.rate_e4),
          categoryId: t.category_id, accountId: t.account_id, note: t.note || '', dateISO: t.date, createdAt: t.created_at, updatedAt: t.updated_at };
      }),
      rate: { rateE4: Number(s.rate_e4 || 0), updatedAt: s.rate_updated_at || null, source: s.rate_source || 'none' },
      displayCurrency: readDisplay()
    };
  }
  function txRow(t) {
    return { id: t.id, user_id: user.id, type: t.type, amount_minor: t.amountMinor, currency: t.currency, rate_e4: t.rateE4,
      category_id: t.categoryId, account_id: t.accountId, note: t.note, date: t.dateISO, created_at: t.createdAt, updated_at: t.updatedAt };
  }
  function accRow(a) { return { id: a.id, user_id: user.id, name: a.name, currency: a.currency, opening_minor: a.openingMinor, created_at: a.createdAt }; }
  function catRow(c) { return { id: c.id, user_id: user.id, name: c.name, icon: c.icon, kind: c.kind, sort_order: c.sortOrder }; }

  /* Operaciones de escritura. En modo local no hacen nada (se guarda con persist()). */
  var B = {
    saveTx: async function (t) { if (CLOUD) check(await sb.from('transactions').upsert(txRow(t))); },
    removeTx: async function (id) { if (CLOUD) check(await sb.from('transactions').delete().eq('id', id)); },
    addAccounts: async function (list) { if (CLOUD && list.length) check(await sb.from('accounts').insert(list.map(accRow))); },
    addCategories: async function (list) { if (CLOUD && list.length) check(await sb.from('categories').insert(list.map(catRow))); },
    removeCategory: async function (id) { if (CLOUD) check(await sb.from('categories').delete().eq('id', id)); },
    addTxs: async function (list) {
      if (!CLOUD) return;
      for (var i = 0; i < list.length; i += 500) check(await sb.from('transactions').insert(list.slice(i, i + 500).map(txRow)));
    },
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

  /* ---------- 8. Cálculos ---------- */
  function balance(a) {
    var b = a.openingMinor;
    S.transactions.forEach(function (t) { if (t.accountId === a.id) b += t.type === 'income' ? t.amountMinor : -t.amountMinor; });
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
      var v = convert(t.amountMinor, t.currency, disp, t.rateE4);
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
      '<span class="mid"><b>' + esc(title) + '</b><span>' + esc(sub2) + ' · ' + shortDate(t.dateISO) + '</span></span>' +
      '<span class="amt"><b class="' + (pos ? 'pos' : '') + '">' + (pos ? '+' : '-') + fmt(t.amountMinor, t.currency) + '</b>' +
      '<span>≈ ' + fmt(convert(t.amountMinor, t.currency, other, t.rateE4), other) + '</span></span></button>';
  }
  function banners() {
    var h = '';
    if (offline) h += '<div class="banner">Sin conexión: ves tus últimos datos guardados y no puedes hacer cambios.<button class="retry" data-a="retry">Reintentar</button></div>';
    if (saveFailed) h += '<div class="banner bad">No se pudo guardar una copia en este dispositivo. Revisa que el navegador permita guardar datos.</div>';
    return h;
  }

  function viewHome() {
    var disp = S.displayCurrency, other = disp === 'VES' ? 'USD' : 'VES', rate = S.rate.rateE4;
    var month = today().slice(0, 7), sum = monthSummary(month, disp), total = totalAvailable(disp);
    var recent = sorted().slice(0, 5), h = '';
    h += '<div class="top"><div class="brand">Cuadre</div>' + rateChip() + '</div>' + banners();
    if (rate <= 0) h += '<div class="banner">Aún no hay tasa del dólar. Toca el botón de arriba para definirla.</div>';
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

  function viewMore() {
    if (sub === 'menu') {
      var r = S.rate.rateE4;
      var items = [
        ['accounts', '🏦', 'Cuentas', S.accounts.length + ' cuentas'],
        ['cats', '🏷️', 'Categorías', S.categories.length + ' categorías'],
        ['rate', '💱', 'Tasa del dólar', r > 0 ? 'Bs ' + fmtRate(r) + ' por $' : 'Sin definir'],
        ['backup', '💾', CLOUD ? 'Exportar e importar' : 'Copia de seguridad', CLOUD ? 'Descarga o trae datos' : 'Guarda o restaura tus datos']
      ];
      var h = '<h1 class="h2">Más</h1>' + banners() + items.map(function (i) {
        return '<button class="link" data-a="sub" data-v="' + i[0] + '"><span class="e" aria-hidden="true">' + i[1] + '</span><span class="col"><b>' + i[2] + '</b><span class="muted">' + i[3] + '</span></span><span class="chev" aria-hidden="true">›</span></button>';
      }).join('');
      if (CLOUD && user) {
        h += '<div class="card"><div class="label">Tu cuenta</div><div class="who">' + esc(user.email || '') + '</div><button class="btn quiet" data-a="logout">Cerrar sesión</button></div>';
      }
      return h + '<div class="muted">Cuadre v0.1 · ' + (CLOUD ? 'tus datos están en la nube.' : 'modo local: tus datos se guardan en este navegador.') + '</div>';
    }
    var back = '<button class="back" data-a="sub" data-v="menu">‹ Volver</button>';
    if (sub === 'accounts') {
      var ha = back + '<h1 class="h2">Cuentas</h1>' + banners();
      S.accounts.forEach(function (a) {
        ha += '<div class="card"><div class="row"><div class="col"><b>' + esc(a.name) + '</b><span class="muted">' + (a.currency === 'USD' ? 'Dólares' : 'Bolívares') + '</span></div><span class="num">' + fmt(balance(a), a.currency) + '</span></div></div>';
      });
      ha += '<div class="card"><div class="label">Nueva cuenta</div>' +
        '<div class="field"><label for="an">Nombre</label><input id="an" maxlength="30" placeholder="Ej. Banesco" autocomplete="off"></div>' +
        '<div class="seg" role="group" aria-label="Moneda de la cuenta"><button data-a="acur" data-v="VES" aria-pressed="' + (newAccCur === 'VES') + '">Bolívares</button><button data-a="acur" data-v="USD" aria-pressed="' + (newAccCur === 'USD') + '">Dólares</button></div>' +
        '<div class="field"><label for="ao">Saldo actual (opcional)</label><input id="ao" inputmode="decimal" placeholder="0,00" autocomplete="off"></div>' +
        (msg ? '<div class="err" role="alert">' + esc(msg) + '</div>' : '') +
        '<button class="btn" data-a="add-account">Agregar cuenta</button></div>';
      return ha;
    }
    if (sub === 'cats') {
      var hc = back + '<h1 class="h2">Categorías</h1>' + banners() + (topMsg ? '<div class="banner bad" role="alert">' + esc(topMsg) + '</div>' : '');
      [['expense', 'Gastos'], ['income', 'Ingresos']].forEach(function (k) {
        hc += '<div class="label">' + k[1] + '</div>';
        S.categories.filter(function (c) { return c.kind === k[0]; }).sort(function (a, b) { return a.sortOrder - b.sortOrder; }).forEach(function (c) {
          hc += '<div class="card"><div class="row"><span>' + esc(c.icon) + ' ' + esc(c.name) + '</span><button style="color:var(--expense);font-weight:800;min-height:44px" data-a="del-cat" data-id="' + esc(c.id) + '" aria-label="Eliminar categoría ' + esc(c.name) + '">Eliminar</button></div></div>';
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
        '<div class="muted">Cada movimiento guarda la tasa del día en que lo registras, así tu historial no cambia cuando sube el dólar. El euro BCV y el dólar Binance llegan en la v0.2.</div>';
    }
    if (sub === 'backup') {
      var hb = back + '<h1 class="h2">' + (CLOUD ? 'Exportar e importar' : 'Copia de seguridad') + '</h1>' + banners() +
        '<div class="muted">' + (CLOUD ? 'Tus datos ya están guardados en la nube. Aun así, puedes copiar una versión en texto para tenerla a mano.' : 'Tus datos viven solo en este navegador. Copia este texto y guárdalo en un lugar seguro (por ejemplo, envíatelo por WhatsApp).') + '</div>' +
        '<textarea class="box" id="bk" readonly aria-label="Copia de seguridad">' + esc(JSON.stringify(S)) + '</textarea>' +
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
    $app.innerHTML = tab === 'home' ? viewHome() : tab === 'moves' ? viewMoves() : viewMore();
    $navwrap.hidden = false;
    var tabs = [['home', '🏠', 'Inicio'], ['moves', '↕️', 'Movimientos'], ['more', '⋯', 'Más']];
    var btn = function (t) {
      return '<button data-a="tab" data-v="' + t[0] + '"' + (tab === t[0] ? ' aria-current="page"' : '') + '><span class="e" aria-hidden="true">' + t[1] + '</span>' + t[2] + '</button>';
    };
    $nav.innerHTML = btn(tabs[0]) + btn(tabs[1]) + '<button class="plus" data-a="new" aria-label="Registrar un movimiento">+</button>' + btn(tabs[2]);
  }

  /* ---------- 10. Pantalla de acceso (modo nube) ---------- */
  function renderAuth() {
    $navwrap.hidden = true; sheet = null; renderSheet();
    var signup = authMode === 'signup';
    $app.innerHTML = '<div class="auth"><div class="brand">Cuadre</div>' +
      '<div class="muted">' + (signup ? 'Crea tu cuenta para guardar tus finanzas en la nube y usarlas desde cualquier dispositivo.' : 'Inicia sesión para ver tus finanzas.') + '</div>' +
      '<form id="authform" novalidate>' +
      '<div class="field"><label class="label" for="em">Correo</label><input id="em" type="email" autocomplete="email" inputmode="email" autocapitalize="none" required></div>' +
      '<div class="field"><label class="label" for="pw">Contraseña</label><input id="pw" type="password" autocomplete="' + (signup ? 'new-password' : 'current-password') + '" minlength="6" required></div>' +
      (authMsg ? '<div class="' + (authMsg.ok ? 'muted' : 'err') + '" role="alert">' + esc(authMsg.text) + '</div>' : '') +
      '<button class="btn" type="submit"' + (authBusy ? ' disabled' : '') + '>' + (authBusy ? 'Un momento…' : signup ? 'Crear cuenta' : 'Entrar') + '</button></form>' +
      '<button class="switch" data-a="auth-switch">' + (signup ? 'Ya tengo cuenta · Entrar' : 'No tengo cuenta · Crear una') + '</button></div>';
  }
  async function submitAuth() {
    var email = document.getElementById('em').value.trim(), pw = document.getElementById('pw').value;
    if (!email || !pw) { authMsg = { ok: false, text: 'Escribe tu correo y tu contraseña.' }; renderAuth(); return; }
    if (authMode === 'signup' && pw.length < 6) { authMsg = { ok: false, text: 'La contraseña debe tener al menos 6 caracteres.' }; renderAuth(); return; }
    authBusy = true; authMsg = null; renderAuth();
    try {
      var r;
      if (authMode === 'signup') {
        r = check(await sb.auth.signUp({ email: email, password: pw }));
        if (!r.data || !r.data.session) {
          authBusy = false; authMode = 'login';
          authMsg = { ok: true, text: 'Cuenta creada. Te enviamos un correo para confirmarla; ábrelo y luego inicia sesión aquí.' };
          renderAuth(); return;
        }
      } else {
        r = check(await sb.auth.signInWithPassword({ email: email, password: pw }));
      }
      user = r.data.user || r.data.session.user;
      authBusy = false; authMsg = null;
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
      dateMode: t.dateISO === d ? 'today' : t.dateISO === addDays(d, -1) ? 'yesterday' : 'other', customDate: t.dateISO, note: t.note, errors: {}, confirmDelete: false, saving: false
    } : {
      id: null, type: 'expense', currency: S.displayCurrency, amountText: '', categoryId: (catsFor('expense')[0] || {}).id || null,
      accountId: defaultAccount(S.displayCurrency), dateMode: 'today', customDate: d, note: '', errors: {}, confirmDelete: false, saving: false
    };
    renderSheet(!t);
  }
  function chipBtns(list, selId, action) {
    return list.map(function (x) { return '<button class="chip" data-a="' + action + '" data-v="' + esc(x.id) + '" aria-pressed="' + (selId === x.id) + '">' + x.label + '</button>'; }).join('');
  }
  function renderSheet(focusAmount) {
    if (!sheet) { $sheet.innerHTML = ''; return; }
    var s = sheet, e = s.errors, accs = S.accounts.filter(function (a) { return a.currency === s.currency; });
    $sheet.innerHTML = '<div class="scrim" data-a="close-scrim"><div class="sheet" role="dialog" aria-modal="true" aria-label="' + (s.id ? 'Editar movimiento' : 'Nuevo movimiento') + '">' +
      '<div class="row"><h2 class="h2">' + (s.id ? 'Editar movimiento' : 'Nuevo movimiento') + '</h2><button class="back" data-a="close">Cerrar</button></div>' +
      '<div class="seg" role="group" aria-label="Tipo"><button data-a="stype" data-v="expense" aria-pressed="' + (s.type === 'expense') + '">Gasto</button><button data-a="stype" data-v="income" aria-pressed="' + (s.type === 'income') + '">Ingreso</button></div>' +
      (e.rate ? '<div class="banner">' + esc(e.rate) + '</div>' : '') +
      '<div class="seg" role="group" aria-label="Moneda"><button data-a="scur" data-v="VES" aria-pressed="' + (s.currency === 'VES') + '">Bolívares</button><button data-a="scur" data-v="USD" aria-pressed="' + (s.currency === 'USD') + '">Dólares</button></div>' +
      '<div><div class="amount' + (e.amount ? ' bad' : '') + '"><span>' + (s.currency === 'USD' ? '$' : 'Bs') + '</span><input id="amt" data-f="amountText" inputmode="decimal" placeholder="0,00" aria-label="Monto" autocomplete="off" value="' + esc(s.amountText) + '"></div>' +
      (e.amount ? '<div class="err" role="alert">' + esc(e.amount) + '</div>' : '') + '</div>' +
      '<div class="col" style="gap:8px"><div class="label">Categoría</div><div class="chips">' + chipBtns(catsFor(s.type).map(function (c) { return { id: c.id, label: esc(c.icon) + ' ' + esc(c.name) }; }), s.categoryId, 'scat') + '</div>' + (e.category ? '<div class="err">' + esc(e.category) + '</div>' : '') + '</div>' +
      '<div class="col" style="gap:8px"><div class="label">' + (s.type === 'expense' ? 'Pagado desde' : 'Recibido en') + '</div><div class="chips">' + chipBtns(accs.map(function (a) { return { id: a.id, label: esc(a.name) }; }), s.accountId, 'sacc') + '</div>' +
      (accs.length === 0 ? '<div class="muted">No tienes cuentas en esta moneda. Crea una en Más › Cuentas.</div>' : '') + (e.account ? '<div class="err">' + esc(e.account) + '</div>' : '') + '</div>' +
      '<div class="col" style="gap:8px"><div class="label">Fecha</div><div class="chips"><button class="chip" data-a="sdate" data-v="today" aria-pressed="' + (s.dateMode === 'today') + '">Hoy</button><button class="chip" data-a="sdate" data-v="yesterday" aria-pressed="' + (s.dateMode === 'yesterday') + '">Ayer</button><button class="chip" data-a="sdate" data-v="other" aria-pressed="' + (s.dateMode === 'other') + '">Otra fecha</button></div>' +
      (s.dateMode === 'other' ? '<div class="field"><input id="cd" data-f="customDate" placeholder="AAAA-MM-DD" aria-label="Fecha en formato año-mes-día" value="' + esc(s.customDate) + '"' + (e.date ? ' aria-invalid="true"' : '') + '></div>' : '') +
      (e.date ? '<div class="err">' + esc(e.date) + '</div>' : '') + '</div>' +
      '<div class="field"><label class="label" for="nt">Nota (opcional)</label><input id="nt" data-f="note" maxlength="120" placeholder="Ej. Almuerzo" autocomplete="off" value="' + esc(s.note) + '"></div>' +
      '<button class="btn" data-a="save-tx"' + (s.saving ? ' disabled' : '') + '>' + (s.saving ? 'Guardando…' : s.id ? 'Guardar cambios' : 'Listo') + '</button>' +
      (s.id ? '<button class="btn danger" data-a="del-tx"' + (s.saving ? ' disabled' : '') + '>' + (s.confirmDelete ? 'Toca otra vez para eliminar' : 'Eliminar movimiento') + '</button>' : '') +
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
    if (Object.keys(err).length) { s.errors = err; renderSheet(false); return; }
    var now = new Date().toISOString();
    var tx = { id: existing ? existing.id : uuid(), type: s.type, amountMinor: a, currency: s.currency, rateE4: rate, categoryId: s.categoryId,
      accountId: s.accountId, note: s.note.trim().slice(0, 120), dateISO: dateISO, createdAt: existing ? existing.createdAt : now, updatedAt: now };
    s.saving = true; renderSheet(false);
    var ok = await act(async function () {
      await B.saveTx(tx);
      if (existing) S.transactions = S.transactions.map(function (x) { return x.id === tx.id ? tx : x; }); else S.transactions.push(tx);
      persist();
    });
    if (ok) { sheet = null; renderSheet(); render(); } else if (sheet) { sheet.saving = false; renderSheet(false); }
  }
  async function deleteTx() {
    var s = sheet; if (!s || s.saving) return;
    if (!s.confirmDelete) { s.confirmDelete = true; renderSheet(false); return; }
    s.saving = true; renderSheet(false);
    var ok = await act(async function () {
      await B.removeTx(s.id);
      S.transactions = S.transactions.filter(function (x) { return x.id !== s.id; });
      persist();
    });
    if (ok) { sheet = null; renderSheet(); render(); } else if (sheet) { sheet.saving = false; sheet.confirmDelete = false; renderSheet(false); }
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
    if (!CLOUD) { S = d; persist(); return 'Datos restaurados.'; }
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
    if (t.id === 'q') { query = t.value; var l = document.getElementById('list'); if (l) l.innerHTML = movesList(); return; }
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
      if (a === 'close-scrim') { if (ev.target === el) { sheet = null; renderSheet(); } return; }
      if (a === 'close') { sheet = null; renderSheet(); return; }
      if (a === 'auth-switch') { authMode = authMode === 'login' ? 'signup' : 'login'; authMsg = null; renderAuth(); return; }
      if (a === 'tab') { tab = v; sub = 'menu'; msg = null; topMsg = null; render(); window.scrollTo(0, 0); return; }
      if (a === 'goto-rate') { tab = 'more'; sub = 'rate'; msg = null; render(); window.scrollTo(0, 0); return; }
      if (a === 'sub') { sub = v; msg = null; topMsg = null; rateErr = null; render(); window.scrollTo(0, 0); return; }
      if (a === 'disp') { S.displayCurrency = v; persist(); render(); return; }
      if (a === 'filter') { filter = v; render(); return; }
      if (a === 'new') { openSheet(null); return; }
      if (a === 'edit') { openSheet(id); return; }
      if (a === 'retry') { await startApp(); return; }
      if (a === 'logout') {
        try { await sb.auth.signOut({ scope: 'local' }); } catch (e) { /* si falla, igual se limpia abajo */ }
        user = null; S = null; tab = 'home'; sub = 'menu'; authMode = 'login'; authMsg = null; renderAuth(); return;
      }
      if (a === 'stype') { sheet.type = v; sheet.categoryId = (catsFor(v)[0] || {}).id || null; renderSheet(false); return; }
      if (a === 'scur') { sheet.currency = v; sheet.accountId = defaultAccount(v); renderSheet(false); return; }
      if (a === 'scat') { sheet.categoryId = v; renderSheet(false); return; }
      if (a === 'sacc') { sheet.accountId = v; renderSheet(false); return; }
      if (a === 'sdate') { sheet.dateMode = v; renderSheet(false); return; }
      if (a === 'save-tx') { await saveTx(); return; }
      if (a === 'del-tx') { await deleteTx(); return; }
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
      if (a === 'del-cat') {
        var c = catById(id); topMsg = null;
        if (S.transactions.some(function (t) { return t.categoryId === id; })) topMsg = 'No se puede eliminar "' + c.name + '": tiene movimientos. Cámbiales la categoría primero.';
        else if (S.categories.filter(function (x) { return x.kind === c.kind; }).length <= 1) topMsg = 'Debe quedar al menos una categoría de este tipo.';
        else await act(async function () { await B.removeCategory(id); S.categories = S.categories.filter(function (x) { return x.id !== id; }); persist(); });
        render(); if (topMsg) window.scrollTo(0, 0); return;
      }
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
      render(); autoRate(); return;
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
    render(); autoRate();
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
