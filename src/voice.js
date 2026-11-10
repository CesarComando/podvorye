// Голосовой ввод: кнопка 🎤 рядом с полем. Говорите — текст появляется в поле. Ещё раз нажать — стоп.
// Работает в Chrome на Android и в Safari на iPhone (распознавание речи браузера, нужен интернет).
// Язык — русский; если в настройках телефона латышский, распознаём по-латышски.
const SR = window.SpeechRecognition || window.webkitSpeechRecognition
export const voiceSupported = !!SR

let rec = null
let activeBtn = null

/** Кнопка микрофона для поля с id. Если браузер не умеет — пусто. */
export function micBtn(forId, label = 'Сказать голосом') {
  if (!SR) return ''
  return `<button type="button" class="mic" data-mic="${forId}" aria-label="${label}" title="${label}">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>`
}

function stop() {
  try { rec && rec.stop() } catch { /* уже остановлен */ }
}

function start(btn) {
  const el = document.getElementById(btn.dataset.mic)
  if (!el) return
  if (rec) { stop(); return }
  rec = new SR()
  rec.lang = /^lv/i.test(navigator.language || '') ? 'lv-LV' : 'ru-RU'
  rec.interimResults = true
  rec.continuous = false
  const base = el.value ? el.value.replace(/\s*$/, ' ') : ''
  activeBtn = btn
  btn.classList.add('on')
  rec.onresult = (e) => {
    let text = ''
    for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript
    text = text.trim()
    if (text && !base) text = text[0].toUpperCase() + text.slice(1)
    el.value = base + text
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      alertBox(el, 'Разрешите микрофон: значок замка слева от адреса → «Микрофон» → «Разрешить».')
    } else if (e.error === 'network') {
      alertBox(el, 'Для голосового ввода нужен интернет.')
    }
  }
  rec.onend = () => {
    activeBtn?.classList.remove('on')
    activeBtn = null
    rec = null
    el.focus()
  }
  try { rec.start() } catch { rec = null; btn.classList.remove('on') }
}

function alertBox(el, text) {
  const n = document.createElement('div')
  n.className = 'notice mic-note'
  n.textContent = text
  el.closest('.chat-in, label, .card, .sheet')?.after(n)
  setTimeout(() => n.remove(), 6000)
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-mic]')
  if (!b) return
  e.preventDefault()
  e.stopPropagation()
  start(b)
}, true)

// Экран перерисовался (render) — запись не висит на исчезнувшей кнопке
export function voiceStop() { stop() }
