# AI Guard — kurulum (adım adım)

Bu klasör, "AI dolandırıcıyla konuşup oyalasın" tarafının çalışması için gereken
her şeyi kuruyor. Karar veren kod (`../src`) zaten yazılı ve 110 testle doğrulandı.
Burada yaptığın şey onu bir **sunucuya** ve bir **telefon hattına** bağlamak.

Toplam: bir geliştiriciyle ~1 hafta. Aylık maliyet ~$0–5 + arama dakikası.

---

## 0. Neye ihtiyacın var

| Ne | Nasıl | Maliyet |
|---|---|---|
| Sunucu | Oracle Cloud "Always Free" (4 çekirdek / 24 GB ARM VM) | $0 |
| Telefon hattı | 1–4 portlu **GSM gateway** (GoIP / Yeastar TA) + bir Türk SIM | ~$80–250 tek sefer + SIM tarifesi |
| Alan adı (opsiyonel) | herhangi bir sağlayıcı | ~$10/yıl |

Alternatif hat: Telnyx Programmable Voice (SIP). Türkiye numaraları kısıtlı
olduğu için GSM gateway daha pratik.

---

## 1. Sunucuyu aç

1. cloud.oracle.com → hesap aç → **Always Free** bölgede bir **Ampere (ARM)**
   VM oluştur: Ubuntu 22.04, 4 OCPU, 24 GB.
2. Güvenlik listesine şu portları aç: `7880/tcp` (LiveKit), `5060/udp` (SIP),
   `10000-20000/udp` ve `50000-60000/udp` (medya).
3. SSH ile bağlan, Docker kur:
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER   # yeniden giriş yap
   ```

## 2. Kodu koy ve ayarla

```bash
git clone <repo> && cd cally/services/guard/deploy
cp env.sample .env

# LiveKit anahtarları üret
docker run --rm livekit/livekit-server generate-keys
# çıktıyı .env içindeki LIVEKIT_API_KEY / LIVEKIT_API_SECRET'a ve
# livekit.yaml içindeki keys: bölümüne yapıştır

# Firebase servis hesabı json'ını sunucuya kopyala, yolunu .env'e yaz
```

## 3. Kaldır

```bash
docker compose up -d
docker compose logs -f whisper   # ilk açılışta modeli indirir, ~1 dk
```

### Ses sağlayıcısı — bedava mı, gerçekçi mi?

`.env` içinde `STT_PROVIDER` / `TTS_PROVIDER` ile seçilir:

| | Bedava (varsayılan) | Gerçekçi |
|---|---|---|
| STT | `whisper` (self-host) | `deepgram` — Nova-3, en iyi Türkçe |
| TTS | `piper` (robotik ama "dalgın kişi" için yeterli) | `elevenlabs` — en doğal Türkçe · `cartesia` — ucuz gerçek-zaman |

Sesleri önce tarayıcıda dinle: **elevenlabs.io** · **play.cartesia.ai** · **rhasspy.github.io/piper-samples** (`tr_TR-fahrettin`).
ElevenLabs ücretsiz katmanı ~10 dk/ay — test için yeter, ürün için ödemeli.

`AGENT_PACE_MS` (varsayılan 350) = AI'ın her cümleden önce "düşünme" molası; `src/agent/humanize.mjs`
her cümlenin başına doğal bir duraksama ("Şey…", "Bir saniye…") koyar — ikisi de worker'da açık.

Kontrol:
```bash
curl localhost:8000/health          # whisper
curl localhost:5000                  # piper
curl localhost:7880                  # livekit -> "OK"
```

## 4. Telefon hattını bağla

**GSM gateway ile:**
1. Gateway'in web arayüzünde bir **SIP hesabı** tanımla:
   `sunucu-ip:5060`, kullanıcı `guard`, şifre `.env`'deki bir değer.
2. Gelen çağrı yönlendirmesini `sip:guard@sunucu-ip` yap.
3. LiveKit SIP'te bir **dispatch rule** ekle: her gelen çağrıyı
   `guard-<callId>` adında yeni bir odaya koy (LiveKit dokümanı: "SIP inbound
   trunk" + "dispatch rule").

**Telnyx ile:** SIP Connection oluştur → Outbound'u `sip:...@sunucu-ip:5060`'a
yönlendir → numarayı bu connection'a bağla.

## 5. Test et — kanıtla

1. Kendi telefonundan **Cally numarasını** (SIM'in numarası) ara.
2. `docker compose logs -f worker` — AI'ın "Alo, buyurun..." dediğini gör.
3. Telefonda bir dolandırıcı repliği söyle ("bankadan arıyorum, kodu okuyun").
4. Loglarda risk skorunun yükseldiğini ve AI'ın oyalayıcı soru sorduğunu gör.
5. Yüksek riskte AI kapatır, özet FCM ile telefona düşer.

Bu adım geçtiğinde: **AI Guard gerçekten çalışıyor.**

## 6. Uygulamaya bağla (geliştirici)

- Gelen şüpheli aramada "AI cevaplasın" butonu → aramayı Cally numarasına
  yönlendir + oda metadata'sına kullanıcının FCM token'ını koy.
- `guard_risk` / `guard_summary` FCM mesajlarını dinle, `callGuardProvider`'a ver
  → uyarı bandı zaten hazır.
- İki-numara onboarding: kullanıcıya Cally numarasını "herkese ver" olarak tanıt.

---

## Ölçekleme notu

- 1 SIM = ~1 eş zamanlı arama. Beta için yeterli. Büyürken: çok portlu gateway
  + çok SIM, ya da Telnyx'e geç.
- Oracle Free VM tek başına yüzlerce eş zamanlı **skorlama** kaldırır; darboğaz
  Whisper (CPU). Yük artınca STT'yi Deepgram'e çevir (kod hazır:
  `../src/agent/providers/deepgram-stt.mjs`).
