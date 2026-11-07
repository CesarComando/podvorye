// Общие помощники Edge Functions «Рационов подворья» (Deno).
// SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY Supabase подставляет сам.
import { createClient } from 'npm:@supabase/supabase-js@2'

// Клиент с ключом service_role: обходит RLS, поэтому живёт только на сервере.
export const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

// Откуда разрешены запросы: сайт приложения, локальная разработка и Android-приложение (Capacitor).
const ALLOWED_ORIGINS = [
  'https://cesarcomando.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
  'https://localhost',
  'capacitor://localhost',
]

export const cors = (req: Request) => ({
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(req.headers.get('origin') ?? '')
    ? req.headers.get('origin')!
    : ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
})

export const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), 'Content-Type': 'application/json' },
  })

// Пользователь по JWT из заголовка Authorization (проверяем сами, а не шлюзом).
export async function getUser(req: Request) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data, error } = await admin.auth.getUser(token)
  return error ? null : data.user
}
