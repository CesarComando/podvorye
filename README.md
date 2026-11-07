# Рационы подворья

Приложение для подворья: рационы коз, лошадей, кур и коровы, запасы кормов, журнал надоев и яиц,
помощник Claude, распознавание фото весов, кувшина и склада, план развития хозяйства, еженедельный отчёт на почту.

- Сайт и установка на телефон: https://cesarcomando.github.io/podvorye/ (в браузере телефона: меню → «Установить приложение» / «Добавить на главный экран»)
- Работает без интернета: всё сохраняется в телефоне и отправляется в базу, когда появится связь.
- База и вход: Supabase-проект `podvorye` (`zluiwncfigibykwyxhcj`, Стокгольм).

## Как устроено

| Часть | Где |
|---|---|
| Приложение (HTML/JS, PWA) | `index.html`, `src/app.js`, `src/style.css` |
| Связь с базой, вход, синхронизация, вызов помощника | `src/backend.js` |
| Таблицы и права доступа (RLS) | `supabase/migrations/001_init.sql` |
| Расписание отчёта (понедельник 05:00 UTC) | `supabase/migrations/002_weekly_cron.sql` |
| Помощник Claude (ключ только на сервере) | `supabase/functions/ask-farm` |
| Еженедельный отчёт (Resend) | `supabase/functions/weekly-report` |

## Секреты (Supabase → Edge Functions → Secrets)

| Секрет | Зачем |
|---|---|
| `ANTHROPIC_API_KEY` | ключ Claude из console.anthropic.com |
| `ANTHROPIC_MODEL` | необязательно; по умолчанию `claude-opus-5-5`, дешевле — `claude-sonnet-5-5` или `claude-haiku-5-5` |
| `AI_DAILY_LIMIT` | необязательно; запросов к помощнику в день на человека, по умолчанию 40 |
| `CRON_SECRET` | уже задан; тот же лежит в Vault как `cron_secret` |
| `RESEND_API_KEY`, `REPORT_FROM` | для писем: ключ resend.com и отправитель с подтверждённым в Resend доменом |

Помощник работает только в хозяйствах, где в таблице `farms` включено `ai_enabled` (включается вручную, чтобы ключом не пользовались посторонние).

## Команды

```
npm install
npm run dev       # локально
npm run deploy    # собрать и выложить на GitHub Pages
npx supabase functions deploy ask-farm weekly-report --project-ref zluiwncfigibykwyxhcj --use-api
```
