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

## Qolgan
- `eslint-config-next` → `fast-glob` → `micromatch` → `braces` (yuqori, faqat dev). Tuzatilgan `braces` versiyasi hali yo'q; lint vaqtidagina ishlaydi.
- `style-src 'unsafe-inline'` ataylab qoldirildi (Radix UI `style` atributini JS orqali yozadi).
