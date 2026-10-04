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

## Qolgan (tuzatib bo'lmadi)
- `prisma` CLI → `@prisma/config` → `deepmerge-ts`, `mysql2` (yuqori). Hozir 7.x da tuzatish yo'q (`npm audit fix --force` prisma 6 ga tushiradi). Bu faqat CLI/build vaqtida ishlaydi, runtime'ga ta'sir qilmaydi. Prisma yangi versiyasini kuzating.
- CSP `script-src 'unsafe-inline'` — nonce'ga o'tish arxitektura o'zgarishi talab qiladi.
- DB'ga ulangan e2e testlar (`scripts/e2e-*.sh`) bu muhitda ishga tushirilmadi (PostgreSQL yo'q).
