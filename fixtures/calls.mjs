/**
 * Canonical call transcripts used by every test and the demo.
 *
 * Each entry is a list of *caller* utterances in order. The five scam scripts
 * are the fraud patterns that dominate reports in Turkey; the legitimate ones
 * are the calls a naive keyword filter would wrongly flag (a bank reminder, a
 * real courier at the door, a clinic confirming an appointment).
 */

/** @type {Record<string, string[]>} */
export const SCAM_CALLS = {
  fakeBank: [
    'Garanti Bankası güvenlik biriminden arıyorum, ben müşteri temsilciniz.',
    'Hesabınızda şüpheli bir işlem tespit ettik, 4.250 TL çekilmeye çalışılıyor.',
    'İşlemi iptal etmek için telefonunuza gelen doğrulama kodunu bana okumanız gerekiyor.',
    'Lütfen acele edin, iki dakika içinde onaylamazsak para gidecek.',
  ],
  masak: [
    'Ben Cumhuriyet Savcısı Ahmet Yılmaz, hakkınızda para aklama soruşturması başlatıldı.',
    'Adınıza kayıtlı bir hesapta MASAK incelemesi var, ifadeniz alınacak.',
    'Paranızı güvenli bir devlet hesabına aktarmanız gerekiyor, aksi halde gözaltına alınacaksınız.',
    'Bu görüşmeyi kimseyle paylaşmayın, hakkınızda gizlilik kararı var, telefonu kapatmayın.',
  ],
  relativeEmergency: [
    'Anne benim, bir kaza yaptım, telefonum kırıldı, başkasının telefonundan arıyorum.',
    'Karşı taraf şikayetçi oldu, hemen 15 bin lira göndermezsek gözaltına alınacağım.',
    'Avukatım bekliyor, şimdi sana IBAN göndereceğim, acil para gönder, kimseye söyleme.',
  ],
  cargo: [
    'Merhaba, kargonuz gümrükte bekliyor, teslimat için ek ücret ödemeniz gerekiyor.',
    'Bugün ödeme yapılmazsa paketiniz iade edilecek, son gün.',
    'Kart numaranızı ve telefonunuza gelen kodu iletirseniz işlemi tamamlıyorum.',
  ],
  crypto: [
    'Merhaba, yatırım danışmanınız olarak arıyorum, size özel bir kripto fırsatımız var.',
    'Aylık yüzde 30 garantili getiri sağlıyoruz, bugün 5.000 TL ile başlayabilirsiniz.',
    'Paranızı göstereceğim cüzdana transfer edin, hemen işleme alalım.',
    'Ekranınızı görebilmem için AnyDesk uygulamasını indirip bağlanır mısınız?',
  ],
};

/**
 * English-language scam / legit scripts — the second locale. Same patterns,
 * the playbooks that dominate US/UK/CA/AU reports.
 * @type {Record<string, string[]>}
 */
export const SCAM_CALLS_EN = {
  fakeBank: [
    'This is the fraud department at your bank, I am a security representative.',
    'We detected a suspicious transaction on your account, someone is trying to withdraw four thousand dollars.',
    'To cancel it I need you to read me the one-time code we just sent to your phone.',
    'Please hurry, if we do not confirm within two minutes the money is gone.',
  ],
  ssa: [
    'This is the Social Security Administration, your social security number has been suspended.',
    'There is an arrest warrant for your arrest linked to money laundering under your name.',
    'You need to move your money to a safe government account or you will be arrested today.',
    'Do not tell anyone and do not hang up, there is a confidentiality order on this case.',
  ],
  giftCard: [
    'Your account has been compromised and we need to secure your funds right now.',
    'Go to the store and buy gift cards, then read me the numbers on the back.',
    'Stay on the line, do not call your bank, this is between us.',
  ],
  grandkid: [
    'Grandma it is me, I have been in an accident and I am in jail, I am calling from a different number.',
    'The lawyer says we need bail money immediately or I stay overnight.',
    'Please do not tell mom and dad, just wire the money to this account.',
  ],
};

/** @type {Record<string, string[]>} */
export const LEGIT_CALLS_EN = {
  dentist: [
    'Hi, this is Bright Smile Dental, just an appointment reminder for tomorrow at 2 pm.',
    'If you cannot make it let us know so we can offer the slot to someone else. Have a good day.',
  ],
  courier: [
    'Hello, I am the delivery driver, I am at your door but nobody answered.',
    'Should I leave the parcel with your neighbour or come back tomorrow?',
  ],
  bankReminder: [
    'Hello, calling from your bank. Your credit card statement due date is coming up, just a reminder.',
    'No action is required, this is just a courtesy call. Have a nice day.',
  ],
  fraudWarning: [
    'Good afternoon, a quick reminder from your bank security team.',
    'Never share the verification code we send you with anyone, not even our staff.',
    'Do not give out your card number or PIN over the phone to anyone. Goodbye.',
  ],
};

/** @type {Record<string, string[]>} */
export const LEGIT_CALLS = {
  dentist: [
    'Merhaba, Ada Diş Kliniği\'nden arıyorum. Yarın saat 14:00\'teki randevunuzu hatırlatmak istedim.',
    'Gelemeyecekseniz haber verirseniz başka hastaya verebiliriz. İyi günler.',
  ],
  courier: [
    'Alo, Aras Kargo kuryesiyim, kapınızdayım ama kapıyı açan olmadı.',
    'Paketi yan komşuya mı bırakayım, yoksa yarın tekrar mı geleyim?',
  ],
  friend: [
    'Naber kanka, akşam maça geliyor musun? Ben bilet aldım bize.',
    'Saat yedi gibi stadyumun önünde buluşalım o zaman.',
  ],
  restaurant: [
    'İyi günler, Mürver Restoran\'dan arıyorum. Bu akşam saat 20:00 için 4 kişilik rezervasyonunuzu onaylıyoruz.',
    'Pencere kenarı bir masa ayırdık. Geç kalırsanız haber verin lütfen.',
  ],
  bankReminder: [
    'Merhaba, Akbank\'tan arıyorum. Kredi kartı ekstrenizin son ödeme tarihi yaklaştı, hatırlatmak istedik.',
    'Herhangi bir işlem yapmanıza gerek yok, bu sadece bir bilgilendirme aramasıdır. İyi günler.',
  ],
  // A real fraud-awareness call: it names the SMS code, but only to warn you.
  fraudWarning: [
    'İyi günler, bankanızın güvenlik ekibi adına bir hatırlatma yapıyoruz.',
    'Telefonunuza gelen doğrulama kodunu bankamız dahil hiç kimseyle paylaşmayın.',
    'Kart numaranızı ve şifrenizi telefonda kimseye vermeyin. İyi günler.',
  ],
};
