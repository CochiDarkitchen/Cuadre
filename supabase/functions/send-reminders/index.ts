import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

type Row = Record<string, any>;
type PushSub = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};
type Reminder = { kind: string; id: string; title: string; amount: number; currency: string; due: string; remindDays: number | null };

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
function dateKey(d: Date) { return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; }
function shiftDate(s: string, days: number) { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return dateKey(d); }
function daysBetween(a: string, b: string) { return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000); }
function daysInMonth(y: number, monthIndex: number) { return new Date(Date.UTC(y, monthIndex + 1, 0)).getUTCDate(); }
function addMonths(s: string, n: number, anchor?: number) {
  const [year, month, day] = s.split('-').map(Number);
  const zeroMonth = month - 1 + n;
  const y = year + Math.floor(zeroMonth / 12);
  const m = ((zeroMonth % 12) + 12) % 12;
  const d = Math.min(anchor || day, daysInMonth(y, m));
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function nthDue(first: string, frequency: string, anchor: number, index: number) {
  if (frequency === 'weekly') return shiftDate(first, 7 * index);
  if (frequency === 'biweekly') return shiftDate(first, 14 * index);
  if (frequency === 'yearly') return addMonths(first, 12 * index, anchor);
  return addMonths(first, index, anchor);
}
function minorText(amount: unknown, currency: unknown) {
  const minor = Number(amount || 0);
  const symbol = currency === 'USD' ? '$' : 'Bs';
  const whole = Math.floor(Math.abs(minor) / 100).toLocaleString('es-VE');
  const cents = String(Math.abs(minor) % 100).padStart(2, '0');
  return `${symbol} ${whole},${cents}`;
}
function dueLabel(today: string, due: string) {
  const n = daysBetween(today, due);
  if (n < 0) return `venció hace ${-n} día(s)`;
  if (n === 0) return 'vence hoy';
  if (n === 1) return 'vence mañana';
  return `vence en ${n} días`;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido.' });
  const schedulerSecret = Deno.env.get('PUSH_SCHEDULER_SECRET') || '';
  const requestSecret = req.headers.get('x-scheduler-secret') || '';
  if (!schedulerSecret || requestSecret.length !== schedulerSecret.length || requestSecret !== schedulerSecret) {
    return json(401, { error: 'No autorizado.' });
  }

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') || '';
  if (!url || !serviceKey || !vapidPublic || !vapidPrivate || !vapidSubject) {
    return json(503, { error: 'Faltan secretos del emisor push en el servidor.' });
  }

  try {
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const today = dateKey(new Date());
    const start = shiftDate(today, -7);
    const horizon = shiftDate(today, 30);

    const [subRes, settingsRes, schedRes, planRes, debtRes] = await Promise.all([
      admin.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth'),
      admin.from('settings').select('user_id,remind_days'),
      admin.from('scheduled_payments').select('id,user_id,name,amount_minor,currency,next_due,frequency,anchor_day,remind_days').eq('active', true).gte('next_due', start).lte('next_due', horizon),
      admin.from('installment_plans').select('id,user_id,name,total_minor,currency,installments,paid_count,frequency,first_due,anchor_day,remind_days'),
      admin.from('debts').select('id,user_id,person,kind,total_minor,paid_minor,currency,due_date,remind_days').gte('due_date', start).lte('due_date', horizon),
    ]);
    for (const r of [subRes, settingsRes, schedRes, planRes, debtRes]) if (r.error) throw r.error;

    const subscriptions = (subRes.data || []) as PushSub[];
    if (!subscriptions.length) return json(200, { ok: true, sent: 0, reason: 'No hay dispositivos suscritos.' });
    const settings = new Map<string, number>();
    for (const row of (settingsRes.data || []) as Row[]) settings.set(row.user_id, Number.isInteger(row.remind_days) ? row.remind_days : 3);
    const reminders = new Map<string, Reminder[]>();
    const pushFor = (userId: string, item: Reminder) => {
      const days = daysBetween(today, item.due);
      const remindDays = item.remindDays == null ? (settings.get(userId) ?? 3) : item.remindDays;
      if (days < -7 || days > remindDays) return;
      const list = reminders.get(userId) || [];
      list.push(item);
      reminders.set(userId, list);
    };

    for (const x of (schedRes.data || []) as Row[]) {
      pushFor(x.user_id, { kind: 'scheduled', id: x.id, title: x.name, amount: Number(x.amount_minor), currency: x.currency, due: x.next_due, remindDays: x.remind_days == null ? null : Number(x.remind_days) });
    }
    for (const p of (planRes.data || []) as Row[]) {
      const count = Number(p.installments), paid = Number(p.paid_count), total = Number(p.total_minor);
      if (count <= 0 || paid >= count) continue;
      const due = nthDue(p.first_due, p.frequency, Number(p.anchor_day) || 1, paid);
      const base = Math.floor(total / count);
      const amount = paid === count - 1 ? total - base * (count - 1) : base;
      pushFor(p.user_id, { kind: 'installment', id: p.id, title: `${p.name} · cuota ${paid + 1}/${count}`, amount, currency: p.currency, due, remindDays: p.remind_days == null ? null : Number(p.remind_days) });
    }
    for (const d of (debtRes.data || []) as Row[]) {
      if (d.kind !== 'owe' || !d.due_date || Number(d.paid_minor) >= Number(d.total_minor)) continue;
      pushFor(d.user_id, { kind: 'debt', id: d.id, title: `Pagar a ${d.person}`, amount: Number(d.total_minor) - Number(d.paid_minor), currency: d.currency, due: d.due_date, remindDays: d.remind_days == null ? null : Number(d.remind_days) });
    }

    const notifyKey = `cuadre-reminders:${today}`;
    const { data: logs, error: logError } = await admin.from('push_delivery_log').select('subscription_id').eq('notification_key', notifyKey).eq('sent_on', today);
    if (logError) throw logError;
    const alreadySent = new Set((logs || []).map((x: Row) => x.subscription_id));
    let sent = 0, skipped = 0, expired = 0, failed = 0;

    for (const sub of subscriptions) {
      const items = (reminders.get(sub.user_id) || []).sort((a, b) => a.due.localeCompare(b.due));
      if (!items.length || alreadySent.has(sub.id)) { skipped++; continue; }
      const overdueCount = items.filter((x) => x.due < today).length;
      const payload = JSON.stringify({
        title: overdueCount ? 'Revisa tus pagos pendientes' : 'Tienes pagos próximos',
        // Privacidad: no incluir en la pantalla bloqueada importes, nombres de personas ni conceptos.
        body: `${items.length} recordatorio(s) financiero(s) pendiente(s). Abre Cuadre para ver los detalles.`,
        tag: notifyKey,
        url: './',
      });
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 60 * 60 * 24 });
        const logResult = await admin.from('push_delivery_log').upsert({ subscription_id: sub.id, notification_key: notifyKey, sent_on: today }, { onConflict: 'subscription_id,notification_key,sent_on' });
        if (logResult.error) throw logResult.error;
        alreadySent.add(sub.id); sent++;
      } catch (e) {
        const statusCode = Number((e as { statusCode?: number })?.statusCode || 0);
        if (statusCode === 404 || statusCode === 410) {
          await admin.from('push_subscriptions').delete().eq('id', sub.id);
          expired++;
        } else {
          console.error('Push delivery failed', { subscriptionId: sub.id, statusCode });
          failed++;
        }
      }
    }

    return json(200, { ok: true, date: today, subscriptions: subscriptions.length, usersWithReminders: reminders.size, sent, skipped, expired, failed });
  } catch (error) {
    console.error('send-reminders failure', error);
    return json(500, { error: 'No se pudieron procesar los avisos programados.' });
  }
});
