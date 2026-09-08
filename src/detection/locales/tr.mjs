/**
 * Locale pack — Turkish phone fraud.
 *
 * A locale pack is pure data. `detector.mjs` folds and compiles it. Adding a
 * country = adding one of these files, never touching the engine.
 *
 *   signals[]         { id, label, severity, weight, category?, guardAgainstAdvice?, anyOf[][] }
 *                     category defaults to 'scam'; 'threat' / 'harassment' mark
 *                     the non-fraud abuse signals (the engine reports the
 *                     dominant category so the app can say "tehdit" not "dolandırıcılık").
 *   benignMarkers[]   phrases a *legitimate* caller uses (halve a borderline score)
 *   adviceMarkers[]   "never share your code" — protective advice, not a request
 *   explicitRequest[] "read me the code" — always beats adviceMarkers
 *   hotWords[]        scam-critical vocabulary, boosted in the STT ("keyterm")
 *
 * Signal ids are shared across every locale so the policy (ELICIT questions),
 * metrics and the app UI stay language-independent.
 */
export const code = 'tr';

export const signals = [
  {
    id: 'otp_request',
    label: 'Tek kullanımlık şifre / kod talebi',
    severity: 'high',
    weight: 32,
    guardAgainstAdvice: true,
    anyOf: [
      ['telefonunuza gelen', 'kod'], ['gelen kodu'], ['sms kodu'],
      ['doğrulama kodu'], ['onay kodu'], ['tek kullanımlık şifre'],
      ['kodu söyle'], ['kodu okuyun'], ['kodu iletin'], ['şifreyi söyle'],
      ['kodu bana'], ['şifreyi bana'], ['şifreyi iletin'], ['şifreyi okuyun'],
      ['şifre gelecek'], ['kod gelecek'], ['bir şifre gelecek'], ['bir kod gelecek'],
      ['gelen şifre'], ['şifre', 'söyler misiniz'], ['kod', 'söyler misiniz'],
      ['kod', 'okur musunuz'], ['şifre', 'okur musunuz'],
      ['şifresini söyle'], ['şifresini ver'], ['şifreni söyle'], ['şifreni ver'],
      ['şifrenizi söyle'], ['şifrenizi ver'], ['şifrenizi girin'],
      ['kart şifre'], ['kartınızın şifresi'], ['kartın şifresi'], ['pin', 'söyle'],
      ['şifre', 'paylaş'], ['kod', 'paylaş'],
      ['sms', 'okuyun'], ['sms', 'okur musunuz'], ['sms', 'söyler misiniz'],
      ['sms', 'söyleyin'], ['mesajdaki numara'], ['mesajdaki kod'],
      ['mesajdaki şifre'], ['mesaja gelen'], ['gelen numarayı'],
      ['içindeki numara'], ['içindeki kod'], ['telefonunuza gelen', 'numara'],
      ['telefonunuza gelen', 'okuyun'], ['size gelen', 'okuyun'],
      ['şifreni istiyor'], ['şifrenizi istiyor'], ['şifreni rica'],
      ['şifren ne'], ['şifreniz ne'], ['şifreniz nedir'], ['şifreni öğren'],
      ['banka şifre'], ['bankacılık şifre'], ['internet şifre'], ['mobil şifre'],
      ['şifre', 'lazım'], ['şifre', 'gerekiyor'], ['pin', 'lazım'],
    ],
  },
  {
    id: 'bank_impersonation',
    label: 'Kendini banka görevlisi olarak tanıtma',
    severity: 'high',
    weight: 24,
    anyOf: [
      ['bankası güvenlik'], ['güvenlik biriminden arıyorum'],
      ['güvenlik biriminden'], ['hesabınızda şüpheli'],
      ['şüpheli işlem tespit'], ['şüpheli bir işlem tespit'],
      ['kart bilgileriniz'], ['hesabınız risk altında'], ['hesabınız bloke'],
      ['yurt dışı', 'işlem'], ['yurtdışı', 'işlem'], ['yurt dışında', 'işlem'],
      ['işlem denendi'], ['yetkisiz işlem'], ['izinsiz işlem'],
      ['şüpheli giriş'], ['hesabınıza giriş denendi'], ['hesabınıza giriş yapıl'],
      ['kartınızdan', 'çekil'], ['adınıza kart çıkar'], ['adınıza kredi çek'],
    ],
  },
  {
    id: 'authority_impersonation',
    label: 'Kendini savcı / polis / MASAK olarak tanıtma',
    severity: 'high',
    weight: 26,
    anyOf: [
      ['masak'], ['savcı'], ['savcılık'], ['emniyet'], ['siber suçlar'],
      ['hakkınızda soruşturma'], ['gizlilik kararı'], ['ifadeniz alınacak'],
      ['adınıza kayıtlı hesap'], ['para aklama'],
    ],
  },
  {
    id: 'money_transfer',
    label: 'Para transferi / "güvenli hesap" talebi',
    severity: 'high',
    weight: 26,
    anyOf: [
      ['güvenli hesaba'], ['güvenli hesap'], ['devlet hesabına'],
      ['emanet hesab'], ['para transfer'], ['parayı transfer'],
      ['transfer edin'], ['havale yap'], ['eft yap'], ['iban', 'gönder'],
      ['iban', 'aktar'], ['hesaba yatır'], ['para gönder'], ['lira gönder'],
      ['parayı aktar'], ['paranızı aktar'],
    ],
  },
  {
    id: 'remote_access',
    label: 'Uzaktan erişim uygulaması kurdurma',
    severity: 'high',
    weight: 28,
    anyOf: [
      ['anydesk'], ['teamviewer'], ['uzaktan bağlan'], ['ekranınızı paylaş'],
      ['ekranınızı göreb'], ['destek uygulaması'],
    ],
  },
  {
    id: 'card_details',
    label: 'Kart numarası / CVV talebi',
    severity: 'high',
    weight: 22,
    guardAgainstAdvice: true,
    anyOf: [
      ['kart numara'], ['kartın numarası'], ['cvv'], ['güvenlik kodu', 'kart'],
      ['kartın arkasındaki'], ['16 haneli'],
      ['kart bilgi'], ['kart bilgileri'], ['kart bilgileriniz'],
      ['kredi kart bilgi'], ['kartınızın bilgi'], ['son kullanma tarih', 'kart'],
    ],
  },
  {
    id: 'urgency_threat',
    label: 'Zaman baskısı / tehdit',
    severity: 'medium',
    weight: 16,
    anyOf: [
      ['hemen'], ['acil'], ['acele'], ['son dakika'], ['son gün'],
      ['aksi halde'], ['aksi takdirde'], ['hesabınız kapat'], ['gözaltına'],
      ['dakika içinde'], ['24 saat içinde'],
      ['işlem iptal olacak'], ['iptal olacak'], ['zaman aşımına'],
      ['geç kalmadan'], ['vakit kaybetme'], ['şimdi yapmazsanız'],
      ['bloke olacak'], ['bloke edilecek'],
    ],
  },
  {
    id: 'secrecy',
    label: '"Kimseye söyleme" baskısı',
    severity: 'medium',
    weight: 16,
    anyOf: [
      ['kimseye söyleme'], ['kimseye söylemeyin'], ['kimseye anlatma'],
      ['gizli tut'], ['gizli tutun'], ['bankayı arama'], ['bankayı aramayın'],
      ['telefonu kapatma'], ['hatta kal'], ['başkasını aramayın'],
    ],
  },
  {
    id: 'relative_emergency',
    label: '"Yakınınız başı belada" senaryosu',
    severity: 'medium',
    weight: 20,
    anyOf: [
      ['oğlunuz'], ['kızınız'], ['kaza yaptı'], ['kaza yaptım'], ['hastanede'],
      ['tutuklandı'], ['gözaltına alındı'], ['anne benim'], ['baba benim'],
      ['telefonum kırıldı'], ['başkasının telefonundan'],
    ],
  },
  {
    id: 'crypto_investment',
    label: 'Garantili yatırım / kripto vaadi',
    severity: 'medium',
    weight: 18,
    anyOf: [
      ['garantili getiri'], ['garantili kazanç'], ['kripto fırsat'],
      ['yatırım fırsat'], ['aylık yüzde', 'getiri'], ['kazanç garanti'],
      ['borsa tüyo'],
    ],
  },
  {
    id: 'cargo_ransom',
    label: 'Sahte kargo / gümrük ücreti',
    severity: 'medium',
    weight: 16,
    anyOf: [
      ['gümrükte bekliyor'], ['gümrük ücreti'], ['gümrükte tutul'],
      ['teslimat ücreti'], ['ek ücret öde'], ['paketiniz iade'],
      ['ithalat vergisi'], ['kargo ücreti öde'],
    ],
  },
  {
    id: 'prize_bait',
    label: 'Sahte ödül / çekiliş',
    severity: 'low',
    weight: 10,
    anyOf: [
      ['tebrikler kazand'], ['çekiliş kazand'], ['hediye çeki kazand'],
      ['ödülünüzü almak için'],
    ],
  },
  {
    id: 'task_job_scam',
    label: 'Görev bazlı kolay para kazanma dolandırıcılığı',
    severity: 'medium',
    weight: 20,
    anyOf: [
      ['görev yaparak kazan'], ['günlük görev'], ['ürün beğenerek kazan'],
      ['yorum yaparak kazan'], ['telegram üzerinden görev'],
      ['whatsapp üzerinden görev'], ['ön ödeme yaparak görev'],
      ['üyelik ücreti yatır'], ['grup lideriniz'], ['görev linkine tıkla'],
      ['takip görevleri'], ['günlük kazanç garantili'],
    ],
  },
  {
    id: 'tech_support_scam',
    label: 'Sahte teknik destek / virüs uyarısı',
    severity: 'high',
    weight: 24,
    anyOf: [
      ['bilgisayarınızda virüs'], ['bilgisayarınız hacklendi'],
      ['sisteminize sızıl'], ['microsoft destek'], ['windows güvenlik'],
      ['bilgisayarınıza uzaktan bağlan'], ['teknik ekibimiz bağlanacak'],
      ['cihazınızda güvenlik açığı'], ['virüs tespit edildi'],
    ],
  },
  {
    id: 'romance_scam',
    label: 'Romantizm / duygusal manipülasyon dolandırıcılığı',
    severity: 'medium',
    weight: 18,
    anyOf: [
      ['seni seviyorum', 'para'], ['yurt dışındayım', 'para'],
      ['aramızda kalsın', 'para gönder'], ['seninle evlenmek istiyorum'],
      ['gümrükte hediye paketim'], ['askerdeyim', 'para gönder'],
      ['platform ücreti', 'aşk'], ['seni görmeye gelecektim ama'],
    ],
  },
  {
    id: 'fake_loan_credit',
    label: 'Sahte kredi / limit artırma dolandırıcılığı',
    severity: 'medium',
    weight: 20,
    anyOf: [
      ['krediniz onaylandı'], ['limit artırma', 'ücret'],
      ['ön ödemesiz kredi'], ['kredi masrafı yatır'], ['kredi dosya ücreti'],
      ['faizsiz kredi fırsatı'], ['kredi puanınız yükseltildi'],
    ],
  },
  {
    id: 'sim_swap_request',
    label: 'SIM kart değişikliği / hat taşıma tuzağı',
    severity: 'high',
    weight: 26,
    anyOf: [
      ['sim kartınızı değiştir'], ['hattınızı yeni cihaza taşı'],
      ['sim kart yenileme'], ['operatör', 'sim değişim'],
      ['numaranızı yeni hatta aktar'], ['e-sim aktivasyon kodu'],
    ],
  },
  {
    id: 'fake_court_fine',
    label: 'Sahte trafik cezası / icra borcu tehdidi',
    severity: 'high',
    weight: 22,
    anyOf: [
      ['ödenmemiş cezanız'], ['trafik cezanız'], ['icra takibi başlat'],
      ['haciz gelecek'], ['borcunuz nedeniyle'], ['mahkemeye çıkacaksınız'],
      ['infaz', 'ödeme'], ['icra dairesi'],
    ],
  },
  {
    id: 'charity_disaster_scam',
    label: 'Sahte bağış / afet yardımı dolandırıcılığı',
    severity: 'medium',
    weight: 16,
    anyOf: [
      ['deprem bağışı'], ['afet yardımı toplu'], ['bağış hesabına'],
      ['yardım kampanyasına destek'], ['mağdurlara ulaştırılacak'],
    ],
  },
  {
    id: 'impersonation_new_number',
    label: 'Yeni numaram — çalıntı hesap taklidi',
    severity: 'high',
    weight: 22,
    anyOf: [
      ['yeni numaramdan yazıyorum'], ['telefonum değişti'],
      ['eski numaramı kaybettim'], ['bu numaradan ulaşıyorum artık'],
      ['whatsapp hesabım değişti'], ['acil paraya ihtiyacım var', 'yeni'],
    ],
  },
  {
    id: 'subscription_cancel_scam',
    label: 'Sahte abonelik yenileme / iptal dolandırıcılığı',
    severity: 'low',
    weight: 12,
    anyOf: [
      ['aboneliğiniz yenilenecek'], ['üyeliğinizi iptal etmek için kart'],
      ['otomatik ödeme talimatı'], ['iptal etmezseniz tahsilat'],
    ],
  },
  {
    id: 'fake_job_offer_upfront_fee',
    label: 'Sahte iş teklifi / peşin ücret dolandırıcılığı',
    severity: 'medium',
    weight: 18,
    anyOf: [
      ['işe alındınız', 'ücret'], ['evrak masrafı yatır'],
      ['malzeme ücreti yatır'], ['kontenjan ücreti'], ['staj ücreti öde'],
      ['garantili iş, önce'],
    ],
  },

  // ── non-fraud abuse ──────────────────────────────────────────────────────
  // These are not "how likely is this a scam" — they're "this call is abusive".
  // High weights + the threat bonus in detector._compute() mean one clear line
  // is enough to arm recording so the user has evidence.
  {
    id: 'threat_intimidation',
    label: 'Tehdit / gözdağı',
    severity: 'high',
    weight: 34,
    category: 'threat',
    anyOf: [
      ['seni bulurum'], ['seni bulacağım'], ['adresini biliyorum'],
      ['nerede oturduğunu biliyorum'], ['evini biliyorum'], ['pişman olacaksın'],
      ['pişman edeceğim'], ['canına okurum'], ['canını yakarım'],
      ['gününü göreceksin'], ['seni mahvederim'], ['seni bitiririm'],
      ['ailene zarar'], ['çocuğuna zarar'], ['kafana sıkarım'],
      ['ölmek mi istiyorsun'], ['seni gebertir'], ['leşini sererim'],
      ['bacaklarını kırarım'], ['üstüne adam gönderirim'], ['adam göndereceğim'],
      ['dört köşe olursun'], ['tehdit ediyorum'], ['son uyarım'],
    ],
  },
  {
    id: 'sextortion_blackmail',
    label: 'Şantaj / özel görüntü tehdidi',
    severity: 'high',
    weight: 38,
    category: 'threat',
    anyOf: [
      ['görüntülerini yayınlarım'], ['görüntülerin elimde'], ['fotoğrafların elimde'],
      ['videoyu herkese'], ['videonu yayarım'], ['ifşa ederim'], ['ifşa edeceğim'],
      ['herkese gönderirim'], ['ailene gönderirim'], ['eşine gönderirim'],
      ['patronuna gönderirim'], ['rezil ederim'], ['ekran görüntüsü aldım'],
      ['kamerana eriştim'], ['telefonunu hackledim'], ['para göndermezsen', 'yayın'],
      ['ödemezsen', 'ifşa'], ['bitcoin', 'yoksa'], ['kripto', 'yoksa ifşa'],
    ],
  },
  {
    id: 'harassment_abuse',
    label: 'Taciz / hakaret / ısrarlı rahatsız etme',
    severity: 'high',
    weight: 28,
    category: 'harassment',
    anyOf: [
      ['seni rahat bırakmayacağım'], ['seni aramaya devam edeceğim'],
      ['istediğim kadar ararım'], ['engelle beni yine ararım'],
      ['numaramı değiştirir yine ararım'], ['peşini bırakmam'],
      ['her gün arayacağım'], ['gece gündüz ararım'],
      ['sürekli arayacağım'], ['defalarca aradım daha da ararım'],
      ['seni takip ediyorum'], ['nereye gitsen'], ['seni izliyorum'],
      ['orospu'], ['şerefsiz'], ['sürtük'], ['piç'], ['aşağılık'],
      ['sana küfür'], ['hakaret etmek için aradım'],
    ],
  },
  {
    id: 'debt_collection_abuse',
    label: 'Yasadışı borç tahsilat baskısı',
    severity: 'medium',
    weight: 22,
    category: 'harassment',
    anyOf: [
      ['borcunu ödemezsen', 'işyerini arar'], ['patronunu ararım'],
      ['iş yerini ararım'], ['komşularını ararım'], ['akrabalarını ararım'],
      ['tüm rehberini ararım'], ['herkese borçlu olduğunu'],
      ['evine icra', 'bugün'], ['kapına dayanırım'], ['eşyalarına el koyarım'],
      ['gece yarısı arıyorum çünkü'], ['istediğim saatte ararım'],
      ['borç yüzünden', 'rezil'], ['tahsilat için ne gerekiyorsa'],
    ],
  },
];

export const benignMarkers = [
  'randevunuzu hatırlat', 'randevu hatırlatma', 'rezervasyon',
  'işlem yapmanıza gerek yok', 'sadece bilgilendirme',
  'bilgilendirme aramasıdır', 'kampanya hakkında', 'anket', 'geri bildirim',
  'toplantı saati', 'siparişiniz hazır', 'kurye', 'kapınızdayım',
  'kapıyı açan olmadı',
];

export const adviceMarkers = [
  'paylaşmayın', 'paylaşmayınız', 'vermeyin', 'söylemeyin', 'girmeyin',
  'kimseyle paylaş', 'kimseye vermeyin', 'kimseye söylemeyin', 'bankamız dahil',
  'dahil kimseye', 'asla paylaşmayın', 'kimseyle paylaşmanız',
];

export const explicitRequest = [
  'bana söyle', 'bana verin', 'bana ilet', 'bana oku', 'bana yaz',
  'kodu okuyun', 'kodu iletin', 'kodu söyleyin', 'kodu yazın',
  'bize iletin', 'bize söyleyin', 'benimle paylaş',
  'numarayı okuyun', 'numarayı söyleyin', 'numarayı iletin',
  'içindeki numarayı', 'mesajdaki numarayı', 'gelen numarayı',
];

export const hotWords = [
  'MASAK', 'IBAN', 'EFT', 'havale', 'CVV', 'doğrulama kodu', 'onay kodu',
  'tek kullanımlık şifre', 'güvenlik kodu', 'güvenli hesap', 'emanet hesap',
  'para transferi', 'savcılık', 'Cumhuriyet Savcısı', 'gizlilik kararı',
  'para aklama', 'AnyDesk', 'TeamViewer', 'uzaktan bağlantı', 'gümrük',
  'kargo ücreti', 'kripto', 'garantili getiri', 'gözaltı', 'hesabınız bloke',
  'kart numarası', 'şüpheli işlem', 'kimseye söyleme',
];
