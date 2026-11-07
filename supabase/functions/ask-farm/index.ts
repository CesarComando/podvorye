// POST { mode: 'chat'|'text'|'json', system?, messages?, prompt?, images?: [{ media_type, data }] } → { text }
// Помощник «Рационов подворья»: чат, распознавание фото весов и кувшина, советы по складу, план развития.
// Ключ Claude хранится только здесь, в секретах Supabase, — в приложение и в git он не попадает.
//
// Секреты (Supabase → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY  — ключ из console.anthropic.com
//   ANTHROPIC_MODEL    — необязательно; по умолчанию claude-opus-5-5 (для экономии можно claude-sonnet-5-5 или claude-haiku-5-5)
//   AI_DAILY_LIMIT     — необязательно; запросов в день на человека, по умолчанию 40
import Anthropic from 'npm:@anthropic-ai/sdk'
import { admin, cors, getUser, json } from '../_shared/common.ts'

const MODEL = Deno.env.get('ANTHROPIC_MODEL')?.trim() || 'claude-opus-5-5'
const LIMIT = Number(Deno.env.get('AI_DAILY_LIMIT') ?? 40) || 40
const IMG_TYPES = ['image/jpeg', 'image/png', 'image/webp']

// Неизменные правила сервера: помощник отвечает только про подворье.
const RULES = `Ты работаешь внутри приложения «Рационы подворья» для небольшого хозяйства в Латвии (козы, лошади, куры, в планах корова). Помогаешь хозяйке с кормлением, уходом за животными, хранением кормов, учётом и развитием хозяйства. На вопросы, не связанные с хозяйством, мягко отвечай, что ты помощник по подворью, и предлагай вернуться к делам хозяйства.`

const effortFor = (mode: string) => (mode === 'chat' ? 'low' : 'medium') as 'low' | 'medium'

async function callClaude(client: Anthropic, params: Record<string, unknown>) {
  // Server-side fallback: если модель откажет по правилам безопасности, ответит запасная модель.
  try {
    return await client.beta.messages.create({
      ...params,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    } as never)
  } catch (e) {
    if (e instanceof Anthropic.BadRequestError) {
      // Если параметр не поддержан в этой версии API — повторяем без него.
      return await client.messages.create(params as never)
    }
    throw e
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405)

  try {
    const user = await getUser(req)
    if (!user) return json(req, { error: 'Войдите в аккаунт', code: 'session_expired' }, 401)

    // Помощник включён только для своих хозяйств (farms.ai_enabled), чтобы ключом не пользовались чужие.
    const { data: farms } = await admin.from('farm_members')
      .select('farm:farms(ai_enabled)').eq('user_id', user.id)
    const allowed = (farms ?? []).some((r: any) => r.farm?.ai_enabled)
    if (!allowed) return json(req, { error: 'Помощник для этого хозяйства не включён', code: 'not_granted' }, 403)

    const key = Deno.env.get('ANTHROPIC_API_KEY')?.trim()
    if (!key) return json(req, { error: 'Помощник ещё не настроен', code: 'sampling_disabled' }, 503)

    const body = await req.json().catch(() => ({}))
    const mode = ['chat', 'text', 'json'].includes(body.mode) ? body.mode : 'text'
    const system = `${RULES}\n\n${String(body.system ?? '').slice(0, 20000)}`.trim()

    const images = (Array.isArray(body.images) ? body.images : [])
      .filter((i: any) => IMG_TYPES.includes(i?.media_type) && typeof i?.data === 'string' && i.data.length < 3_000_000)
      .slice(0, 4)
      .map((i: any) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: i.media_type, data: i.data } }))

    let messages: Anthropic.MessageParam[]
    if (mode === 'chat') {
      messages = (Array.isArray(body.messages) ? body.messages : [])
        .filter((m: any) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
        .slice(-14)
        .map((m: any) => ({ role: m.role, content: m.content.slice(0, 4000) }))
      while (messages[0]?.role === 'assistant') messages.shift()
      if (!messages.length || messages[messages.length - 1].role !== 'user')
        return json(req, { error: 'Пустой вопрос', code: 'invalid_request' }, 400)
    } else {
      const prompt = String(body.prompt ?? '').slice(0, 40000).trim()
      if (!prompt) return json(req, { error: 'Пустой запрос', code: 'invalid_request' }, 400)
      const tail = mode === 'json' ? '\n\nОтветь только одним JSON-объектом, без пояснений до и после.' : ''
      messages = [{ role: 'user', content: [...images, { type: 'text', text: prompt + tail }] }]
    }

    const { data: used, error: bumpErr } = await admin.rpc('ai_bump', { p_user: user.id })
    if (bumpErr) throw bumpErr
    if ((used as number) > LIMIT)
      return json(req, { error: `На сегодня лимит ${LIMIT} запросов исчерпан. Завтра можно снова.`, code: 'rate_limited' }, 429)

    const client = new Anthropic({ apiKey: key })
    const out: any = await callClaude(client, {
      model: MODEL,
      max_tokens: mode === 'chat' ? 4000 : 8000,
      system,
      messages,
      output_config: { effort: effortFor(mode) },
    })

    if (out.stop_reason === 'refusal')
      return json(req, { error: 'Claude не смог ответить на этот запрос — попробуйте сформулировать иначе.', code: 'refused' }, 422)

    let text = (out.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n').trim()
    if (mode === 'json') {
      const a = text.indexOf('{'), b = text.lastIndexOf('}')
      text = a >= 0 && b > a ? text.slice(a, b + 1) : '{}'
    }
    if (!text) return json(req, { error: 'Пустой ответ — попробуйте ещё раз.', code: 'empty_completion' }, 502)
    return json(req, { text, truncated: out.stop_reason === 'max_tokens' })
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      console.error('ask-farm rate limit', e.status)
      return json(req, { error: 'Claude сейчас перегружен — попробуйте через минуту.', code: 'rate_limited' }, 429)
    }
    if (e instanceof Anthropic.AuthenticationError) {
      console.error('ask-farm auth: ключ ANTHROPIC_API_KEY неверный или истёк')
      return json(req, { error: 'Ключ помощника не работает — сообщите владельцу хозяйства.', code: 'sampling_disabled' }, 503)
    }
    if (e instanceof Anthropic.APIError) {
      console.error('ask-farm anthropic', e.status, e.message)
      return json(req, { error: 'Помощник сейчас недоступен, попробуйте позже.', code: 'upstream_error' }, 502)
    }
    console.error('ask-farm', e)
    return json(req, { error: 'Ошибка помощника, попробуйте позже.', code: 'upstream_error' }, 500)
  }
})
