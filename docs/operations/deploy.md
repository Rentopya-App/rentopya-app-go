# Sürüm ve dağıtım (GHCR, `v0.N`, Dokploy)

Sunucu uygulama imajlarını derlemez. CI her `main` push'unda imajları GHCR'a yayınlar, sürüme `v0.N` etiketini verir; Dokploy o etiketi çekip çalıştırır. Bu belge sürecin işletim tarafıdır: sürüm nasıl çıkar, nasıl dağıtılır, nasıl geri alınır, env nasıl yükseltilir ve sahibin bir kez yapması gerekenler. CI işlerinin ayrıntısı: [DEVELOPMENT.md → CI](../DEVELOPMENT.md#ci); env çekirdeği: [design/env-core.md](../design/env-core.md); yedekler: [backup-restore.md](./backup-restore.md).

## Sürüm nasıl çıkar

1. İş, bir özellik dalından PR ile `main`'e birleşir (şimdilik `cc-collective-branch` üzerinden, bkz. [Sahibin kontrol listesi](#sahibin-kontrol-listesi)).
2. `main` push'unda `.github/workflows/ci.yml` tüm paketi koşar (alan filtresi yok).
3. `release-meta` sürüm numarasını seçer: mevcut en yüksek `v0.*` etiketi + 1 (hiç yoksa `v0.1`). Sürüm notları önceki `v0.*` etiketinden bu yana `git log --no-merges` (en fazla 200 satır).
4. `publish-images`, yalnız test işlerinin hepsi (`commit-policy`, `prod-env`, `env`, `backend`, `frontend`, `site`, `acceptance`) başarılıysa çalışır; biri başarısız, iptal ya da atlanmışsa yayın olmaz. [`deploy/images.json`](../../deploy/images.json) içindeki her servis için (`backend`, `frontend`, `site`, `backup`) `ghcr.io/rentopya-app/rentopya-app-go-<servis>` imajını iki etiketle iter: `:sha-<kısa sha>` ve `:v0.N`.
5. `promote-latest`, matrisin tamamı başarılıysa her servisin `:latest` etiketini bu commit'in `:sha-<kısa sha>` imajına taşır (yeniden derleme yok, aynı digest). `main` bu arada ilerlediyse `:latest`'e dokunmaz; onu yeni koşu taşır, böylece `:latest` geriye gitmez.
6. `release-tag`, `:latest` taşındıktan sonra git etiketi `v0.N`'i ve notlarıyla bir GitHub release oluşturur. Dokploy'u tetikleyen bu etikettir; o anda `latest` zaten yeni sürümü gösterir.

İmaja gömülenler: sürüm, git SHA, derleme zamanı ve notlar (`backend/internal/buildinfo`, OCI etiketleri). Backend bunları `/healthz` yanıtında verir:

```json
{"status":"ok","version":"v0.7","git_sha":"<40 karakter>","built_at":"2026-11-09T12:00:00Z"}
```

Dal derlemelerinde `version` `sha-<kısa>`, yerelde `dev` olur. Mobil uygulama bu hatta değildir; kendi yayın hattı vardır ([Mobil sürüm](#mobil-sürüm)).

## Dokploy bir sürümü nasıl dağıtır

Compose uygulaması `compose.prod.yml`'ı kullanır; `backend` (ayrıca `migrate` ve `worker`), `frontend`, `site` ve `backup` servisleri `${IMAGE_REPO}-<servis>:${IMAGE_TAG}` imajını `pull_policy: always` ile çeker. `IMAGE_REPO` ve `IMAGE_TAG=latest` şemadan gelir.

Normal akış elle iş istemez: compose uygulamasının tetikleyicisi **On Tag** ve `IMAGE_TAG=latest` iken her yeni `v0.N` etiketi dağıtımı başlatır, `pull_policy: always` yeni `latest`'i çeker. Şema `@version`'ını artıran bir PR'ı `main`'e birleştirmeden **önce** [Env yükseltme](#env-yükseltme) adımını yapın; birleşince dağıtım kendiliğinden başlar ve eksik anahtarla açılır.

Güvenlik: `:latest`'i yalnız `main` push'undaki `promote-latest` işi taşır, o da bütün test işleri ve imaj yayını başarılıysa. PR ve fork derlemeleri bu işe ulaşmaz (dal derlemeleri imaj itmez, elle test yayını yalnız `:test-<sha>` iter). Yazma yetkisi yalnız o işin `GITHUB_TOKEN`'ında (`packages: write`); ayrı bir PAT yoktur. Paketler özel kalır, sunucu `read:packages` token'ıyla çeker. `latest` test edilen `:sha-<kısa sha>` ile aynı digest'tir; geri alma için `v0.N` ve `sha-` etiketleri durur.

Belirli bir sürümü sabitlemek için:

1. GitHub → Releases'tan sürümü seçin (`v0.N`).
2. Dokploy → compose uygulaması → Environment: `IMAGE_TAG=v0.N`, kaydedin. Sabitken yeni etiketler aynı sürümü yeniden dağıtır; otomatik akışa dönmek için `IMAGE_TAG=latest`.
3. Deploy. Sıra compose'da sabittir:
   - `postgres` sağlıklı olunca `migrate` servisi `migrate up` çalıştırır, ardından `release-record` `app_releases` tablosuna bir satır yazar (sürüm, SHA, derleme zamanı, notlar). Kayıt başarısız olursa dağıtım durmaz.
   - `migrate` başarıyla bitmeden `backend` ve `worker` başlamaz. Bir migration hata verirse eski container'lar ayakta kalır; `migrate` loguna bakın.
4. Doğrulayın:
   - `docker exec <NAME_PREFIX>-backend wget -qO- http://localhost:8080/healthz` → `version` `v0.N` olmalı (backend dışarı açık değildir; Dokploy terminali ya da sunucu kabuğu).
   - `docker logs <NAME_PREFIX>-migrate` → `migrate up` ve `release-record` satırları.
   - İsteğe bağlı: `SELECT version, git_sha, deployed_at FROM app_releases ORDER BY deployed_at DESC LIMIT 5;`
   - Panelde giriş ve bir organizasyon sayfası; site alan adı açılıyor mu.

Düz Docker sunucusunda aynı akış: `.env.server` içinde `IMAGE_TAG=latest` (ya da sabit `v0.N`), `docker login ghcr.io` (paketler özelse), `make prod-up`. Yayınlanmamış bir commit'i sunucuda denemek için `make prod-up-build` (`compose.build.yml`, `IMAGE_TAG=local` gibi sürüm dışı bir etiketle). `scripts/server-sync.sh` (cron ile `main`'i izleyen eski yol) kullanımdan kalkıyor; Dokploy'a geçince kapatın.

## Geri alma

1. Dokploy'da `IMAGE_TAG`'i önceki sürüme (`v0.N-1`) sabitleyin ve yeniden dağıtın. Düzeltme sürümü çıkınca `IMAGE_TAG=latest`'e dönün.
2. `/healthz` → `version` eski sürümü göstermeli. `app_releases` yeni bir satır alır (olay kaydıdır; geri dönüş de bir dağıtımdır).

**Migration'lar yalnız ileri gider.** Geri almak şemayı geri almaz: `migrate` servisi sadece `up` çalıştırır ve eski imaj veritabanında zaten uygulanmış migration'ları görür, hiçbirini geri sarmaz. Bu yüzden:

- Bir sürümdeki migration'lar bir önceki sürümün koduyla çalışabilecek şekilde yazılır (sütun/tablo eklemek güvenli; silmek ya da yeniden adlandırmak iki sürüme bölünür: önce kod kullanmayı bırakır, sonraki sürüm şemadan siler). Ayrıntı: [backend/DATABASE_RULES.md](../../backend/DATABASE_RULES.md).
- Eski kodun yeni şemayla çalışmadığı bir durumda `migrate down` elle ve yedek alındıktan sonra yapılır; veri kaybı riski vardır, tercih edilen yol ileri bir düzeltme sürümüdür.
- Gerçekten şemanın da geri dönmesi gerekiyorsa: dağıtımdan önceki yedeği geri yükleyin ([backup-restore.md](./backup-restore.md)); arada yazılan veri kaybolur.

Compose dosyası Dokploy'un çektiği git ref'inden gelir. Geri alınan sürümle `compose.prod.yml` değiştiyse (yeni servis, yeni env anahtarı) Dokploy'daki git ref'ini de o sürümün etiketine çekin.

## Env yükseltme

Üretim env'inin tek kaynağı [`deploy/env/schema`](../../deploy/env/schema)'dır (`@version` ile sürümlenir); `.env.server.example` ondan üretilir, elle düzenlenmez. Bir sürüm şemanın `@version`'ını artırdıysa dağıtımdan **önce**:

1. Dokploy'daki env'i bir dosyaya kopyalayın (ör. `.env.server`, mod 600).
2. `scripts/prod-env.sh upgrade .env.server` (ya da `make prod-env-upgrade`): mevcut her değer korunur (gizli anahtarlar değişmez), yeniden adlandırılan anahtarlar değeriyle taşınır, yeni anahtarlar üretilir ya da varsayılanını alır, kaldırılanlar yorum satırına döner. Önceki dosya `.env.server.bak.<zaman>` olarak kalır.
3. `scripts/prod-env.sh check .env.server` (`make prod-env-check`) temiz çıkmalı.
4. Dosyayı Dokploy'a geri yapıştırın, dağıtın. `upgrade` mevcut `IMAGE_TAG` değerini korur; v15 öncesinden gelen bir env'de `v0.N` duruyorsa bir kez `latest` yapın.

Bu geçişte (GHCR ve güvenlik işleri) eklenen önemli anahtarlar:

| Anahtar | Varsayılan | Not |
|---------|-----------|-----|
| `IMAGE_REPO` | `ghcr.io/rentopya-app/rentopya-app-go` | Şemadan gelir, değiştirmeyin. `BACKEND_IMAGE`, `FRONTEND_IMAGE`, `SITE_IMAGE` kaldırıldı |
| `IMAGE_TAG` | `latest` | CI her yeşil `main` push'unda taşır. Sabitlemek / geri almak için `v0.N` |
| `TRUSTED_PROXIES` | boş (loopback + özel ağlar) | X-Forwarded-For'una güvenilen proxy'ler (CIDR/IP, virgüllü). Cloudflare gibi dış bir proxy varsa aralıklarını ekleyin; `none` = hiç güvenme |
| `SMTP_TLS` | `auto` | 465'te örtük TLS, diğer portlarda STARTTLS zorunlu; `starttls` / `implicit` biri zorlar; `none` üretimde reddedilir |
| `SMTP_TIMEOUT` | `10s` | Bir gönderimin tamamı (bağlantı, TLS, teslim) |
| `STORAGE_MAX_BYTES` | 10 MiB (`config.go`) | Şemada yok, compose'dan geçer. Daha büyük yükleme gerekiyorsa Dokploy env'ine elle ekleyin; `upgrade` onu "Unmanaged" altında korur |

## Mobil sürüm

Mobil uygulama sunucu sürümlerinden bağımsızdır. `main`'e `mobile/` altında gönderilecek bir değişiklik birleştiğinde ve backend, frontend, mobile işleri geçtiğinde, `ci.yml` içindeki `mobile-release` işi `.github/workflows/mobile-release.yml`'ı çağırır (`scripts/ci/mobile-release.sh`). Repo değişkeni `MOBILE_RELEASE_ENABLED` `true` değilse iş atlanır.

- Native parmak izi değişmediyse: OTA (`eas update --channel production`).
- Değiştiyse: Android EAS Build + Play internal (taslak); iOS için `ios-build-<hash12>` etiketi itilir ve Xcode Cloud TestFlight derlemesini başlatır.
- Backend/OpenAPI değişikliği tek başına mobil sürüm çıkarmaz.

Akış, `mobile/release.env`, geri alma ve sahibin mobil adımları: [mobile/docs/OTA.md](../../mobile/docs/OTA.md).

## Sahibin kontrol listesi

Ajanlar etiket oluşturmaz, `eas` komutu çalıştırmaz, Dokploy'a, repo ayarlarına, secret'lara dokunmaz. Aşağıdakileri sahip bir kez yapar.

**Dokploy**

- [ ] Registry: `ghcr.io`, kullanıcı adı GitHub hesabı, parola `read:packages` yetkili bir token (paketler herkese açıksa gerekmez). Düz sunucuda: `docker login ghcr.io`.
- [ ] Compose uygulamasının env'i şemadan üretilmiş olsun (`make prod-env`, eskiyse `scripts/prod-env.sh upgrade`); `IMAGE_TAG=latest`.
- [ ] Alan adları: panel → `frontend:3000`, Centrifugo → `centrifugo:8000`, joker site alanı (`*.<uygulama alanı>`) → `site:3000`.
- [ ] Eski `scripts/server-sync.sh` cron'unu Dokploy'a geçince kapatın.

**GitHub repo ayarları**

- [ ] Branch protection (`main` ve `cc-collective-branch`): zorunlu durum kontrolü olarak yalnız **`ci`**'yı seçin (tek kapı; atlanan işleri geçti sayar).
- [ ] Secret `EXPO_TOKEN` (Expo robot kullanıcısının erişim token'ı).
- [ ] Değişken `MOBILE_RELEASE_ENABLED=true`: yalnız Xcode Cloud `ios-build-*` etiketlerini dinlemeye başladıktan sonra. Önce Actions → Mobile release'i `dry_run` ile elle çalıştırıp kararı görün.
- [ ] GHCR yayını ve sürüm etiketi için secret gerekmez (yerleşik `GITHUB_TOKEN`). `auto-pr` işi geçiş süresince kapalıdır (`if: false`); yeniden açılacaksa `AUTO_PR_TOKEN` ya da "Allow GitHub Actions to create and approve pull requests" ayarı gerekir.

**Expo / EAS**

- [ ] `mobile/` içinde `npx eas-cli@latest init` → `expo.extra.eas.projectId` `app.json`'a yazılır, commit edin.
- [ ] EAS `production` ortamı (düz metin ya da sensitive, **secret değil**): `EXPO_PUBLIC_APP_ENV=production`, `EXPO_PUBLIC_API_MODE=live`, `EXPO_PUBLIC_API_URL=https://<api>`, `EXPO_PUBLIC_WEB_URL=https://<panel>`; kullanılıyorsa `EXPO_PUBLIC_APPLE_SIGN_IN`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` (`mobile/release.env` ile aynı), `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.

**Apple**

- [x] App Store Connect: `com.rentopya.app` kimliği (takım `N5T7KH96U3`) ve uygulama kaydı; `ascAppId`'yi `eas.json` → `submit.production.ios`'a yazın. (2026-11-10: `ascAppId` `6832920047`; App ID'ler `com.rentopya.app` ve `com.rentopya.app.widgets`, ikisi de App Group `group.com.rentopya.app`'e bağlı.)
- [ ] Xcode Cloud: repoyu bağlayın, `mobile/ios` için iş akışı; başlangıç koşulu **Tag Changes**, `ios-build-` ile başlayan etiketler; Archive → TestFlight (internal). Env: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WEB_URL` (EAS ile aynı), varsa `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.

**Google Play**

- [x] Play Console'da `com.rentopya.app` uygulaması (2026-11-10, TechnoWide Software hesabı, varsayılan dil tr-TR).
- [ ] Yayın yetkili bir Google Cloud servis hesabı, JSON anahtarı `eas credentials -p android` ile yüklenir. İlk derleme internal kanala elle yüklenir.

**Apple / Google ile giriş (mobil)**

- [ ] Sunucu env'i: `AUTH_APPLE_NATIVE_CLIENT_IDS` (iOS bundle id, `com.rentopya.app`), `AUTH_GOOGLE_NATIVE_CLIENT_IDS` (Google iOS + Android istemci kimlikleri; web istemci kimliği Platform'daki Google OAuth ayarından gelir). Apple anahtarı tercihen Platform → Entegrasyonlar → Apple'dan `.p8` olarak; yoksa `AUTH_APPLE_TEAM_ID` / `AUTH_APPLE_KEY_ID` / `AUTH_APPLE_PRIVATE_KEY`. Mağaza incelemesi için `AUTH_REVIEW_ACCOUNTS`.
- [ ] Mobil tarafta aynı kimlikler EAS ortamında ve `mobile/release.env`'de.

**Sunucu ayarları**

- [ ] SMTP: 587 gibi bir portta sunucu STARTTLS desteklemeli (`SMTP_TLS=auto` bunu zorunlu tutar); 465 kullanılıyorsa örtük TLS otomatik seçilir.
- [ ] 10 MiB'tan büyük yükleme gerekiyorsa `STORAGE_MAX_BYTES` (bayt).
- [ ] İlk platform yöneticisi: `make prod-super-admin SA_EMAIL=siz@ornek.com` ya da `docker compose --env-file .env.server -f compose.prod.yml exec backend /app/create-super-admin -email siz@ornek.com -generate-password`. `SA_EMAIL` zorunlu; parola verilmezse üretilir ve bir kez yazdırılır.

**İlk sürüm**

- [ ] `cc-collective-branch` → `main` PR'ını `ci` yeşilken birleştirin. Henüz `v0.*` etiketi olmadığı için bu birleşme **`v0.1`** olur: git etiketi, GitHub release ve her servis için `:sha-<kısa>` + `:v0.1` imajları.
- [ ] Dokploy'da env'i yükseltin (`main`'deki eski şemadan bu geçişin `@version`'ına), `IMAGE_TAG=v0.1`, dağıtın ve `/healthz` ile doğrulayın.
