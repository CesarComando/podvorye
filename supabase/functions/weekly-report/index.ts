// Еженедельный отчёт на почту. Вызывается по расписанию (pg_cron, понедельник утром) с секретом.
// Текст отчёта собирает само приложение при каждом сохранении (farms.report) — здесь только отправка.
//
// Секреты (Supabase → Edge Functions → Secrets):
//   CRON_SECRET     — длинная случайная строка; та же хранится в Vault базы для расписания
//   RESEND_API_KEY  — ключ resend.com (без него функция ничего не отправляет)
//   REPORT_FROM     — отправитель, например «Подворье <otchet@ваш-домен.lv>» (домен подтверждён в Resend)
import { admin } from '../_shared/common.ts'

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET')?.trim()
  if (!secret || req.headers.get('x-cron-secret') !== secret) return new Response('forbidden', { status: 403 })

  const key = Deno.env.get('RESEND_API_KEY')?.trim()
  const from = Deno.env.get('REPORT_FROM')?.trim()
  if (!key || !from) return Response.json({ skipped: 'RESEND_API_KEY / REPORT_FROM не заданы' })

  // ?mode=daily — утреннее письмо: дела на сегодня и просроченные (только если включено в настройках хозяйства).
  if (new URL(req.url).searchParams.get('mode') === 'daily') {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Riga' })
    const SEC: Record<string, string> = { farm: 'Хозяйство', home: 'Дом', ferma: 'Хозяйство', me: 'Личное' }
    const { data: all, error: e1 } = await admin.from('farms').select('id, name, data, report_email').not('report_email', 'is', null)
    if (e1) return Response.json({ error: e1.message }, { status: 500 })
    const sent: unknown[] = []
    for (const f of all ?? []) {
      const d: any = f.data || {}
      if (!d.settings?.dailyMail) continue
      const open = (d.tasks || []).filter((t: any) => !t.deleted && !t.done && t.due && t.due <= today)
        .sort((a: any, b: any) => ((a.due + (a.time || '')) < (b.due + (b.time || '')) ? -1 : 1))
      // счета со сроком в ближайшие 3 дня — тоже в утреннее письмо
      const in3 = new Date(Date.parse(today + 'T12:00:00Z') + 3 * 864e5).toISOString().slice(0, 10)
      for (const b of (d.bills || []).filter((b: any) => !b.deleted && !b.paid && b.due && b.due <= in3))
        open.push({ title: `Оплатить: ${b.to}${b.amount ? ' — ' + Number(b.amount).toFixed(2).replace('.', ',') + ' €' : ''}${b.due > today ? ' (до ' + b.due.split('-').reverse().slice(0, 2).join('.') + ')' : ''}`, due: b.due < today ? b.due : today, sec: b.sec })
      if (!open.length) continue
      const line = (t: any) => `${t.time ? t.time + ' — ' : ''}${t.title}${t.due < today ? ` (просрочено с ${t.due.split('-').reverse().slice(0, 2).join('.')})` : ''} · ${SEC[t.sec] || ''}`
      const text = `Доброе утро! Дела на сегодня:\n\n${open.map((t: any) => '— ' + line(t)).join('\n')}\n\nХорошего дня 🌾`
      const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:16px;line-height:1.5;color:#1E2B1C;max-width:640px">
        <h2 style="color:#3A8A3C;margin:0 0 10px">🌾 Доброе утро! Дела на сегодня</h2>
        <ul style="padding-left:20px;margin:0">${open.map((t: any) => `<li style="margin:4px 0${t.due < today ? ';color:#B23E2C' : ''}">${esc(line(t))}</li>`).join('')}</ul>
        <p style="color:#5E6B55;font-size:13px;margin-top:18px">Отключить утреннее письмо — во вкладке «Хозяйство».</p></div>`
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [String(f.report_email).trim()], subject: `Дела на сегодня: ${open.length}`, html, text }),
      })
      if (!r.ok) console.error('daily resend', r.status, await r.text())
      sent.push({ farm: f.id, ok: r.ok, tasks: open.length })
    }
    return Response.json({ daily: sent })
  }

  const { data: farms, error } = await admin.from('farms')
    .select('id, name, report, report_email, updated_at')
    .not('report_email', 'is', null).not('report', 'is', null)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const results: unknown[] = []
  for (const f of farms ?? []) {
    const to = String(f.report_email).trim()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) continue
    const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#1E2B1C;max-width:640px">
      <h2 style="color:#3A8A3C;margin:0 0 12px">🌾 ${esc(f.name || 'Подворье')} — отчёт за неделю</h2>
      <pre style="white-space:pre-wrap;font-family:inherit;margin:0">${esc(f.report)}</pre>
      <p style="color:#5E6B55;font-size:13px;margin-top:20px">Данные на ${new Date(f.updated_at).toLocaleDateString('ru-RU', { timeZone: 'Europe/Riga' })}. Отключить отчёт — убрать почту во вкладке «Хозяйство».</p></div>`
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject: `Подворье: отчёт за неделю`, html, text: f.report }),
    })
    const ok = r.ok
    if (ok) await admin.from('farms').update({ report_sent_at: new Date().toISOString() }).eq('id', f.id)
    else console.error('weekly-report resend', r.status, await r.text())
    results.push({ farm: f.id, ok })
  }
  return Response.json({ sent: results })
})
