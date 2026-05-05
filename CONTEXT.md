# Контекст проекта (для ИИ / нового чата)

**Путь к репо:** `/Users/ab/Web`  
**Имя пакета:** `dp-coatings-crm` (Node, `type: "module"`).

## Стек

- **Бэкенд:** `server.js` — Express, JWT, bcrypt, helmet, rate-limit, CORS.
- **CRM:** один JSON-снимок (`users` / `leads` / `meta`); либо файл `crm-db.json`, либо PostgreSQL (таблица `crm_state`, см. `lib/crm-backend.js`, импорт `scripts/import-crm-json-to-pg.mjs`).
- **Фронт:** статические страницы (`index.html`, `admin-panel.html`, `crm.html`, каталог, личный кабинет и т.д.), JS-модули рядом с HTML, SCSS → CSS (`build:css` / `watch:css`).
- **Контент/каталог:** `site-content.json`, `products-catalog.json`, загрузки в `uploads/`.
- **Деплой/прод:** см. `PRODUCTION.md`; переменные — `.env.example`.

## Команды

- `npm start` — `node server.js`
- `npm run docker:up` / `docker:down` — локальный Postgres
- `npm run crm:import-json` — перенос `crm-db.json` в БД
- `npm run build:css` / `watch:css` — Sass

## Куда смотреть при задачах

- API и бизнес-логика: `server.js`, `lib/crm-backend.js`
- Админка / CRM UI: `admin-panel.js`, `admin-panel.html`, `crm.html`
- Стили: `scss/`, собранные `styles.css` / `crm.css` (и др. по скриптам)

## Платежі (UA)

- **LiqPay:** у `.env` — `LIQPAY_PUBLIC_KEY`, `LIQPAY_PRIVATE_KEY`, опційно `LIQPAY_SANDBOX=1`, `PUBLIC_BASE_URL` для callback.
- **Сторінка кабінету:** `account-payment.html` — оферта з `site-content.json` → `accountPayment`, IBAN, кнопка перходу на LiqPay (потрібен вхід і телефон у профілі).
- API: `GET /api/payment/config`, `POST /api/payments/liqpay/invoice` (Bearer), `POST /api/payments/liqpay/callback` (LiqPay server-to-server).

## Заявки з сайту

- У корзині та на `contact` / `payment` додані **доставка** і **спосіб оплати** (поля `deliveryMethod`, `paymentMethod` у лідах).
- CRM: фільтри по доставці/оплаті, сортування, зведення по воронці в `GET /api/leads` → `summary`.

## Следующий шаг (обновляйте после работы)

_Здесь кратко: текущая цель, открытые баги, «не трогать»._

---

*Этот файл — якорь контекста для новых сессий чата: прикрепите `@CONTEXT.md` или попросите «продолжи по CONTEXT.md».*
