# Audit tuzatishlari (2026-10-04)

Holat: `npm run lint`, `npm run typecheck`, `npm run build` — hammasi o'tadi (oldin uchalasi ham yiqilardi).

## Runtime bug'lar
- `src/lib/growth/actions.ts` — `owned` aniqlanmagan edi: tavsiyalar generatsiyasi `ReferenceError` bilan yiqilardi.
- `src/lib/beta/actions.ts` — `trackProductEvent` / `PRODUCT_EVENTS` import qilinmagan edi: feedback yuborish yiqilardi.
- `src/lib/projects/actions.ts` — `createProjectAction` ichida `userId` yo'q edi: loyiha yaratish yiqilardi.
- `src/lib/env.ts` — `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `INTEGRATION_ENCRYPTION_KEY` sxemada yo'q edi. Zod noma'lum kalitlarni o'chirgani uchun Google integratsiyasi doim "sozlanmagan" deb turardi. Endi qo'shildi; kalit 64 hex belgi ekanligi tekshiriladi.
- `src/app/(app)/overview/page.tsx` — "Proof of value" ma'lumoti hisoblanardi, lekin sahifada ko'rsatilmasdi. Endi ko'rsatiladi.
- `src/components/ui/source-badge.tsx` — `EXTERNAL` (Google'dan import) manbasi qo'llab-quvvatlanmasdi; endi "Imported" badge chiqadi.
- `src/components/beta/ai-evaluation.tsx` — `ListChecks` ikonkasi import qilinmagan edi.
- `prisma/sql/schema.postgresql.sql` — eskirgan edi: loyihaga bog'liq ~15 jadvalda `projectId NOT NULL` bo'lsa ham `ON DELETE SET NULL` turardi (loyihani o'chirish xato berardi), `webhook_events_occurredAt_idx` yo'q edi. `npm run db:sql` bilan `schema.prisma`dan qayta generatsiya qilindi.

## Xavfsizlik
- `next` 16.3.0 → 16.3.8 (kritik RCE advisory'lar), `eslint-config-next` mos ravishda; `sharp` `npm audit fix` bilan yangilandi.
- Paddle webhook: faqat `PADDLE_PRICE_ID` narxidagi obuna pullik limitni ochadi. Oldin shu sotuvchining istalgan boshqa (arzonroq) mahsuloti ham ochardi. Bekor qilish/pauza kabi holatlar baribir qo'llanadi.
- Paddle webhook: body endi limit bilan oqim tarzida o'qiladi. `Content-Length` bo'lmagan (chunked) katta so'rov xotirani to'ldira olmaydi.
- Google OAuth: `state` endi oqimni boshlagan `userId` ni ham saqlaydi; callback boshqa akkauntda tugatilsa rad etiladi.

## Sifat
- ESLint xatolari: `app-shell.tsx` (effect o'rniga render paytida state moslash), `cookie-consent.tsx` (`useSyncExternalStore`).
- Tip xatolari: `signals.ts`, `proof-of-value.ts`, Google `Json` maydonlari.
- `.env.example`: ikki marta yozilgan `NEXT_PUBLIC_APP_URL` olib tashlandi; `AI_MODEL` izohga o'tkazildi (oldin u gemini/groq/openrouter ishlatganda ham anthropic modelini majburlardi).

## Ikkinchi bosqich

### Ma'lumotlar bazasi
- `prisma migrate deploy` bo'sh bazada yiqilardi: `prisma/migrations` da boshlang'ich migratsiya yo'q edi, birinchi migratsiya mavjud bo'lmagan `subscriptions` jadvalini o'zgartirmoqchi bo'lardi. `20261001000000_baseline` va `migration_lock.toml` qo'shildi. Tekshirildi: bo'sh bazada deploy o'tadi va sxemaga to'liq mos (`prisma migrate diff` — farq yo'q). Avval `npm run setup` bilan yaratilgan baza uchun README'da `migrate resolve` buyrug'i yozildi.
- `npm run setup` bo'sh bazada yiqilardi (`relation "projects" does not exist`): `scripts/generate-sql.mjs` jadvallarni `schema.prisma` tartibida chiqarardi, `product_events` esa `projects` dan oldin turardi. Generator endi jadvallarni bog'liqlik tartibida chiqaradi; setup ikki marta ishga tushirilganda ham o'tadi.
- `npm run db:drift` `.env` ni o'qimasdi, boshqa skriptlar kabi endi o'qiydi.

### Xavfsizlik
- CSP: `script-src` dan `'unsafe-inline'` olib tashlandi. `src/proxy.ts` har bir so'rov uchun nonce yaratadi, `'strict-dynamic'` bilan. Barcha HTML sahifalar allaqachon dinamik render qilinardi, shuning uchun hech narsa yo'qotilmadi. Siyosat bitta joyda: `src/config/csp.ts`. Chromium'da tekshirildi: sahifalar hydrate bo'ladi, CSP buzilishlari yo'q.
- `npm overrides`: `deepmerge-ts` ^8.0.2 va `mysql2` ^3.24.5 (prisma CLI orqali kelardi). `npm audit --omit=dev`: 0 ta zaiflik. `prisma validate/generate/migrate` ishlashi tekshirildi.

### Test skriptlari
- `e2e-billing.sh`:
  - SQL ichida qo'shtirnoqlar qochirilmagan edi (`column "workspaceid" does not exist`).
  - Hodisa hisoblagichi `$(...)` subshell ichida oshirilardi va saqlanmasdi, shuning uchun hamma hodisa bir xil `occurred_at` bilan ketardi va ilova ularni (to'g'ri ravishda) eskirgan deb rad etardi. Hisoblagich faylga ko'chirildi; 9-bo'limdagi yangilanishdan keyingi hodisalar keyingi davrga o'tkazildi.
  - 7–8-bo'limlarda `\"$WS\"` noto'g'ri JSON hosil qilardi (400) va ikkinchi obuna id'si ishlatilardi, ilova esa bitta workspace'ga ikkinchi faol obunani ataylab rad etadi.
  - 9-bo'lim `timestamp::text` formatini noto'g'ri kutardi.
- `e2e-ai-learning.sh`: HTML'da `&` belgisi `&amp;` bo'lib chiqadi. Bundan tashqari `/admin` ni suite akkaunti bilan ochardi, `e2e-beta.sh` esa aynan shu akkaunt founder emasligini tekshiradi. Endi `FOUNDER_EMAILS` dagi birinchi manzil bilan kiradi.

### Tekshiruv natijalari
- Toza PostgreSQL 16 bazada barcha 26 ta e2e to'plami (`scripts/e2e-*.sh`) — 0 ta xato. Test muhiti: `AUTH_PROVIDER=local`, `AI_PROVIDER=mock`, `FOUNDER_EMAILS="founder@lumen.test"`, `PADDLE_NOTIFICATION_SECRET` o'rnatilgan, checkout (narx + client token) o'rnatilmagan.
- Narx tekshiruvi qo'lda sinaldi (`PADDLE_PRICE_ID` va client token bilan): boshqa narx — `IGNORED`, obuna yaratilmaydi; to'g'ri narx — `PROCESSED`.
- 2 MB chunked body webhook'ga — 413.
- Chromium (Playwright): ochiq va tizimga kirgan sahifalar, mobil menyu, cookie banner — konsol xatolari va CSP buzilishlari yo'q.

## Uchinchi bosqich

### CSP: uslublar
- `style-src 'unsafe-inline'` olib tashlandi. Endi uslublar ikkiga bo'lingan:
  - `style-src-elem` (`<style>`, stylesheet'lar) — faqat nonce, `'self'` va kutubxona o'zi qo'shadigan CSS'ning hash'i. Begona `<style>` bloki (CSS selektorlari orqali ma'lumot o'g'irlash yo'li) rad etiladi.
  - `style-src-attr 'unsafe-inline'` — faqat `style="..."` atributlari. React `style` prop'ini serverda atribut sifatida chiqaradi, Radix menyularni shu yo'l bilan joylashtiradi. Atributda selektor bo'lmaydi, u sahifadan hech narsa o'qiy olmaydi.
- `sonner` (toast) o'z CSS'ini `<style>` orqali qo'shadi; uning hash'i `scripts/csp-hashes.mjs` tomonidan har `npm run build` da `node_modules` dan qayta hisoblanadi (`src/config/csp-hashes.json`), shuning uchun kutubxona yangilansa hash eskirib qolmaydi.
- Radix dialog/menyu skrollni bloklash uchun qo'shadigan `<style>` ga endi nonce beriladi (`get-nonce`, `src/instrumentation-client.ts`).
- Zod brauzerda `Function("")` bilan `eval` borligini tekshirardi va har sahifada `script-src` buzilishi chiqardi; brauzerda JIT o'chirildi (`jitless`), server o'zgarmadi.
- Chromium'da 20 ta sahifa, Radix menyulari tekshirildi: 0 ta CSP buzilishi, 0 ta konsol xatosi; toast CSS'i va shriftlar qo'llanadi.

### `braces` zaifligi
- `eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch` → `braces` (GHSA-vfj7-8cjw-p6xm). Tuzatilgan versiya mavjud emas — zaif diapazon `<=3.0.3`, eng oxirgi chiqarilgan versiya esa 3.0.3. Ishonchsiz fork bilan almashtirmadim.
- Xavf yo'q: bu faqat lint vaqtida ishlaydigan dev paket, production'ga kirmaydi. U faqat sizning ESLint sozlamangizdagi `rootDir` glob'ini o'qiydi, foydalanuvchi kiritgan ma'lumotni emas.
- CI'ga `npm audit --omit=dev --audit-level=high` qadami qo'shildi: production dependency'larida yangi zaiflik paydo bo'lsa, build to'xtaydi. `braces` uchun tuzatish chiqqach, `npm update` yetarli bo'ladi.

## Google integratsiyasi olib tashlandi (2026-10-05)

Founder qarori: GA4 va Search Console `CLAUDE.md` dagi MVP doirasiga kirmaydi.
- O'chirildi: `src/lib/integrations/google/`, `/api/integrations/google/*`, `google-connection-card.tsx`, `/analytics` dagi karta va banner, `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `INTEGRATION_ENCRYPTION_KEY`, `GOOGLE_CONNECTED` va `ANALYTICS_SYNCED` hodisa nomlari, `GoogleConnection` modeli, README bo'limi.
- Yangi migratsiya `20261005_remove_google_integration`: `google_connections` jadvali va enum o'chadi (saqlangan OAuth tokenlari ham). Avval qo'llangan migratsiyalarga tegilmadi. Tekshirildi: toza bazada va eski jadvali bor bazada ishlaydi, keyin `migrate diff` — farq yo'q.
- Ataylab qoldirildi: `RecordSource.EXTERNAL`, `marketing_metrics.externalKey`, eski `product_events` qatorlari (jumladan `analytics.google_connected`).
- Yuqoridagi "Runtime bug'lar" va "Xavfsizlik" bo'limlaridagi Google bilan bog'liq tuzatishlar (env sxemasi, OAuth `state` ga `userId`, Json maydonlari) endi kerak emas: ularning kodi yo'q.
- `GLOBAL_LAUNCH.md` dagi "Gate 3 — data connectivity" ro'yxati MVPdan keyingi yo'l xaritasi bo'lib qoldi, o'zgartirilmadi.

## Row level security (2026-10-06)

Supabase `public` sxemasini REST API orqali ochadi va uni brauzerdagi ochiq `anon` kalit bilan chaqirish mumkin; RLS bo'lmasa, begona odam har qanday jadvalni o'qiy/yoza oladi. Loyihada RLS umuman yo'q edi.
- Yangi migratsiya `20261006_enable_row_level_security`: `public` dagi barcha jadvallarda RLS yoqiladi (`_prisma_migrations` ham). Siyosat (policy) yo'q, ya'ni REST API hech narsa ko'rmaydi.
- `scripts/generate-sql.mjs` har bir jadvaldan keyin `ENABLE ROW LEVEL SECURITY` chiqaradi (`npm run setup` yo'li).
- `npm run db:drift` endi RLS'siz jadvalni xato deb qaytaradi (`NO RLS`).
- `db:drift` skriptidagi eski kamchilik tuzatildi: `String[]` ustunlari `prisma migrate` yo'lida nullable, `setup` yo'lida NOT NULL bo'ladi; ikkalasi ham to'g'ri, ular endi taqqoslanmaydi.
- Tekshirildi (superuser bo'lmagan baza egasi + `anon` roli bilan): `migrate deploy` (bo'sh baza), `npm run setup`, va RLS'siz eski bazani yangilash: uchalasida `anon` 0 qator ko'radi, drift toza. Barcha 26 e2e to'plami shu egasi bilan o'tdi.
- Tekshirilmagan: haqiqiy Supabase loyihasi. U yerda `DATABASE_URL` `postgres` roli bilan bo'lishi kerak (Session pooler manzili shunday).
