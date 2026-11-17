// Подсказка-инструкция. При каждом открытии приложения спрашивает «Напомнить, как пользоваться?»,
// пока человек не ответит «Да, разобралась». Потом сама больше не появляется,
// но её всегда можно открыть кнопкой «?» вверху.
import { markTourDone } from './backend.js'

// Номер версии подсказки: при новых разделах увеличиваем — подсказка спросит ещё раз.
const TOUR_V = 2
const LS_DONE = 'miglani-tour-done-v' + TOUR_V
let opts = null, shownThisOpen = false, step = 0, steps = [], timer = null
let root = null

const isDone = () => {
  try { if (localStorage.getItem(LS_DONE) === '1') return true } catch {}
  const s = opts && opts.getSession && opts.getSession()
  const m = s && s.user && s.user.user_metadata
  return !!(m && (m.tour_v || 0) >= TOUR_V)
}
const setDone = () => {
  try { localStorage.setItem(LS_DONE, '1') } catch {}
  markTourDone(TOUR_V)
}

// Шаги. target — что подсветить; before — что открыть перед шагом.
function buildSteps() {
  const hasHelp = !!document.querySelector('[data-act="chat-open"]')
  const list = [
    { target: 'nav.tabs [data-tab="tasks"]', before: 'tasks', title: 'Раздел «Дела»',
      text: 'Твой ежедневник: что сделать сегодня, завтра, на неделе. Напоминания и заметка дня.' },
    { target: 'nav.tabs [data-tab="home"]', before: 'tasks', title: 'Раздел «Дом»',
      text: 'Счета и напоминания об оплате, учёт денег, машина (заправки, техосмотр), списки покупок, корзина, магазины с ценами и акциями, дрова.' },
    { target: 'nav.tabs [data-tab="farm"]', before: 'tasks', title: 'Раздел «Хозяйство»',
      text: 'Животные, рацион, запасы кормов, журнал надоев и яиц, советы.' },
    { target: '[data-act="home-view"][data-v="basket"]', before: 'home:basket', title: 'Новое: «Корзина»',
      text: 'Что мы покупаем регулярно, сколько в месяц и на какую сумму, где это дешевле и куда уходят деньги. Считается по чекам из магазина. Кнопка «+» добавляет товар в список «Домой».' },
    { target: '[data-act="home-view"][data-v="stores"]', before: 'home:stores', title: 'Новое: акции магазинов',
      text: 'В «Магазинах» у Maxima, Rimi, Lidl, Mego, top! и ABrands есть кнопка «🏷️ Буклет акций» — открывает свежие акции недели.' },
    { target: '#qa', before: 'tasks', title: 'Здесь пиши новое дело',
      text: 'Пиши обычными словами, например: «купить комбикорм завтра 10:00» — дата и время поставятся сами. Потом нажми зелёный «+».' },
    { target: '#day-note', before: 'tasks', title: 'Заметка дня',
      text: 'Сюда — всё, что важно помнить в этот день.' },
  ]
  if (document.querySelector('.fab.alt')) list.push(
    { target: '.fab.alt', before: 'tasks', title: 'Новое: чеки из магазина',
      text: 'Камера → «Чек магазина». Выбери PDF-чеки из приложения Mans Rimi или сфотографируй бумажный чек — сумма запишется в «Учёт», цены в «Магазины», товары в «Корзину». Перед записью всё можно проверить.' })
  if (hasHelp) {
    list.push(
      { target: '[data-act="chat-open"]', before: 'tasks', title: 'Если что-то неясно — жми сюда',
        text: 'Это помощник. Спроси обычными словами, например: «как записать надой?» — он подскажет.' },
      { target: '[data-act="chat-open"]', before: 'tasks', title: 'Хочешь что-то добавить — тоже сюда',
        text: 'Открой помощника и нажми «💡 Предложить улучшение приложения». Напиши, чего не хватает, — Дайнис увидит.' },
    )
  }
  list.push({ target: '#tour-btn', title: 'Эту подсказку можно открыть снова',
    text: hasHelp ? 'Кнопка «?» вверху — в любой момент.' : 'Кнопка «?» вверху — в любой момент. Если что-то неясно или хочется что-то добавить — скажи Дайнису.' })
  return list
}

function el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild }

function close() {
  clearInterval(timer); timer = null
  if (root) { root.remove(); root = null }
  document.body.classList.remove('touring')
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', place)
}
function onKey(e) { if (e.key === 'Escape') close() }

function frame(inner, withSpot) {
  close()
  root = el(`<div class="tour" role="dialog" aria-modal="true" aria-label="Как пользоваться приложением">
    <div class="tour-shade${withSpot ? ' clear' : ''}"></div>${withSpot ? '<div class="tour-spot"></div>' : ''}
    <div class="tour-card">${inner}</div></div>`)
  document.body.appendChild(root)
  document.body.classList.add('touring') // плашка «Установить» не должна закрывать кнопки
  root.addEventListener('click', onClick)
  document.addEventListener('keydown', onKey)
  window.addEventListener('resize', place)
  const b = root.querySelector('.tour-card button.primary'); if (b) b.focus({ preventScroll: true })
}

// Первый вопрос
function ask() {
  frame(`<p class="tour-title">Привет! 👋</p>
    <p>Напомнить, как пользоваться приложением?</p>
    <div class="tour-btns"><button class="primary" data-t="yes">Да, напомни</button><button data-t="no">Нет, не сейчас</button></div>`, false)
}
// Последний вопрос
function finish() {
  frame(`<p class="tour-title">Всё понятно?</p>
    <p>Если ответишь «Ещё нет» — я напомню при следующем входе.</p>
    <div class="tour-btns"><button class="primary" data-t="done">Да, разобралась</button><button data-t="notyet">Ещё нет</button></div>`, false)
}

function showStep(i) {
  step = i
  const s = steps[i]
  if (s.before && opts.show) opts.show(s.before)
  const n = steps.length
  frame(`<button class="tour-x" data-t="x" aria-label="Закрыть">✕</button>
    <p class="tour-step">Шаг ${i + 1} из ${n}</p>
    <p class="tour-title">${s.title}</p><p>${s.text}</p>
    <div class="tour-btns">${i > 0 ? '<button data-t="back">Назад</button>' : ''}<button class="primary" data-t="next">${i === n - 1 ? 'Готово' : 'Дальше'}</button></div>`, true)
  const t = document.querySelector(s.target)
  if (t) t.scrollIntoView({ block: 'center', behavior: 'instant' })
  place()
  // приложение может перерисовать экран (синхронизация) — держим подсветку на месте
  timer = setInterval(place, 400)
}

function place() {
  if (!root) return
  const card = root.querySelector('.tour-card'), spot = root.querySelector('.tour-spot')
  if (!spot) return
  const s = steps[step], t = s && document.querySelector(s.target)
  const vw = window.innerWidth, vh = window.innerHeight, pad = 6
  if (!t) { spot.style.display = 'none'; card.style.top = ''; card.style.bottom = '16px'; return }
  const r = t.getBoundingClientRect()
  spot.style.display = ''
  Object.assign(spot.style, { left: (r.left - pad) + 'px', top: (r.top - pad) + 'px', width: (r.width + pad * 2) + 'px', height: (r.height + pad * 2) + 'px' })
  const ch = card.offsetHeight, gap = 14
  // карточка — под подсветкой, если влезает, иначе над ней
  let top = r.bottom + pad + gap
  if (top + ch > vh - 8) top = r.top - pad - gap - ch
  top = Math.max(8, Math.min(top, vh - ch - 8))
  card.style.bottom = ''; card.style.top = top + 'px'
}

function onClick(e) {
  const b = e.target.closest('[data-t]'); if (!b) return
  const a = b.dataset.t
  if (a === 'no' || a === 'x' || a === 'notyet') { close(); return }
  if (a === 'yes') { steps = buildSteps(); showStep(0); return }
  if (a === 'back') { showStep(Math.max(0, step - 1)); return }
  if (a === 'next') { if (step < steps.length - 1) showStep(step + 1); else finish(); return }
  if (a === 'done') { setDone(); close(); return }
}

// Вызывается из приложения после входа. Показывает вопрос один раз за открытие, пока не «всё понятно».
export function startTour() {
  if (!opts || shownThisOpen || isDone() || root) return
  if (!opts.ready()) return
  shownThisOpen = true
  setTimeout(() => { if (opts.ready()) ask() }, 500)
}
// Кнопка «?» — открыть подсказку вручную (сразу с первого шага).
export function openTour() {
  if (!opts || !opts.ready()) return
  steps = buildSteps(); showStep(0)
}
export function initTour(o) {
  opts = o
  const b = document.getElementById('tour-btn')
  if (b) b.addEventListener('click', openTour)
}
