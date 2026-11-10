-- Public legal pages: privacy policy / KVKK aydınlatma
-- metni, terms of use and the account deletion guide. One row per slug with
-- a Markdown body and title per locale; tr is required, en falls back to tr
-- when empty. Served by GET /v1/public/legal/{slug} and edited by the
-- platform admin in /platform/legal/*. Design: docs/design/legal-pages.md.
--
-- Seed text only. Later edits happen in the editor; the seed is not a legal
-- review. Placeholders in [brackets] (address, MERSİS no) must be filled in
-- before the pages are used as store listing URLs.
CREATE TABLE legal_pages (
    id          BIGSERIAL    PRIMARY KEY,
    slug        VARCHAR(64)  NOT NULL,
    title_tr    TEXT         NOT NULL,
    title_en    TEXT         NOT NULL DEFAULT '',
    body_tr     TEXT         NOT NULL,
    body_en     TEXT         NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_by  BIGINT       NULL REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT uq_legal_pages_slug UNIQUE (slug),
    CONSTRAINT chk_legal_pages_slug CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT chk_legal_pages_title_tr CHECK (btrim(title_tr) <> ''),
    CONSTRAINT chk_legal_pages_body_tr CHECK (btrim(body_tr) <> '')
);

CREATE TRIGGER trg_legal_pages_set_updated_at
    BEFORE UPDATE ON legal_pages
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Privacy policy and KVKK information notice.
INSERT INTO legal_pages (slug, title_tr, title_en, body_tr, body_en) VALUES (
'privacy',
'Gizlilik Politikası ve KVKK Aydınlatma Metni',
'Privacy Policy',
$md$Bu metin, Rentopya platformunu (rentopya.app web sitesi ve yönetim paneli, firmalar adına yayımlanan *.rentopya.app rezervasyon siteleri, müşteri portalı ve Rentopya mobil uygulaması) kullanırken kişisel verilerinizin nasıl işlendiğini açıklar ve 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") m.10 uyarınca aydınlatma metni niteliğindedir.

## 1. Veri sorumlusu ve rolümüz

Rentopya platformu **Technowide Software** ("Rentopya", "biz") tarafından işletilmektedir.

- **Adres:** [Adres]
- **MERSİS no:** [MERSİS no]
- **E-posta:** [contact@rentopya.app](mailto:contact@rentopya.app)

Rentopya, araç kiralama firmalarının filo, rezervasyon, kiralama, sözleşme ve muhasebe süreçlerini yönettiği çok firmalı bir yazılım hizmetidir. Rolümüz, verinin kime ait olduğuna göre değişir:

- **Platform kullanıcıları** (Rentopya'ya kayıt olan firma sahipleri, firma çalışanları ve platform yöneticileri) bakımından Rentopya **veri sorumlusudur**.
- **Kiralama firmalarının müşterileri** (kiracılar, sürücüler, kurumsal müşteri çalışanları, rezervasyon sitesi ziyaretçileri ve form dolduranlar) bakımından **veri sorumlusu, hizmet aldığınız kiralama firmasıdır**. Rentopya bu verileri yalnızca firma adına, firmanın talimatıyla ve hizmetin sunulması amacıyla işleyen **veri işleyendir**. Her firmanın verisi ayrı tutulur; bir firmanın müşteri kayıtları başka bir firmayla paylaşılmaz. Bu verilerle ilgili talepleriniz için öncelikle kiralama firmasına başvurmanızı rica ederiz.

## 2. İşlenen kişisel veriler

### Platform kullanıcıları

- **Kimlik ve iletişim:** ad, soyad, e-posta adresi, dil tercihi.
- **Hesap ve giriş bilgileri:** şifrenin özeti (şifrenin kendisi saklanmaz), passkey kayıtları, iki adımlı doğrulama (TOTP) kaydı, tek kullanımlık giriş kodları, firma üyelikleri, rol, şube ve yetkiler; Google, Apple, Facebook veya GitHub ile giriş yaptığınızda bu hizmetin paylaştığı hesap kimliği ve e-posta adresi.
- **İşlem güvenliği verileri:** oturum kayıtları, IP adresi, tarayıcı ve cihaz bilgisi, giriş zamanları, işlem (etkinlik) kayıtları. QR ile girişte, onayınıza sunulan tarayıcının IP adresinden çıkarılan yaklaşık konum (ülke, bölge, şehir) gösterilir; cihaz konumunuz (GPS) alınmaz.
- **Bildirim verileri:** mobil ve tarayıcı bildirimleri için cihaz bildirim anahtarları, bildirim tercihleri ve bildirim kutusu.
- **Firma bilgileri:** firma unvanı, vergi bilgileri, adresi, logosu, şubeleri ve firmanın bağladığı entegrasyon hesapları (erişim anahtarları şifrelenmiş olarak saklanır).

### Kiralama firmalarının müşterileri ve sürücüler

- **Kimlik ve iletişim:** ad, soyad veya ticari unvan, T.C. kimlik no, pasaport no veya vergi no, uyruk, doğum tarihi, telefon, e-posta, fatura adresi.
- **Sürücü belgesi bilgileri:** ehliyet numarası, sınıfı, veriliş ve geçerlilik tarihleri, veren ülke. Kimlik ve ehliyet numaraları şifrelenmiş olarak saklanır ve ekranlarda maskeli gösterilir.
- **Rezervasyon ve kiralama kayıtları:** teklif ve rezervasyonlar, alış ve iade şubesi ve zamanı, araç ve plaka, ek ürünler, uzatma, araç değişikliği, kilometre ve yakıt bilgileri, ücret ve kesintiler.
- **Araç kontrol (ekspertiz) kayıtları:** teslim ve iadede çekilen araç ve hasar fotoğrafları, hasar diyagramı ve notlar.
- **Sözleşme ve onay verileri:** sözleşme metni ve özeti (hash), onay yöntemi, onay için gönderilen SMS doğrulama kodları, onay zamanı, IP adresi ve tarayıcı bilgisi.
- **Ödeme ve depozito kayıtları:** tahsilat, iade, depozito ve kart provizyonu (ön otorizasyon) kayıtları, ödeme bağlantıları, cari hesap hareketleri. Kart bilgileri ödeme kuruluşunun sayfasında girilir; Rentopya kart numarasını saklamaz, yalnızca kart ailesi ve son dört hane gibi maskeli bilgileri tutar.
- **Fatura kayıtları:** e-fatura ve e-arşiv faturalarında yer alan alıcı bilgileri.
- **Yasal bildirim ve geçiş kayıtları:** KABİS (Emniyet araç kiralama bildirimi) kapsamında kiracı ve sürücü kimlik bilgileri, plaka ve kiralama zamanları; HGS/OGS geçiş kayıtları (plaka, geçiş yeri ve zamanı, tutar) ve bunların kiralamayla eşleştirilmesi.
- **İleti kayıtları:** firma adına SMS, WhatsApp ve e-posta ile gönderilen mesajların içeriği ve iletim durumu; ticari ileti onayları (kanal, onay metni, zamanı).
- **Müşteri portalı ve rezervasyon sitesi verileri:** rezervasyon numarası ve tek kullanımlık kodla giriş kayıtları, değişiklik ve iptal talepleri; iletişim, kurumsal, franchise ve bülten formlarına girilen ad, e-posta, telefon, şirket, şehir ve mesaj.
- **Kanal rezervasyonları:** firma Yolcu360 veya Obilet gibi satış kanallarını bağladığında bu kanallardan gelen rezervasyon ve müşteri bilgileri.

## 3. İşleme amaçları

- Platform hesabının oluşturulması, kimlik doğrulama, oturum ve yetki yönetimi,
- Kiralama firmalarının filo, fiyat, rezervasyon, kiralama, teslim/iade, sözleşme, tahsilat, depozito, fatura ve raporlama süreçlerini yürütebilmesi,
- Firmanın kiralama koşullarını (yaş, ehliyet süresi gibi) kontrol edebilmesi,
- Firma adına müşterilere rezervasyon, ödeme bağlantısı, sözleşme onay kodu ve hatırlatma mesajları gönderilmesi,
- KABİS bildirimi ve e-fatura gibi yasal yükümlülüklerin firma adına yerine getirilmesi,
- Firmalara özel rezervasyon sitelerinin ve müşteri portalının sunulması,
- Destek taleplerinin yanıtlanması ve sizinle iletişim kurulması,
- Bilgi güvenliğinin sağlanması, kötüye kullanımın önlenmesi, hataların tespiti ve giderilmesi,
- Hukuki yükümlülüklerin yerine getirilmesi ve yetkili mercilerin taleplerinin karşılanması.

## 4. Hukuki sebepler

Kişisel veriler KVKK m.5/2 kapsamında şu hukuki sebeplere dayanılarak işlenir:

- Bir sözleşmenin kurulması veya ifasıyla doğrudan ilgili olması (platform üyeliği; firma ile müşterisi arasındaki kiralama sözleşmesi),
- Veri sorumlusunun hukuki yükümlülüğünü yerine getirebilmesi (ör. araç kiralama bildirimi, vergi ve ticaret mevzuatı),
- Bir hakkın tesisi, kullanılması veya korunması,
- İlgili kişinin temel hak ve özgürlüklerine zarar vermemek kaydıyla veri sorumlusunun meşru menfaati (ör. bilgi güvenliği, hizmetin iyileştirilmesi),
- Bu sebeplerin bulunmadığı hâllerde açık rızanız (ör. ticari elektronik ileti onayı).

Rentopya, hizmetin işleyişi için özel nitelikli kişisel veri (KVKK m.6) talep etmez. Firmaların not ve açıklama alanlarına bu nitelikte veri girmemesi gerekir.

## 5. Aktarım

Kişisel veriler yalnızca yukarıdaki amaçlarla ve gerekli olduğu ölçüde şu alıcılara aktarılabilir:

- **Barındırma ve altyapı hizmet sağlayıcıları:** sunucu, veritabanı, dosya depolama ve yedekleme hizmetleri.
- **E-posta hizmeti:** doğrulama kodları ve bildirim e-postalarının iletilmesi için kullanılan e-posta sunucusu sağlayıcısı.
- **SMS hizmeti (Netgsm):** firmanın bağladığı SMS hesabı üzerinden alıcı telefon numarası ve mesaj içeriği.
- **WhatsApp:** firmanın bağladığı WhatsApp oturumu üzerinden gönderilen mesajlar WhatsApp (Meta Platforms) altyapısıyla iletilir; alıcı telefon numarası ve mesaj içeriği bu kapsamda aktarılır.
- **Ödeme kuruluşu (iyzico):** firmanın bağladığı ödeme hesabı üzerinden tahsilat, iade ve depozito provizyonu için gereken ödeme ve alıcı bilgileri.
- **E-fatura özel entegratörü ve Gelir İdaresi Başkanlığı:** firma e-fatura özelliğini kullandığında fatura bilgileri.
- **Emniyet Genel Müdürlüğü (KABİS):** firma KABİS özelliğini kullandığında yasal araç kiralama bildirimi.
- **Satış kanalları (Yolcu360, Obilet):** firma bu kanalları bağladığında rezervasyonların karşılıklı iletilmesi için gereken bilgiler.
- **Bildirim hizmetleri:** mobil bildirimler için Expo ile Apple ve Google bildirim altyapısı; tarayıcı bildirimleri için tarayıcınızın bildirim hizmeti.
- **Hata izleme hizmeti (Sentry):** uygulama hatalarının tespiti için teknik hata kayıtları.
- **Sosyal giriş sağlayıcıları:** Google, Apple, Facebook veya GitHub ile giriş yapmayı seçtiğinizde, kimlik doğrulama için ilgili sağlayıcı.
- **Google Analytics:** bir firma kendi rezervasyon sitesine Google Analytics ölçüm kimliği eklerse, o sitenin ziyaret verileri IP anonimleştirmesiyle firmanın Google hesabına iletilir. Bu işlemin veri sorumlusu ilgili firmadır. Rentopya'nın kendi paneli ve web sitesi analiz aracı kullanmaz.
- **Yetkili kamu kurum ve kuruluşları:** kanunen yetkili mercilerin talebi hâlinde.

**Yurt dışına aktarım:** Yukarıdaki hizmet sağlayıcıların bir kısmının sunucuları yurt dışında (ör. ABD ve Avrupa Birliği) bulunabilir. Yurt dışına aktarım KVKK m.9'da öngörülen şartlara uygun olarak; yeterlilik kararı, standart sözleşme gibi uygun güvencelerden birinin bulunması veya bunların mümkün olmadığı hâllerde m.9/6'daki istisnai hâllerden birine dayanılarak gerçekleştirilir.

## 6. Saklama ve silme

Kişisel veriler, işleme amacının gerektirdiği süre ve ilgili mevzuattaki saklama süreleri boyunca saklanır, ardından silinir, yok edilir veya anonim hâle getirilir.

- **Platform hesabı:** Hesabınızı uygulamadan veya panelden sildiğinizde tüm oturumlarınız kapatılır ve hesap 30 gün içinde geri alınabilir. Bu sürenin sonunda giriş yöntemleriniz, oturumlarınız, cihaz kayıtlarınız, bildirimleriniz ve firma üyelikleriniz silinir; kullanıcı kaydınız anonim hâle getirilir ("Silinmiş kullanıcı"). Ayrıntılar [Hesap silme](/account/delete) sayfasındadır.
- **Firma kayıtları:** Kiralama, sözleşme, ödeme ve fatura gibi kayıtlar yasal saklama yükümlülükleri nedeniyle firmada kalır; bu kayıtlarda adınız yerine "Silinmiş kullanıcı" görünür.
- **Firmaların müşterileri:** Müşteri verileri, veri sorumlusu olan firmanın talimatları doğrultusunda saklanır. Firma bir müşteriyi anonimleştirdiğinde kişisel değerler silinir, yasal olarak saklanması gereken kiralama ve fatura kayıtları kişiyle ilişkilendirilmeden kalır.

## 7. Güvenlik

Verilerinizi korumak için makul teknik ve idari tedbirler uygularız. Örneğin:

- Tarayıcı, uygulama ve platform arasındaki iletişim şifreli bağlantı (HTTPS) üzerinden yapılır,
- Şifreler geri döndürülemez biçimde özetlenerek saklanır; kimlik ve ehliyet numaraları, entegrasyon erişim anahtarları ve hassas bildirim içerikleri şifrelenmiş olarak tutulur,
- Rol, şube ve yetki tabanlı erişim kontrolü uygulanır; her firma yalnızca kendi verilerine erişebilir,
- Platform destek ekibi bir firmanın verisine yalnızca firmanın açtığı, süreli destek erişimiyle girebilir,
- Hassas işlemler için yeniden kimlik doğrulama istenir ve önemli işlemler kayıt altına alınır.

## 8. Çerezler

Rentopya paneli yalnızca hizmetin çalışması için zorunlu çerezleri kullanır: oturumunuzu açık tutan ve güvenliği sağlayan oturum çerezleri ile arayüz tercihleriniz (ör. dil, kenar menüsünün açık veya kapalı olması). Reklam veya pazarlama amaçlı çerez kullanılmaz. Zorunlu çerezleri tarayıcı ayarlarından engellerseniz platforma giriş yapamayabilirsiniz. Firmaların rezervasyon sitelerinde firmanın eklediği analiz araçları ayrıca çerez kullanabilir.

## 9. Mobil uygulama izinleri

Rentopya mobil uygulaması yalnızca kullandığınız özellik için izin ister: kamera (QR ile giriş ve araç kontrol fotoğrafları), fotoğraf arşivi (fotoğraf veya belge eklemek) ve bildirimler. Uygulama cihaz konumunu, rehberinizi veya mikrofonunuzu kullanmaz. İzinleri cihaz ayarlarından istediğiniz zaman kapatabilirsiniz.

## 10. KVKK m.11 kapsamındaki haklarınız

KVKK m.11 uyarınca veri sorumlusuna başvurarak:

- Kişisel verilerinizin işlenip işlenmediğini öğrenme,
- İşlenmişse buna ilişkin bilgi talep etme,
- İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme,
- Yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme,
- Eksik veya yanlış işlenmişse düzeltilmesini isteme,
- KVKK m.7'de öngörülen şartlar çerçevesinde silinmesini veya yok edilmesini isteme,
- Düzeltme, silme ve yok etme işlemlerinin verilerin aktarıldığı üçüncü kişilere bildirilmesini isteme,
- İşlenen verilerin münhasıran otomatik sistemler vasıtasıyla analiz edilmesi suretiyle aleyhinize bir sonucun ortaya çıkmasına itiraz etme,
- Kanuna aykırı işleme sebebiyle zarara uğramanız hâlinde zararın giderilmesini talep etme

haklarına sahipsiniz.

## 11. Başvuru

Haklarınıza ilişkin taleplerinizi, kimliğinizi doğrulamamıza yetecek bilgilerle birlikte [contact@rentopya.app](mailto:contact@rentopya.app) adresine e-posta ile veya [Adres] adresine yazılı olarak iletebilirsiniz. Başvurunuz, talebin niteliğine göre en geç otuz gün içinde ücretsiz olarak sonuçlandırılır; işlemin ayrıca bir maliyet gerektirmesi hâlinde Kişisel Verileri Koruma Kurulu tarafından belirlenen tarife uygulanabilir.

Bir kiralama firmasının müşterisiyseniz ve talebiniz firmanın sizinle ilgili kayıtlarına ilişkinse, başvurunuzu doğrudan ilgili firmaya yapmanız gerekir; bize ulaşan bu tür talepleri ilgili firmaya yönlendiririz.

## 12. Değişiklikler

Bu metni zaman zaman güncelleyebiliriz. Güncel sürüm her zaman bu sayfada yayımlanır; sayfanın üst kısmındaki tarih son güncelleme tarihini gösterir.
$md$,
$md$This page explains how personal data is processed when you use the Rentopya platform: the rentopya.app website and management panel, the booking sites published for rental companies on *.rentopya.app, the customer portal and the Rentopya mobile app. The Turkish version is the binding version and also serves as the information notice under the Turkish Personal Data Protection Law No. 6698 ("KVKK").

## 1. Who we are and our role

Rentopya is operated by **Technowide Software** ("Rentopya", "we"), [Adres], MERSİS no [MERSİS no]. Contact: [contact@rentopya.app](mailto:contact@rentopya.app).

Rentopya is multi-company software that car rental companies use to run their fleet, reservations, rentals, contracts and accounting.

- For **platform users** (company owners, company staff and platform administrators who sign up), Rentopya is the **data controller**.
- For **customers of rental companies** (renters, drivers, employees of corporate customers, booking site visitors and people who fill in its forms), the **rental company you deal with is the data controller** and Rentopya acts as a **data processor** on its behalf and on its instructions. Each company's data is kept separate and is never shared with another company. Please contact the rental company first about this data.

## 2. Data we process

- **Platform users:** name, e-mail, language, account and sign-in data (password hash, passkeys, two-factor (TOTP) setup, one-time codes, company memberships, roles, branches and permissions, the account ID and e-mail shared by Google, Apple, Facebook or GitHub when you sign in with them), session and log data (IP address, device and browser, timestamps, activity records), push notification tokens and preferences, and company details (name, tax details, address, logo, branches, connected integration accounts whose credentials are stored encrypted). For QR sign-in, the approximate location (country, region, city) derived from the requesting browser's IP address is shown for your approval; your device location (GPS) is never collected.
- **Customers of rental companies and drivers:** name or company name, Turkish ID, passport or tax number, nationality, date of birth, phone, e-mail, billing address; driving licence number, class, dates and issuing country (ID and licence numbers are stored encrypted and shown masked); quotes, reservations and rentals (branches, times, vehicle and plate, extras, mileage and fuel, charges); handover and return inspections with vehicle and damage photos; contract text and hash, approval method, SMS verification codes, time, IP address and browser of the approval; payments, refunds, deposits and card pre-authorisations (card details are entered on the payment provider's page; Rentopya never stores card numbers, only masked facts such as card family and last four digits); e-invoice and e-archive invoice details; KABİS (police rental notification) data; HGS/OGS toll passes matched to rentals; SMS, WhatsApp and e-mail messages sent on the company's behalf and marketing consent records; customer portal sign-ins (reservation reference and one-time code) and change or cancel requests; contact, corporate, franchise and newsletter form entries on booking sites; and reservations received from sales channels such as Yolcu360 or Obilet when the company connects them.

## 3. Purposes and legal bases

We process data to provide and secure the platform; to let rental companies run fleet, pricing, reservations, rentals, handover and return, contracts, collections, deposits, invoices and reports; to check rental conditions such as age and licence years; to send reservation, payment link, contract code and reminder messages on the company's behalf; to meet legal duties such as rental notifications and e-invoicing on the company's behalf; to serve company booking sites and the customer portal; to provide support; and to meet legal obligations. Legal bases are those in KVKK Art. 5 (performance of a contract, legal obligation, establishing or defending rights, legitimate interest) and, where none applies, your explicit consent (for example, consent to marketing messages). We do not ask for special categories of personal data (KVKK Art. 6).

## 4. Sharing and transfers abroad

Data is shared only as needed with hosting, database and storage providers; the e-mail delivery provider; **Netgsm** for SMS sent through the company's account; **WhatsApp (Meta Platforms)** for WhatsApp messages sent through the company's session; **iyzico** for payments, refunds and deposit pre-authorisations through the company's account; the e-invoice private integrator and the Turkish Revenue Administration when the company uses e-invoicing; the General Directorate of Security (KABİS) when the company uses rental notifications; **Yolcu360** and **Obilet** when the company connects them; **Expo**, Apple and Google for mobile push notifications and your browser's push service for web push; **Sentry** for error monitoring; the social sign-in provider you choose; and authorities where legally required. If a company adds its own Google Analytics measurement ID to its booking site, visits to that site are sent to the company's Google account with IP anonymisation; the company is the controller for that. Rentopya's own panel and website use no analytics tools. Some providers may store data outside Türkiye (e.g. in the USA or the EU); such transfers follow KVKK Art. 9.

## 5. Retention and deletion

We keep data for as long as the purpose and the applicable statutory periods require, then delete, destroy or anonymise it. When you delete your platform account in the app or the panel, every session is signed out and the account can be restored for 30 days. After that, your sign-in methods, sessions, devices, notifications and company memberships are erased and your user record is anonymised ("Deleted user"); see [Account deletion](/en/account/delete). Rental, contract, payment and invoice records stay with the company because of legal retention duties and show "Deleted user" instead of your name. Customer data of rental companies is kept and deleted on the company's instructions; when a company anonymises a customer, the personal values are wiped and the records the law requires are kept without them.

## 6. Security

We use encrypted connections (HTTPS), hashed passwords, encryption for ID and licence numbers, integration credentials and sensitive notification content, role-, branch- and permission-based access control with strict separation between companies, time-limited support access that the company itself opens, re-authentication for sensitive actions and activity logs.

## 7. Cookies

The Rentopya panel only uses cookies that are strictly necessary: session cookies that keep you signed in and secure, and interface preferences (e.g. language, whether the sidebar is open). We do not use advertising or marketing cookies. Analytics tools a company adds to its own booking site may set their own cookies.

## 8. Mobile app permissions

The mobile app asks only for what the feature you use needs: the camera (QR sign-in and inspection photos), the photo library (adding photos or documents) and notifications. It does not use your device location, contacts or microphone. You can turn permissions off in your device settings at any time.

## 9. Your rights

Under KVKK Art. 11 you may ask whether your data is processed, request information, learn the purpose and recipients, request correction or deletion, object to solely automated decisions against you and claim compensation for unlawful processing. Send requests to [contact@rentopya.app](mailto:contact@rentopya.app). Customers of rental companies should contact the company directly; we forward such requests to it.
$md$
);

-- Terms of use.
INSERT INTO legal_pages (slug, title_tr, title_en, body_tr, body_en) VALUES (
'terms',
'Kullanım Koşulları',
'Terms of Use',
$md$Bu Kullanım Koşulları ("Koşullar"), Rentopya platformunu (rentopya.app web sitesi ve yönetim paneli, *.rentopya.app rezervasyon siteleri, müşteri portalı ve Rentopya mobil uygulaması) kullanımınızı düzenler. Platforma kayıt olarak veya platformu kullanarak bu Koşulları kabul etmiş olursunuz. Bir firma adına kayıt oluyorsanız, o firmayı temsile yetkili olduğunuzu da beyan edersiniz.

## 1. Taraflar

Rentopya platformu **Technowide Software** ("Rentopya", "biz") tarafından işletilmektedir. Platformu kullanan araç kiralama firması ile firmanın hesabını kullanan sahipleri ve çalışanları bu metinde "siz" veya "kullanıcı" olarak anılır.

## 2. Hizmetin tanımı

Rentopya, araç kiralama firmaları için bulut tabanlı bir yönetim platformudur. Şube ve filo yönetimi, fiyatlandırma, rezervasyon, kiralama, teslim/iade ve araç kontrolü, dijital sözleşme ve uzaktan onay, tahsilat ve depozito, cari ve kasa, e-fatura, KABİS bildirimi, HGS/OGS geçişleri, satış kanalı bağlantıları, raporlama, SMS, WhatsApp ve e-posta bildirimleri ile firmaya özel rezervasyon sitesi ve müşteri portalı gibi özellikler sunar. Kullanabileceğiniz özellikler firmanızın planına göre değişir.

Hizmeti geliştirmek için özellikleri zaman zaman değiştirebilir, ekleyebilir veya kaldırabiliriz. Bir özelliğin kapatılması kayıtlarınızı silmez.

## 3. Hesap ve güvenlik

- Kayıt sırasında verdiğiniz bilgilerin doğru ve güncel olmasından siz sorumlusunuz.
- Giriş bilgilerinizin gizliliğini korumak ve yetkisiz bir erişimi fark ettiğinizde bize bildirmek sizin sorumluluğunuzdadır.
- Firma hesabına eklediğiniz çalışanlara hangi rol, şube ve yetkilerin verileceğini siz belirlersiniz; bu kullanıcıların hesap üzerindeki işlemlerinden firma sorumludur.
- Bir firmanın her zaman en az bir sahibi bulunur. Tek sahip olduğunuz firma varken hesabınızı silmeden önce sahipliği başka bir ekip üyesine devretmeniz gerekir.

## 4. Kullanım kuralları

Platformu kullanırken aşağıdakileri yapmamayı kabul edersiniz:

- Yürürlükteki mevzuata veya üçüncü kişilerin haklarına aykırı işlem yapmak,
- Rızası veya başka bir hukuki dayanağı bulunmayan kişilere ileti göndermek, platformu istenmeyen ileti (spam) için kullanmak,
- Başka bir firmanın verilerine erişmeye çalışmak, güvenlik önlemlerini aşmak veya platformun işleyişini bozacak faaliyette bulunmak,
- Zararlı yazılım yüklemek, platformu veya rezervasyon sitelerini izinsiz olarak otomatik araçlarla taramak veya kopyalamak,
- Platformu lisanslamak, yeniden satmak ya da izinsiz olarak üçüncü kişilerin kullanımına sunmak.

SMS, WhatsApp, ödeme, e-fatura ve satış kanalı hesaplarınızı kullanırken ilgili sağlayıcıların kurallarına uymak da sizin sorumluluğunuzdadır.

## 5. Firma yükümlülükleri

Rentopya, kiralama süreçlerinizi yürütmeniz için araç sağlar; kiralama sözleşmesinin tarafı değildir. Kiralama koşullarınızın, sözleşme şablonlarınızın, fiyatlarınızın, faturalarınızın ve yasal bildirimlerinizin doğruluğu ile mevzuata uygunluğundan firma sorumludur. Platform bir bildirimin veya faturanın sonucunu doğrulayamadığında bunu size gösterir ve işlemi kendiliğinden yeniden göndermez; bu durumları takip etmek sizin sorumluluğunuzdadır.

## 6. Ücretler ve erişim süresi

Planlar, ücretler ve erişim süresi firmanızla yapılan teklif veya sözleşmede belirlenir. Erişim süresi sona erdiğinde ve uzatılmadığında firma paneline erişim durur; kayıtlarınız silinmez.

Fiyatları ileriye dönük olarak değiştirebiliriz; değişiklik, bedeli ödenmiş mevcut dönemi etkilemez.

## 7. Verileriniz ve gizlilik

Platforma girdiğiniz firma verileri size aittir. Bu verileri yalnızca hizmeti sunmak, güvenliğini sağlamak ve hukuki yükümlülüklerimizi yerine getirmek amacıyla işleriz.

Kişisel verilerin nasıl işlendiği ve 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") kapsamındaki haklarınız [Gizlilik Politikası ve KVKK Aydınlatma Metni](/privacy) sayfasında açıklanmıştır.

Müşterilerinize ve sürücülerinize ait veriler bakımından veri sorumlusu firmanızdır. Müşterilerinizi aydınlatmak ve gerekli hukuki dayanakları (ör. ticari ileti onayı) sağlamak sizin sorumluluğunuzdadır.

## 8. Fikri mülkiyet

Platformun yazılımı, tasarımı, markası ve içerikleri Rentopya'ya veya lisans verenlerine aittir. Bu Koşullar size, erişim süresince platformu kendi firmanız için kullanma yönünde sınırlı, devredilemez ve münhasır olmayan bir hak verir; başka bir hak devri anlamına gelmez. Rezervasyon sitenize yüklediğiniz logo, görsel ve metinlerin haklarından siz sorumlusunuz.

## 9. Üçüncü taraf hizmetleri

Platformun bazı özellikleri ödeme kuruluşları, SMS ve e-posta sağlayıcıları, WhatsApp, e-fatura entegratörü, satış kanalları, kamu sistemleri ve sosyal giriş sağlayıcıları gibi üçüncü taraf hizmetlerine dayanır. Bu hizmetlerin kesintilerinden, kural veya fiyat değişikliklerinden doğan sonuçları kontrol edemeyiz.

## 10. Hizmet seviyesi ve sorumluluğun sınırı

Hizmeti sürekli ve güvenli biçimde sunmak için makul çabayı gösteririz; ancak hizmetin kesintisiz veya hatasız olacağını garanti etmeyiz. Bakım, güncelleme veya kontrolümüz dışındaki nedenlerle hizmet geçici olarak kesintiye uğrayabilir.

Hizmet "olduğu gibi" sunulur. Yürürlükteki mevzuatın izin verdiği ölçüde Rentopya; kâr kaybı, iş kaybı, veri kaybı gibi dolaylı zararlardan ve platforma girilen bilgilerin doğruluğundan sorumlu değildir. Kastımızdan veya ağır kusurumuzdan doğan sorumluluk ile mevzuatın emredici hükümleri saklıdır.

## 11. Askıya alma ve fesih

Hizmeti kullanmayı dilediğiniz zaman bırakabilirsiniz. Kullanıcı hesabınızı uygulamadaki veya paneldeki profil sayfasından silebilirsiniz ([Hesap silme](/account/delete)); firmanın kapatılması için bize yazın.

Bu Koşulların ihlali, platformun güvenliğini tehdit eden bir durum veya hukuki bir zorunluluk hâlinde firmanın veya kullanıcının erişimini askıya alabilir ya da sözleşmeyi feshedebiliriz. Fesih sonrasında verilerin saklanması ve silinmesi [Gizlilik Politikası](/privacy) ile ilgili mevzuata tabidir.

## 12. Değişiklikler

Bu Koşulları zaman zaman güncelleyebiliriz. Güncel sürüm her zaman bu sayfada yayımlanır; sayfanın üst kısmındaki tarih son güncelleme tarihini gösterir. Değişikliklerden sonra platformu kullanmaya devam etmeniz güncel Koşulları kabul ettiğiniz anlamına gelir.

## 13. Uygulanacak hukuk

Bu Koşullara Türkiye Cumhuriyeti hukuku uygulanır. Tüketicilerin ve diğer ilgililerin emredici hükümlerden doğan hakları saklıdır.

## 14. İletişim

Bu Koşullarla ilgili sorularınız için [contact@rentopya.app](mailto:contact@rentopya.app) adresine yazabilirsiniz.
$md$,
$md$These Terms of Use ("Terms") govern your use of the Rentopya platform: the rentopya.app website and management panel, the *.rentopya.app booking sites, the customer portal and the Rentopya mobile app. By signing up or using the platform you accept these Terms. If you sign up on behalf of a company, you also confirm that you are authorised to represent it. The Turkish version is the binding version.

## 1. Parties

Rentopya is operated by **Technowide Software** ("Rentopya", "we"). The car rental company that uses the platform, along with the owners and staff who use its account, is referred to as "you" or the "user".

## 2. The service

Rentopya is a cloud-based management platform for car rental companies. It offers branches and fleet, pricing, reservations, rentals, handover, return and inspections, digital contracts and remote approval, collections and deposits, ledgers and cash books, e-invoicing, KABİS rental notifications, HGS/OGS toll passes, sales channel connections, reports, SMS, WhatsApp and e-mail notifications, and a branded booking site and customer portal for each company. The features available to you depend on your company's plan.

We may change, add or remove features from time to time to improve the service. Turning a feature off does not delete your records.

## 3. Account and security

- You are responsible for keeping the information you provide accurate and up to date.
- You are responsible for keeping your sign-in details confidential and for telling us if you notice unauthorised access.
- You decide which roles, branches and permissions staff on your company account receive; the company is responsible for what those users do on the account.
- A company always has at least one owner. If you are the only owner of a company, hand ownership to another team member before deleting your account.

## 4. Acceptable use

You agree not to:

- Act against applicable law or the rights of third parties,
- Message people without their consent or another legal basis, or use the platform for spam,
- Try to access another company's data, bypass security measures or disrupt the platform,
- Upload malicious software, or scrape or copy the platform or booking sites with automated tools without permission,
- License or resell the platform, or make it available to third parties without permission.

When you use your SMS, WhatsApp, payment, e-invoice and sales channel accounts, you are also responsible for following the rules of those providers.

## 5. Company responsibilities

Rentopya gives you tools to run your rental business; it is not a party to your rental agreements. The company is responsible for the accuracy and legal compliance of its rental conditions, contract templates, prices, invoices and legal notifications. When the platform cannot confirm the outcome of a notification or invoice, it shows this to you and does not resend it on its own; following up on such cases is your responsibility.

## 6. Fees and access period

Plans, fees and the access period are set in the offer or agreement with your company. When the access period ends and is not extended, access to the company panel stops; your records are not deleted.

We may change prices for future periods; a change does not affect a period you have already paid for.

## 7. Your data and privacy

The company data you enter into the platform is yours. We process it only to provide and secure the service and to meet our legal obligations.

How personal data is processed, and your rights under the Turkish Personal Data Protection Law No. 6698 ("KVKK"), are explained in the [Privacy Policy](/en/privacy).

Your company is the data controller for your customers' and drivers' data. You are responsible for informing your customers and having the required legal basis (for example, consent to marketing messages).

## 8. Intellectual property

The platform's software, design, brand and content belong to Rentopya or its licensors. These Terms give you a limited, non-transferable, non-exclusive right to use the platform for your own company during the access period; they do not transfer any other right. You are responsible for the rights to the logos, images and texts you upload to your booking site.

## 9. Third-party services

Some features rely on third-party services such as payment providers, SMS and e-mail providers, WhatsApp, the e-invoice integrator, sales channels, public systems and social sign-in providers. We cannot control the effects of outages or of rule or price changes at these services.

## 10. Service level and limitation of liability

We make reasonable efforts to keep the service available and secure, but we do not guarantee that it will be uninterrupted or error-free. The service may be temporarily unavailable because of maintenance, updates or causes beyond our control.

The service is provided "as is". To the extent permitted by applicable law, Rentopya is not liable for indirect damages such as lost profit, lost business or lost data, or for the accuracy of information entered into the platform. Liability for our intent or gross negligence and mandatory provisions of law remain unaffected.

## 11. Suspension and termination

You can stop using the service at any time. You can delete your user account from the profile page in the app or the panel ([Account deletion](/en/account/delete)); write to us to close a company.

We may suspend access for a company or a user, or terminate the agreement, if these Terms are breached, if the platform's security is at risk, or if the law requires it. After termination, retention and deletion of data are subject to the [Privacy Policy](/en/privacy) and applicable law.

## 12. Changes

We may update these Terms from time to time. The current version is always published on this page, and the date at the top shows when it was last updated. By continuing to use the platform after a change, you accept the updated Terms.

## 13. Governing law

These Terms are governed by the laws of the Republic of Türkiye. Rights of consumers and others under mandatory provisions of law remain unaffected.

## 14. Contact

For questions about these Terms, write to [contact@rentopya.app](mailto:contact@rentopya.app).
$md$
);

-- Account deletion guide (App Store 5.1.1(v), Google Play account deletion
-- URL). Mirrors docs/design/account-deletion.md; the page adds a sign-in
-- button below the text.
INSERT INTO legal_pages (slug, title_tr, title_en, body_tr, body_en) VALUES (
'account-deletion',
'Hesap Silme',
'Account Deletion',
$md$Rentopya kullanıcı hesabınızı dilediğiniz zaman kendiniz silebilirsiniz. Silme işlemi Rentopya mobil uygulamasından veya web panelinden yapılır.

## Mobil uygulamadan

1. Rentopya uygulamasında **Menü** sekmesini açın.
2. **Hesap** bölümünde adınıza dokunun ve **Hesap ve güvenlik** ekranına gidin.
3. **Hesabı sil** seçeneğine dokunun.
4. E-posta adresinize gönderilen 6 haneli kodla veya şifrenizle onaylayın.

## Web panelinden

1. [rentopya.app/platform/login](https://rentopya.app/platform/login) adresinden giriş yapın.
2. Hesap menüsünden **Profil** sayfasını açın.
3. **Hesabı sil** düğmesine basın ve e-postanıza gönderilen kodla onaylayın.

## Silme sonrasında ne olur?

- Tüm cihazlardaki oturumlarınız kapatılır, mobil ve tarayıcı bildirim kayıtlarınız silinir ve hesabınızla giriş yapılamaz.
- Size, hesabın silineceği tarihi ve geri alma bağlantısını içeren bir e-posta göndeririz.
- **30 gün** içinde e-postadaki bağlantıyla hesabınızı geri alabilirsiniz.
- 30 günün sonunda hesabınız kalıcı olarak silinir: giriş yöntemleriniz (şifre, passkey, Google, Apple ve diğer bağlantılar), iki adımlı doğrulama kaydınız, oturumlarınız, cihazlarınız, bildirimleriniz ve firma üyelikleriniz silinir; ad ve e-posta adresiniz kullanıcı kaydından kaldırılır. Bu işlem geri alınamaz.

## Saklanan kayıtlar

Firmaların kiralama, rezervasyon, sözleşme, ödeme, fatura ve işlem kayıtları yasal saklama yükümlülükleri nedeniyle silinmez; bu kayıtlarda adınız yerine "Silinmiş kullanıcı" görünür.

## Hesabınızı silemiyorsanız

- Bir firmanın tek sahibiyseniz, önce panelde **Ayarlar → Üyeler** bölümünden sahipliği başka bir ekip üyesine devredin veya firmanın kapatılması için bize yazın.
- Giriş yapamıyorsanız, hesabınızın e-posta adresinden [contact@rentopya.app](mailto:contact@rentopya.app) adresine silme talebinizi iletin.

Bir kiralama firmasının müşterisiyseniz (Rentopya kullanıcı hesabınız yoksa), sizinle ilgili kayıtlar o firmaya aittir. Silme talebinizi doğrudan firmaya iletin.
$md$,
$md$You can delete your Rentopya user account yourself at any time, from the Rentopya mobile app or the web panel.

## In the mobile app

1. Open the **Menu** tab in the Rentopya app.
2. In the **Account** section, tap your name to open **Account and security**.
3. Tap **Delete account**.
4. Confirm with the 6-digit code sent to your e-mail address or with your password.

## In the web panel

1. Sign in at [rentopya.app/platform/login](https://rentopya.app/platform/login).
2. Open **Profile** from the account menu.
3. Press **Delete account** and confirm with the code sent to your e-mail.

## What happens next

- You are signed out on every device, your mobile and browser push registrations are removed and the account can no longer sign in.
- We send you an e-mail with the date the account will be erased and a restore link.
- You can restore the account with that link for **30 days**.
- After 30 days the account is permanently deleted: your sign-in methods (password, passkeys, Google, Apple and other links), two-factor setup, sessions, devices, notifications and company memberships are erased, and your name and e-mail address are removed from the user record. This cannot be undone.

## Records that are kept

Rental, reservation, contract, payment, invoice and activity records of the companies are not deleted because of legal retention duties; they show "Deleted user" instead of your name.

## If you cannot delete your account

- If you are the only owner of a company, first hand ownership to another team member under **Settings → Members** in the panel, or write to us to close the company.
- If you cannot sign in, send your deletion request from the account's e-mail address to [contact@rentopya.app](mailto:contact@rentopya.app).

If you are a customer of a rental company (and have no Rentopya user account), the records about you belong to that company. Send your deletion request to the company directly.
$md$
);

-- Permissions: super_admin edits the pages.
INSERT INTO permissions (name, slug) VALUES
    ('Read legal pages', 'platform.legal.read'),
    ('Write legal pages', 'platform.legal.write')
ON CONFLICT (slug) DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.slug IN ('platform.legal.read', 'platform.legal.write')
WHERE r.slug = 'super_admin' AND r.scope = 'platform'
ON CONFLICT DO NOTHING;
