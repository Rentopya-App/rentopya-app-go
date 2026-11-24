package i18n

// Platform usage and connection health (TEC-739): the failed-work alert
// sent to platform administrators and the health source names it lists.
// A module that registers its own health source adds
// "platform_health.source.<code>" in its own catalog file.

var trPlatformHealth = map[string]string{
	"platform_health.alert.title":                       "Bağlantı sağlığı: {count} yeni kritik sorun",
	"platform_health.alert.body":                        "Yeni sorunlar: {details}. Ayrıntılar platform yönetimindeki kullanım ve sağlık panosunda.",
	"platform_health.source.integration_accounts":       "Entegrasyon hesapları",
	"platform_health.source.integration_jobs":           "Entegrasyon işleri",
	"platform_health.source.queue":                      "Arka plan kuyruğu",
	"platform_health.failure_alert.title":               "Başarısız iş: {kind} ({status})",
	"platform_health.failure_alert.body":                "{source} · {kind}: {status} ({ref}). Hata: {error}. Ayrıntılar platform yönetimindeki sağlık panosunda; aynı iş türü için 15 dakika içinde yeni uyarı gönderilmez.",
	"platform_health.failure_status.dead":               "yeniden denemeler tükendi",
	"platform_health.failure_status.failed":             "başarısız",
	"platform_health.failure_status.needs_verification": "doğrulama bekliyor",
	"platform_health.source.public_cap":                 "Public kanal tavanı",
	"platform_health.public_cap.reservations":           "rezervasyon",
	"platform_health.public_cap.leads":                  "form başvurusu",
	"platform_health.cap_alert.title":                   "Saatlik {cap} tavanı doldu: {organization}",
	"platform_health.cap_alert.body":                    "{organization} firmasının sitesi ve public API'si son bir saatte {limit} {cap} sınırına ulaştı; yeni istekler 429 ile reddediliyor. Gerçek bir kampanya ise tavanı platform ayarlarından yükseltin, değilse bot saldırısı olabilir. Aynı firma için 15 dakika içinde yeni uyarı gönderilmez.",
}

var enPlatformHealth = map[string]string{
	"platform_health.alert.title":                       "Connection health: {count} new critical issues",
	"platform_health.alert.body":                        "New issues: {details}. See the usage and health dashboard in platform management.",
	"platform_health.source.integration_accounts":       "Integration accounts",
	"platform_health.source.integration_jobs":           "Integration jobs",
	"platform_health.source.queue":                      "Background queue",
	"platform_health.failure_alert.title":               "Failed job: {kind} ({status})",
	"platform_health.failure_alert.body":                "{source} · {kind}: {status} ({ref}). Error: {error}. See the health dashboard in platform management; no new alert is sent for the same job kind within 15 minutes.",
	"platform_health.failure_status.dead":               "retries exhausted",
	"platform_health.failure_status.failed":             "failed",
	"platform_health.failure_status.needs_verification": "needs verification",
	"platform_health.source.public_cap":                 "Public channel cap",
	"platform_health.public_cap.reservations":           "reservation",
	"platform_health.public_cap.leads":                  "form submission",
	"platform_health.cap_alert.title":                   "Hourly {cap} cap reached: {organization}",
	"platform_health.cap_alert.body":                    "The site and public API of {organization} reached the limit of {limit} per hour ({cap}); new requests are refused with 429. If this is a real campaign, raise the cap in platform settings; otherwise it may be a bot attack. No new alert is sent for the same organization within 15 minutes.",
}

func init() {
	for k, v := range trPlatformHealth {
		trCatalog[k] = v
	}
	for k, v := range enPlatformHealth {
		enCatalog[k] = v
	}
}
