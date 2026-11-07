// Связь с Supabase: вход, хозяйство, синхронизация, помощник Claude (через Edge Function ask-farm).
import { createClient } from '@supabase/supabase-js'

const URL_ = import.meta.env.VITE_SUPABASE_URL
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY
export const sb = createClient(URL_, ANON, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })

export async function getSession() {
  try { const { data } = await sb.auth.getSession(); return data.session } catch { return null }
}
export const onAuth = (fn) => sb.auth.onAuthStateChange((_e, s) => fn(s))

const ruAuth = (e) => {
  const m = String(e?.message || e || '')
  if (/Invalid login credentials/i.test(m)) return 'Неверная почта или пароль.'
  if (/already registered|already exists/i.test(m)) return 'Такая почта уже зарегистрирована — войдите.'
  if (/Password should be at least/i.test(m)) return 'Пароль — не короче 6 символов.'
  if (/valid email|invalid email/i.test(m)) return 'Проверьте адрес почты.'
  if (/rate limit|too many/i.test(m)) return 'Слишком много попыток — подождите минуту.'
  if (/fetch|network/i.test(m)) return 'Нет интернета — для первого входа нужна связь.'
  return 'Не получилось: ' + m
}
export async function signIn(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password })
  if (error) throw new Error(ruAuth(error))
}
export async function signUp(email, password) {
  const { data, error } = await sb.auth.signUp({ email, password })
  if (error) throw new Error(ruAuth(error))
  if (!data.session) throw new Error('Аккаунт создан. Подтвердите почту по ссылке из письма и войдите.')
}
export async function signOut() { await sb.auth.signOut() }

// ---------- хозяйство ----------
export async function myFarm() {
  const { data, error } = await sb.rpc('my_farm')
  if (error) throw error
  return data
}
export async function joinFarm(code) {
  const { data, error } = await sb.rpc('join_farm', { p_code: code })
  if (error) throw new Error(/invite not found/.test(error.message) ? 'Код не найден или уже использован — попросите новый.' : error.message)
  return data
}
export async function createInvite(farmId) {
  const { data, error } = await sb.rpc('create_invite', { p_farm: farmId })
  if (error) throw error
  return data
}
export async function listMembers(farmId) {
  const { data } = await sb.from('farm_members').select('user_id, role, email, joined_at').eq('farm_id', farmId).order('joined_at')
  return data || []
}
export async function removeMember(farmId, userId) {
  const { error } = await sb.from('farm_members').delete().eq('farm_id', farmId).eq('user_id', userId)
  if (error) throw error
}
export async function fetchFarm(farmId) {
  const { data, error } = await sb.from('farms').select('id, name, data, updated_at, ai_enabled').eq('id', farmId).single()
  if (error) throw error
  return data
}
// Сохранение с проверкой версии: если кто-то записал раньше нас — вернём conflict, приложение сольёт изменения.
export async function pushFarm(farmId, data, baseUpdatedAt, report, reportEmail) {
  let q = sb.from('farms').update({ data, report, report_email: reportEmail || null }).eq('id', farmId)
  if (baseUpdatedAt) q = q.eq('updated_at', baseUpdatedAt)
  const { data: rows, error } = await q.select('updated_at')
  if (error) throw error
  if (!rows || !rows.length) return { conflict: true }
  return { updated_at: rows[0].updated_at }
}
export function subscribeFarm(farmId, fn) {
  const ch = sb.channel('farm-' + farmId)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'farms', filter: 'id=eq.' + farmId }, (p) => fn(p.new))
    .subscribe()
  return () => sb.removeChannel(ch)
}

// ---------- помощник Claude ----------
// Фото уменьшаем до ~1,2 Мп и перекодируем в JPEG прямо в телефоне: меньше трафика,
// и вместе с перекодированием пропадают данные о месте съёмки.
async function toJpeg(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null)
  let w, h, draw
  if (bmp) { w = bmp.width; h = bmp.height; draw = (ctx, W, H) => ctx.drawImage(bmp, 0, 0, W, H) }
  else {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file) })
    w = img.naturalWidth; h = img.naturalHeight; draw = (ctx, W, H) => ctx.drawImage(img, 0, 0, W, H)
  }
  const k = Math.min(1, Math.sqrt(1_200_000 / (w * h)))
  const W = Math.max(1, Math.round(w * k)), H = Math.max(1, Math.round(h * k))
  const c = document.createElement('canvas'); c.width = W; c.height = H
  draw(c.getContext('2d'), W, H)
  const url = c.toDataURL('image/jpeg', 0.85)
  return { media_type: 'image/jpeg', data: url.slice(url.indexOf(',') + 1) }
}

async function ask(body, signal) {
  if (!navigator.onLine) throw { code: 'offline', message: 'offline' }
  const s = await getSession()
  if (!s) throw { code: 'session_expired' }
  let r
  try {
    r = await fetch(`${URL_}/functions/v1/ask-farm`, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.access_token}`, apikey: ANON },
      body: JSON.stringify(body),
    })
  } catch (e) {
    if (e?.name === 'AbortError') throw { code: 'cancelled' }
    throw { code: 'upstream_error', message: String(e) }
  }
  const out = await r.json().catch(() => ({}))
  if (!r.ok) throw { code: out.code || 'upstream_error', message: out.error || r.statusText, serverText: out.error }
  return out
}

// Тот же интерфейс, что был у встроенного Claude в первой версии: sample(input, opts), sample.json(...), sample.limits().
export function makeSample() {
  const prep = async (opts) => (opts && opts.images ? await Promise.all([...opts.images].slice(0, 4).map(toJpeg)) : [])
  const sample = async (input, opts = {}) => {
    let body
    if (Array.isArray(input)) {
      const [first, ...rest] = input
      body = { mode: 'chat', system: first.content, messages: rest }
    } else body = { mode: 'text', prompt: input, images: await prep(opts) }
    const out = await ask(body, opts.signal)
    opts.onText && opts.onText({ text: out.text, delta: out.text })
    return { text: out.text, truncated: !!out.truncated }
  }
  sample.json = async (input, opts = {}) => {
    const out = await ask({ mode: 'json', prompt: input, images: await prep(opts) }, opts.signal)
    try { return JSON.parse(out.text) } catch { throw { code: 'invalid_json', text: out.text } }
  }
  sample.limits = async () => ({ images: { maxCount: 4 } })
  return sample
}
