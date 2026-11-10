// Кнопка «Установить на телефон».
// • Chrome на Android: системное окно установки (beforeinstallprompt).
// • Открыто внутри Instagram / Facebook / других приложений — там установить нельзя: кнопка «Открыть в Chrome».
// • iPhone (Safari): подсказка «Поделиться → На экран „Домой“».
// Уже установлено (открыто как приложение) — плашки нет. «Скрыть» запоминается на 14 дней.
const KEY = 'miglani-install-hidden'
const ua = navigator.userAgent || ''
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
const inApp = /Instagram|FBAN|FBAV|FB_IAB|Messenger|Line\/|WhatsApp|TikTok|Snapchat|; wv\)/i.test(ua)
const android = /Android/i.test(ua)
const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

let deferred = null
let bar = null

function hidden() {
  try { return Date.now() < +(localStorage.getItem(KEY) || 0) } catch { return false }
}
function hide() {
  try { localStorage.setItem(KEY, String(Date.now() + 14 * 864e5)) } catch { /* без памяти — просто прячем */ }
  bar?.remove(); bar = null
}

function chromeIntent() {
  const u = new URL(location.href)
  return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;end`
}

function show(html) {
  if (standalone() || hidden()) return
  bar?.remove()
  bar = document.createElement('div')
  bar.className = 'install-bar'
  bar.setAttribute('role', 'region')
  bar.setAttribute('aria-label', 'Установить приложение')
  bar.innerHTML = `<div class="install-in">${html}<button class="ghost install-x" data-inst="hide" aria-label="Скрыть">✕</button></div>`
  document.body.appendChild(bar)
}

function render() {
  if (standalone()) { bar?.remove(); return }
  if (deferred) {
    show(`<span>📲 Поставьте MIGLANI на телефон — откроется как приложение, работает и без интернета.</span>
      <button class="primary" data-inst="go">Установить</button>`)
  } else if (inApp && android) {
    show(`<span>Здесь (внутри Instagram и других приложений) установить нельзя. Откройте в Chrome — там будет кнопка «Установить».</span>
      <a class="btn primary" href="${chromeIntent()}" data-inst="chrome">Открыть в Chrome</a>`)
  } else if (inApp) {
    show(`<span>Чтобы установить, откройте страницу в браузере: «⋯» сверху → «Открыть в браузере».</span>`)
  } else if (ios) {
    show(`<span>Установить на iPhone: внизу «Поделиться» <b>⎋</b> → «На экран „Домой“».</span>`)
  } else if (android) {
    // Chrome ещё не предложил установку (или уже установлено) — подсказка через меню
    setTimeout(() => {
      if (!deferred && !standalone()) show(`<span>Установить: меню <b>⋮</b> справа сверху → «Добавить на главный экран» или «Установить приложение».</span>`)
    }, 4000)
  }
}

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; render() })
window.addEventListener('appinstalled', () => { deferred = null; bar?.remove(); bar = null })
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-inst]')
  if (!b) return
  if (b.dataset.inst === 'hide') { hide(); return }
  if (b.dataset.inst === 'go' && deferred) {
    deferred.prompt()
    const r = await deferred.userChoice.catch(() => null)
    deferred = null
    if (r && r.outcome === 'accepted') { bar?.remove(); bar = null } else render()
  }
})

/** Показать плашку снова (кнопка «Установить приложение» в настройках). */
export function showInstall() {
  try { localStorage.removeItem(KEY) } catch { /* ничего */ }
  if (deferred) { deferred.prompt(); return }
  render()
}

render()
