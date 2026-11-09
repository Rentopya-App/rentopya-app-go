# Boilerplate senkronu

Bu doküman Rentopya'nın hangi boilerplate commit'inden doğduğunu ve sonraki commit'lerin durumunu tutar.
Boilerplate: `furkanmeclis/nextjs-go-boilerplate` (`origin/main`).

## 1. Amaç ve nasıl kullanılır

Rentopya ile boilerplate arasında ortak git geçmişi yok. Değişiklikler elle okunup yeniden uygulanır. Cherry-pick yapılmaz.

Sonraki senkronda:

1. Aşağıdaki "Son taşınan boilerplate SHA" değerinden başla.
2. Ondan sonraki commit'leri listele: `git -C <boilerplate> log --reverse --format='%h %cs %s' <son-sha>..origin/main`.
3. Her commit için `git show --stat <sha>` ile değişikliği oku ve Rentopya'da karşılığını ara.
4. Bir karar ver:
   - **PORT**: Rentopya'ya taşınacak. Bir iş paketine ve Linear issue'suna bağla.
   - **ZATEN VAR**: Rentopya'da aynı ya da daha kapsamlı çözüm var. Kanıtı (dosya:satır) yaz.
   - **ATLA**: Rentopya'ya uymuyor. Gerekçeyi "Kararlar" bölümüne yaz.
5. Envanter tablosuna satırları ekle. Taşıma bitince "Son taşınan boilerplate SHA" değerini güncelle.

Çakışmada Rentopya davranışı kazanır (şube kapsamı, çoklu rol, özel organizasyon rolleri, `site/`, CMS kabuğu yok).

## 2. Taban commit

**`03bf65def2a5`** (`03bf65def2a533eb71dcb7ac89919dfe3f4c626b`, 2026-10-14 17:02 +0300).
Bu bir merge commit'i (`feat/platform-system-settings` → `feat/tenant-core`).

Rentopia deposunun (`furkanmeclis/rentopia-app-go`) kök commit'i `959cb86` ("Initial commit", 2026-10-14 17:32 +0300, 1169 dosya). Bu ağaç `03bf65d` ağacının birebir kopyası. Rentopia 30 dakika sonra bu ağaçtan oluşturulmuş. Sonraki commit'ler (`958b99a` tenant kabuğu, `a7fc4c5`, `e164165` CMS kaldırma, `ba40fc9` SeaweedFS) Rentopia'nın kendi işi.

Yöntem: her aday commit'in tüm ağacı (`git ls-tree -r`) yol ve blob hash bazında `959cb86` ile karşılaştırıldı. "Sahiplenilen" alt küme: `backend/internal/platform/**`, `frontend/src/components/**`, `.agents/skills/**`, `Makefile`, `.github/workflows/ci.yml`.

| Aday | Tarih | Aynı / toplam (tüm ağaç) | Farklı | Rentopia'da eksik | Sahiplenilen dosyalarda aynı |
|---|---|---|---|---|---|
| **`03bf65d`** (merge, tenant core faz 1 + system settings) | 2026-10-14 17:02 | **1169 / 1169** | **0** | **0** | **366 / 366** |
| `7a76aec` (sonraki: Node 22.13) | 2026-11-03 | 1167 / 1169 | 2 | 0 | 366 / 366 |
| `7dfb448` (sonraki: org i18n) | 2026-11-03 | 1162 / 1169 | 7 | 0 | 365 / 366 |
| `52ca5f5` (merge'ün diğer ebeveyni) | 2026-10-14 16:25 | 1112 / 1139 | 27 | 0 | 361 / 363 |
| `0b109cf` (ilk ebeveyn) | 2026-10-14 17:01 | 1001 / 1149 | 130 | 18 | 359 / 366 |

## 3. Son taşınan boilerplate SHA

**`a3b49617d83d`** (`a3b49617d83d252f71c44620835f9c4bdc5a3acd`, 2026-11-04 18:07 +0300).

Bu, envanterde kapsanan en yeni SHA. Taşıma durumu iş paketleri tablosunda.

## 4. Envanter

`03bf65d..a3b4961` aralığında 45 commit var. Hiçbiri merge commit'i değil.
Karar sayıları: **PORT 32** (18'i CI/CD), **ZATEN VAR 11**, **ATLA 2**.

Tarih = commit tarihi. Yazar tarihi farklıysa parantezde. Sıra boilerplate'teki uygulama sırası.

| SHA | Tarih | Konu | Karar | Not |
|---|---|---|---|---|
| `7a76aec` | 2026-11-03 | Node 22.13+ zorunlu (pnpm 11.22) | PORT | Rentopya'da `frontend/.nvmrc` ve `site/.nvmrc` zaten 22.22.0 ve CI pnpm 11.22.0 kullanıyor. `frontend/package.json` ve `site/package.json` `engines.node` hâlâ `>=20.9.0` → `>=22.13.0`. |
| `7dfb448` | 2026-11-03 | Organizations i18n etiketleri | ZATEN VAR | `platform/i18n/catalog.go:48-50,187-192`, `locales/tr/permissions.json:58-64` ("Firmalar"), `activity.json:29`. Rentopya'nın etiketleri daha kapsamlı. |
| `62b72ad` | 2026-11-03 | slug: Türkçe harfleri ASCII'ye katla | ZATEN VAR | Rentopia `3cb9b39`. `platform/slug/slug.go` aynı işi yapıyor ve ayrıca â/î/û'yu da katlıyor. |
| `2c0ed87` | 2026-11-03 | Storage yükleme gövdesini MaxBytesReader ile sınırla | PORT | `modules/storage/handler/handler.go:107`: `ParseMultipartForm(512<<20)`, MaxBytesReader yok. Diğer yükleme handler'ları (catalog, finance, customers, inspections, site, imports, settings, invitations, kabis, vehiclerecords) zaten sınırlı. `config.Storage.MaxBytes` var ama kullanılmıyor. |
| `ac23b89` | 2026-11-03 | SMTP gönderim zaman aşımı, STARTTLS / 465 | PORT | `platform/mail/mail.go`'da Timeout/TLS yok, `SMTPConfig`'te `SMTP_TLS`/`SMTP_TIMEOUT` yok. |
| `529ed47` | 2026-11-03 | X-Forwarded-For'a yalnızca güvenilir proxy arkasında güven | PORT | `platform/clientip` yok. İlk XFF atlamasına körü körüne güvenen yerler: `auth/handler/handler.go:541`, `qrlogin/handler.go:170`, `finance/handler/deposits.go:51`, `platform/httpkit/httpkit.go:90` (payments, contracts/remote, publicapi, customerportal, site, storefront, collections kullanıyor), `site/src/lib/request.ts:6`. Frontend hâlâ `clientIpFromHeaders` kullanıyor. |
| `2761ffc` | 2026-11-03 | MinIO → SeaweedFS, anonim erişim reddi | ZATEN VAR | Rentopia `ba40fc9`. `compose.prod.yml:189-215`: tek kimlik bilgili identity, anonim yok, ağ yalnızca `app`. Fark: `compose.local.yml:57` bilerek `anonymous Read:<bucket>` veriyor (yerel `S3_PUBLIC_BASE_URL` için) ve 8888 filer portunu host'a açıyor. Yalnızca yerel ortamı etkiliyor; Rentopya'nın davranışı korunur. İmaj 4.47, boilerplate'te 4.48. |
| `5478a7d` | 2026-11-03 | env-core tasarım çalışması | PORT (CI/CD) | `docs/design/env-core.md`. Rentopya'nın kendi `prod-env.sh` (schema @version 10) akışına uyarlanmalı. |
| `c33cb26` | 2026-11-03 | Şema tabanlı prod env üreteci (faz 1) | PORT (CI/CD) | Rentopya'nın daha eski bir sürümü var (`7751434`, 284 satır, `@rename/@remove`). Yeni sürüm şunları getiriyor: `##` notları, `@norotate`, `--set`, `--rotate`, `example`, testler. Şema sözdizimi uyumlu (`secret:hex:n`, `derive:`, `const:`); `ENV_SCHEMA_VERSION` damgası aynı. |
| `46ab039` | 2026-11-03 | `.env.server.example`'ı şemadan üret (faz 2) | PORT (CI/CD) | `scripts/check-env-sync.sh` yok. |
| `85ddaec` | 2026-11-03 | CI: env şema senkron kontrolü | PORT (CI/CD) | Rentopya CI'da `prod-env` job'u var ama yalnızca `prod-env.sh check` çalıştırıyor. |
| `8c5c2c2` | 2026-11-03 | Backend env okumaları container'a ulaşıyor mu kontrolü (faz 3) | PORT (CI/CD) | `scripts/check-compose-env.sh` ve `deploy/env/compose-env.allow` yok. Rentopya'nın çok sayıda env'i var (iyzico, KABİS, e-fatura, WhatsApp, site…); ilk çalıştırmada çok bulgu çıkması beklenir. |
| `48c1a22` | 2026-11-03 | CI: compose-env kontrolü | PORT (CI/CD) | |
| `8cd2080` | 2026-11-03 | Şemayla eşleşen secret guard + APP_ENV doğrulaması (faz 4) | PORT | Rentopya'da APP_ENV doğrulaması var (`platform/envguard`, `config.go:480`). JWT/encryption/adapter/centrifugo/meili varsayılanları reddediliyor (`config.go:462-536`). Eksikler: `DB_PASSWORD=change_me` ve `S3_ACCESS_KEY/SECRET=storageadmin` prod'da reddedilmiyor, şemadaki `secret:` anahtarlarıyla eşleşme testi yok. Güvenlik paketi (İP-7). |
| `b046965` | 2026-11-03 | env akışının dokümantasyonu (faz 5) | PORT (CI/CD) | AGENTS.md, DEVELOPMENT.md, EXTENDING.md, ilgili skill'ler. Rentopya metinleriyle birleştirilmeli. |
| `ece3989` | 2026-11-03 | Backend operatör ayarlarını container'lara ilet | PORT (CI/CD) | `compose.prod.yml` + allow listesi; Rentopya'nın kendi anahtar listesiyle yeniden üretilmeli. |
| `b82338c` | 2026-11-03 | guard testlerinde Close hatası kontrolü (errcheck) | PORT | `8cd2080` ile birlikte (İP-7). |
| `0796eb4` | 2026-11-03 | Prod'da imajları sunucuda build etme, hazır imaj çek | PORT (CI/CD) | Rentopya bugün sunucuda build ediyor (`BACKEND_IMAGE derive:{NAME_PREFIX}-backend:latest`, `scripts/server-sync.sh` cron). `deploy/images.json` yok. `site` imajı da eklenmeli. |
| `26fac85` | 2026-11-03 | Path filtreli pipeline, GHCR yayını, v0.N etiketi | PORT (CI/CD) | Rentopya `ci.yml` job'ları: commit-policy, prod-env, backend, frontend, site, acceptance, auto-pr. `changes` / `image-build` / `publish-images` / `release-tag` / `ci` kapısı yok. commit-policy ve acceptance korunmalı. |
| `59bab48` | 2026-11-03 | Mobil CI + EAS sürümü | ATLA | Rentopya'da `mobile/` uygulaması yok. `mobile-ci` skill'i de gelmez. |
| `bd2e26c` | 2026-11-03 | Doküman: GHCR pull + v0.* tag deploy modeli | PORT (CI/CD) | |
| `84840de` | 2026-11-03 | `app_releases` tablosu | PORT (CI/CD) | Rentopya'da yok. Boilerplate'te `000031`. Rentopya'da yeni numara alır (`000139`'dan başlayan sıradaki boş numara). |
| `2b9982b` | 2026-11-03 | Sürüm + notları backend'e göm, deploy kaydı | PORT (CI/CD) | `internal/buildinfo`, `cmd/release-record`, entrypoint, Sentry release. Rentopya'da yok. |
| `2e0a092` | 2026-11-03 | CI: imajlara sürüm kaynağı (version, notes, OCI labels) | PORT (CI/CD) | |
| `647be7a` | 2026-11-03 | CI review düzeltmeleri: imaj etkileyen yollar image-build'i tetikler | PORT (CI/CD) | `mobile-release` kapısı kısmı atlanır. |
| `b012eb3` | 2026-11-03 | Runner'ları ubuntu-24.04'e sabitle, docker/expo action'ları Node 24 | PORT (CI/CD) | Rentopya'da tüm job'lar `ubuntu-latest`. Expo kısmı atlanır. |
| `24d1b20` | 2026-11-03 | GHCR etiketlerini IMAGE_REPO'dan türet (şema v2) | PORT (CI/CD) | Rentopya şemasında `@version 11+` olarak uygulanmalı. `SITE_IMAGE` de türetilmeli. |
| `1c94dfd` | 2026-11-03 | Test edilmemiş kodu yayınlama veya auto-merge etme | PORT (CI/CD) | Rentopya `auto-pr` şu an `needs: [commit-policy, prod-env, backend, frontend, site]`. |
| `02e6ee9` | 2026-11-03 (yazar 10-16) | web-push: notification permission'ı yalnızca API varsa oku | ZATEN VAR | Rentopia `234c888`. 3 dosya boilerplate ile birebir aynı. |
| `43a0cb4` | 2026-11-03 | compose: STORAGE_MAX_BYTES varsayılanını config.go belirlesin | PORT | `2c0ed87` ile birlikte. Rentopya `compose.prod.yml` STORAGE_MAX_BYTES'ı hiç iletmiyor (`${STORAGE_MAX_BYTES:-}` eklenmeli). |
| `156af6a` | 2026-11-04 (yazar 11-03) | `/t/{slug}` organizasyon kabuğu (faz 2a) | ZATEN VAR | Rentopia `958b99a` + `e164165` ve sonrası. `features/tenant/*`, `lib/api/tenant-request.ts`, `scoped-request.ts`; şube kapsamı ve çoklu rolle genişletilmiş. Login'deki `resolveNext` aynı açık yönlendirme korumasına sahip. |
| `57244d8` | 2026-11-04 (yazar 11-03) | `.playwright-mcp/` gitignore | PORT | Önemsiz. `.gitignore`'da yok. |
| `8fdc26f` | 2026-11-04 (yazar 11-03) | /me üyelikleri yalnızca tenancy açıkken | ATLA | Rentopya her zaman çok şirketli (`deploy/env/schema:68 TENANCY_ENABLED const:true`); `server.go:460` koşulsuz `SetOrganizationsLister` doğru. |
| `917a4f2` | 2026-11-04 (yazar 11-03) | API hatasını bir kez toast'la | PORT | `frontend/src/lib/api/errors.ts:138` `emitApiError` tekilleştirme yapmıyor; `client.ts:128` ve `query/client.ts:24` aynı hatayı iki kez emit ediyor. |
| `e5856d4` | 2026-11-04 (yazar 11-03) | Platform organizasyon yönetim UI'ı (faz 2b) | ZATEN VAR | Rentopia `7f4ac29` ve sonrası: `features/organizations/*` (members, plan sekmeleri, io/bulk). |
| `ef377b9` | 2026-11-04 (yazar 11-03) | Davetler, üyeler, ayarlar (faz 3) | ZATEN VAR | Rentopia `653acb7`, `d8800ad`, `76f3c65`, `f5f90c7`: çoklu rol, şube kapsamı, özel roller, sürümlü ayarlar. Migration 000032 karşılığı Rentopya'nın kendi şablonu (`organizations.invitation`). |
| `1a5b5db` | 2026-11-04 (yazar 11-03) | Org kapsamlı engine'ler + izolasyon lint'i (faz 4) | ZATEN VAR | `database/queries_test.go` (alias + elle yazılmış SQL kontrolü ile daha güçlü), `queries/tenant_tables.txt`, `mixed_scope_tables.txt`, `isolation_exempt.txt`, `platform/orgctx/engines.go`, RT-A01 `httpserver/isolation_test.go`. `org:` kanal yetkisi `resourceevents` kurallarıyla (`auth/usecase/platform.go:459`). |
| `9339e09` | 2026-11-04 (yazar 11-03) | Tenant core dokümanı + add-tenant-resource skill'i | ZATEN VAR | Rentopia `47dc9c9` (branches örneğiyle), `docs/design/tenant-core.md`. |
| `6dd4c13` | 2026-11-04 (yazar 11-03) | Modül self-registration, adım 1 | PORT (düşük öncelik) | `platform/module` yok; `server.go` elle bağlıyor. Değeri: route ↔ openapi.yaml kapsama testi (Rentopya'da yalnızca `docs_test.go` var). Boilerplate'in sonraki adımları buna dayanacak. |
| `4141d63` | 2026-11-04 | Davet ele geçirme açığını kapat + review bulguları | PORT (kısmi) | Ayrıntı güvenlik listesinde. Eksik: (a) e-posta satırları `GET /v1/notifications` ve detay route'unda görünüyor; (b) admin, owner davetini yeniden davet ederek iptal edebiliyor; (c) üye çıkarılınca açık davetler iptal edilmiyor; (d) `orgmodel.User.ID` json etiketsiz. Zaten var olanlar: davet e-postası UserID'ye bağlı değil, boş rol reddediliyor, settings `json.RawMessage`. |
| `8686dc6` | 2026-11-04 | Güvenlik e-postası sırlarını satırda tutma (sealed_content) | PORT | Rentopya'da `sealed_content` yok; kodlar ve linkler `notifications.title/body` alanlarında düz metin. Yeni migration gerekir (sıra `000139`'dan başlar). |
| `554ad8f` | 2026-11-04 | Kayıt kapalıyken davetli adres kaydolabilsin | ZATEN VAR | Rentopya `POST /v1/invitations/{token}/register` (`organizations/handler/invitations.go:262`, `RegisterAndAccept`), UI `features/invitations/components/accept-invitation-page.tsx`. Farklar: yalnızca parola ile kayıt var (e-posta kodu yok), `RegisterInvited` e-postayı doğrulanmış işaretlemiyor. Rentopya davranışı korunur; isteğe bağlı küçük iyileştirme. |
| `70e744c` | 2026-11-04 | Platform oturumu yoksa search route'larını çağırma | ZATEN VAR (farklı çözüm) | Rentopya palet scope'a duyarlı: şirket panelinde `/v1/tenant/search` (`search.service.ts:25`), yalnızca organizasyon üyesi olan kullanıcı platform `/v1/search`'e gitmiyor. |
| `f077b5f` | 2026-11-04 | create-super-admin'i imaja koy | PORT (kısmi) | İkili zaten imajda (`backend/Dockerfile:19,49`, `make prod-super-admin`). Eksik güvenlik kısmı: `cmd/create-super-admin/main.go:27-28` varsayılan `admin@example.com` / `Password1`; `SA_PASSWORD` env desteği yok. |
| `a3b4961` | 2026-11-04 | Düz HTTP'de Auth.js oturum çerezini eşle | PORT | `frontend/src/lib/server/auth-tokens.ts:13,20`: çerez adı ve `secure` alanı `NODE_ENV`'e bağlı, `AUTH_URL` şemasına bakılmıyor. |

## 5. İş paketleri ve Linear

Ayrıntılı dosya listeleri ve riskler ilgili Linear issue'larında.

| İP | Konu | SHA'lar | Linear | Durum |
|---|---|---|---|---|
| İP-1 | Güvenlik: güvenilir proxy arkasında istemci IP'si | `529ed47` | TEC-1163 | açık |
| İP-2 | Güvenlik: depolama yükleme gövdesi sınırı | `2c0ed87`, `43a0cb4` | TEC-1164 | açık |
| İP-3 | Güvenlik: SMTP zaman aşımı ve TLS modları | `ac23b89` | TEC-1165 | açık |
| İP-4 | Güvenlik: bildirim gelen kutusu ve güvenlik e-postası sırları | `4141d63` (gelen kutusu), `8686dc6` | TEC-1166 | açık |
| İP-5 | Güvenlik: davet ve üyelik sertleştirmesi | `4141d63` (davet, üye) | TEC-1167 | açık |
| İP-6 | Frontend düzeltmeleri ve araç zinciri | `a3b4961`, `917a4f2`, `7a76aec`, `57244d8` | TEC-1168 | açık |
| İP-7 | Güvenlik: prod gizli anahtar koruması ve süper admin aracı | `8cd2080`, `b82338c`, `f077b5f` | TEC-1169 (süper admin varsayılanları), TEC-1130 (secret guard) | açık |
| İP-8 | CI/CD: şema tabanlı prod env çekirdeği | `5478a7d`, `c33cb26`, `46ab039`, `85ddaec`, `8c5c2c2`, `48c1a22`, `b046965`, `ece3989` | TEC-1130 | açık |
| İP-9 | CI/CD: GHCR imaj yayını, v0.N etiketleri, sürüm kaydı | `0796eb4`, `26fac85`, `bd2e26c`, `84840de`, `2b9982b`, `2e0a092`, `647be7a` (mobil hariç), `b012eb3` (expo hariç), `24d1b20`, `1c94dfd` | TEC-1131, TEC-1132, TEC-1133 | açık |
| İP-10 | Modül self-registration altyapısı (adım 1) | `6dd4c13` | TEC-1171 | açık |

Gelmeyecekler (ATLA): `59bab48`, `8fdc26f`. `647be7a` ve `b012eb3`'ün mobil kısımları da gelmez.

## 6. Güvenlik kontrol listesi

Kısa yollar Rentopya'da `backend/internal/` veya `frontend/src/` altındadır. Kök dosyalar (`compose.*.yml`, `site/…`) tam yolla yazıldı.

| Madde | Karar | Rentopya'daki kanıt |
|---|---|---|
| `529ed471` clientip: XFF'ye yalnızca güvenilir proxy arkasında güven | **PORT** (İP-1) | `platform/clientip` yok. `auth/handler/handler.go:541`, `qrlogin/handler.go:170`, `finance/handler/deposits.go:51`, `platform/httpkit/httpkit.go:90` ilk XFF atlamasını alıyor; `site/src/lib/request.ts:6` aynı; `TRUSTED_PROXIES` hiçbir yerde yok. |
| `2c0ed876` upload MaxBytesReader | **PORT** (İP-2) | Yalnızca `modules/storage/handler/handler.go:107` sınırsız (`ParseMultipartForm(512<<20)`, MaxBytesReader yok). Diğer 13 yükleme noktası zaten `http.MaxBytesReader` kullanıyor. |
| `2761ffc5` SeaweedFS anonim erişim reddi | **ZATEN VAR** (prod) | `compose.prod.yml:189-215`: tek identity, anonim yok, yalnızca `app` ağı. Yerelde `compose.local.yml:57` bilerek `anonymous Read:<bucket>` veriyor ve 8888 filer portu açık; bu yalnızca yerel ortamı etkiliyor, istenirse ayrıca kapatılabilir. |
| `ac23b891` SMTP timeout / STARTTLS / 465 | **PORT** (İP-3) | `platform/mail/mail.go`'da timeout/TLS yok, `SMTPConfig`'te ilgili alanlar yok. |
| `8686dc68` güvenlik e-postası sırları DB'de tutulmasın | **PORT** (İP-4) | `notifications` tablosunda `sealed_content` yok. Kodlar `TemplateVars` → title/body düz metin (`auth/usecase/account.go:147,268`, `email_code.go:207`, `deactivation.go:94`). |
| `4141d63f` davet ele geçirme | **PORT (kısmi)** (İP-4 + İP-5) | Zaten var: davet e-postası UserID'siz (`invitations.go:421-427`). Eksik: `queries/notifications.sql:25-37` e-posta satırlarını listeden çıkarmıyor. Kod içeren güvenlik e-postaları `UserID` ile bağlı, bu yüzden doğrulanmamış bir hesap kendi doğrulama kodunu gelen kutusundan okuyabilir. Ayrıca `insertInvitation` (`invitations.go:361`) admin'in owner davetini yeniden davetle iptal etmesine izin veriyor, `RemoveTenantMember` açık davetleri iptal etmiyor, `orgmodel.User.ID` json etiketsiz. |
| `554ad8f5` kayıt kapalıyken davetli adres kaydı | **ZATEN VAR** | `POST /v1/invitations/{token}/register` → `Management.RegisterAndAccept` → `AuthUseCase.RegisterInvited` (`auth/usecase/auth.go:258`). Fark: e-posta kodu yolu yok ve e-posta doğrulanmış işaretlenmiyor. |
| `a3b49617` Auth.js çerezi düz HTTP'de | **PORT** (İP-6) | `frontend/src/lib/server/auth-tokens.ts:13,20` `NODE_ENV==="production"`'a bakıyor, `AUTH_URL` şemasına bakmıyor. |
| `70e744ca` oturumsuz search route çağrısı | **ZATEN VAR** (farklı çözüm) | `features/search-engine/services/search.service.ts:25` scope'a göre `/v1/tenant/search` / `/v1/search`; şirket panelinde platform search çağrılmıyor. |
| `917a4f2c` API hatası başına tek toast | **PORT** (İP-6) | `lib/api/errors.ts:138` tekilleştirme yok; `lib/api/client.ts:128` ve `lib/query/client.ts:24` aynı hatayı emit ediyor. |
| `f077b5f0` create-super-admin imajda | **PORT (kısmi)** (İP-7) | İkili zaten imajda (`backend/Dockerfile:19,49`). `cmd/create-super-admin/main.go:27-28` varsayılan `admin@example.com`/`Password1` ile çalışıyor, `SA_PASSWORD` desteği yok. |
| `8cd20809` config secret guard | **PORT** (İP-7) | APP_ENV doğrulaması (`platform/envguard`, `config.go:480`) ve JWT/encryption/adapter/centrifugo/meili varsayılan reddi var. `DB_PASSWORD=change_me` ve `S3_*=storageadmin` reddedilmiyor, şema ile eşleşme testi yok. |
| Tenancy: izolasyon lint'i (`1a5b5db`) ve devamı | **ZATEN VAR** | `backend/internal/database/queries_test.go` (tenant + mixed-scope + elle yazılmış SQL + alias kontrolü), `queries/{tenant_tables,mixed_scope_tables,isolation_exempt}.txt`, RT-A01 `httpserver/isolation_test.go`, CI `acceptance` job'u. 4141d63'teki "predicate veya INSERT" inceltmesi ayrıca değerlendirilebilir. |
| Tenancy: Redis önbellekli, sürümlü context çözümü | **ZATEN VAR** (taban öncesi) | `platform/orgctx/orgcache/orgcache.go`, `httpserver/server.go:485-486` `orgcache.New(orgSvc, deps.Redis, cfg.Tenancy.CacheTTL, …)`. |
| Tenancy: X-Organization doğrulaması | **ZATEN VAR** (taban öncesi) | `middleware/organization.go:15-18` `maxOrganizationRefLen = 64`, slug/uuid çözümü; BFF yalnızca `/api/v1/tenant/*` için iletiyor. Tabandan sonra boilerplate'te bu dosyada değişiklik yok. |
| Tenancy: üyelik iptalinde cache temizliği | **ZATEN VAR** | `organizations/usecase/tenant_access.go` `RemoveTenantMember` → `orgctx.Invalidate(ctx, s.invalidator, scope.ID)`; `service.go` `RemoveMember`/rol değişikliği de aynısını yapıyor. |
| Org realtime kanalı (`org:{uuid}`) yetkisi (`1a5b5db`) | **ZATEN VAR** | `auth/usecase/platform.go:459` `RunChannelRules` (resourceevents org kuralları); `conversation:` kapalı. |
| Auth / MFA / passkey / OAuth / parola sıfırlama / oturum / step-up | — | Tabandan sonra auth'a dokunan commit'ler yalnızca: `529ed47` (oturum meta IP'si → İP-1), `554ad8f` (davetli kayıt, ZATEN VAR), `a3b4961` (oturum çerezi → İP-6), `4141d63`/`8686dc6` (doğrulama, sıfırlama, login, OAuth bağlama ve hesap kapatma kodları → İP-4). MFA/TOTP, passkey, step-up, JWT ve refresh rotasyonunda tabandan sonra değişiklik yok (`git log 03bf65d..origin/main` ilgili yollarda boş). |

### CI/CD commit'leri (hepsi İP-8 / İP-9)
`5478a7d`, `c33cb26`, `46ab039`, `85ddaec`, `8c5c2c2`, `48c1a22`, `b046965`, `ece3989`, `0796eb4`, `26fac85`, `bd2e26c`, `84840de`, `2b9982b`, `2e0a092`, `647be7a`, `b012eb3`, `24d1b20`, `1c94dfd` (18 PORT) + `59bab48` (mobil, ATLA). CI/CD'ye değen ama güvenlik paketlerine konanlar: `8cd2080`/`b82338c`/`f077b5f` (İP-7), `43a0cb4` (compose, İP-2).

## 7. Kararlar

1. Migration numaraları Rentopya sırasından devam eder. Repoda son migration `000138` (brief `000132` diyordu). Yeniler `000139`'dan başlar.
2. Commit'ler sahibin GitHub noreply kimliğiyle atılır. AI atfı yok.
3. `auto-pr` silinmedi, `if: false` ile kapatıldı. `cc-collective-branch`'e ilk merge edilen PR bu (TEC-1128).
4. Mobil uygulama Go API'yi doğrudan `EXPO_PUBLIC_API_URL` + `/v1/*` ile çağırır.
5. Mobil auth backend'i zaten var. Eksik olan gerçek hesap silme (TEC-1137).
6. Hesap silmede kullanıcı anonimleştirilir. Kiralama, sözleşme ve finans kayıtları korunur.
7. Araç QR etiketi `rentopya://vehicle/{uuid}`. Plaka araması `vehicles?q=`.
8. Offline kapsam: fotoğraf ve imza kuyruğu.
9. iOS build Xcode Cloud, Android EAS Build.
10. Mobil testler `node --test`. `mobile-release.sh` testleri sıfırdan yazılır (otopoly'de yok).
11. ATLA: `59bab48` (boilerplate mobil CI; Rentopya'nın mobil CI'ı TEC-1139'da otopoly modeliyle yazılır), `8fdc26f` (Rentopya'da tenancy her zaman açık).
