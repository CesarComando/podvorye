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
