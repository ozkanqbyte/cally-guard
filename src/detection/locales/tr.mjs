/**
 * Locale pack — Turkish phone fraud.
 *
 * A locale pack is pure data. `detector.mjs` folds and compiles it. Adding a
 * country = adding one of these files, never touching the engine.
 *
 *   signals[]         { id, label, severity, weight, guardAgainstAdvice?, anyOf[][] }
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
