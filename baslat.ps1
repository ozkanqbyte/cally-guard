# Cally AI Guard — canlı demo başlatıcı.
# Kullanım:   powershell -ExecutionPolicy Bypass -File .\baslat.ps1
# Anahtarlar burada gömülü — komut satırına hiçbir şey yapıştırmana gerek yok.
# Bu dosyayı GitHub'a yükleme (git zaten yok sayıyor).

$env:ELEVENLABS_API_KEY = "sk_61b505463ce64cfb0339c2e6dfe7738faa2e18eaa265081c"
$env:GEMINI_API_KEY     = "AIzaSyCR0k1rGypjvkJu-8oAs02YqNTe3HIPpwk"

# ── SES seçimi ────────────────────────────────────────────────────────────────
# Sesi beğenmediysen:  node voice-preview.mjs voices
#   -> voice-preview\sesler\ klasöründeki mp3'leri dinle
#   -> beğendiğinin dosya adında "__" sonrası ID'dir, aşağıya yapıştır.
# Boş bırakırsan varsayılan "Sarah" sesi kullanılır.
$env:ELEVENLABS_VOICE_ID = ""
# turbo_v2_5 (hızlı) | multilingual_v2 (Türkçe'de bazen daha iyi, biraz yavaş)
$env:ELEVENLABS_MODEL   = "eleven_turbo_v2_5"

Set-Location -Path $PSScriptRoot

Write-Host ""
Write-Host "  Cally AI Guard baslatiliyor..." -ForegroundColor Cyan
Write-Host "  Gemini anahtar uzunlugu: $($env:GEMINI_API_KEY.Length)  (38 olmali)" -ForegroundColor DarkGray
if ($env:ELEVENLABS_VOICE_ID) { Write-Host "  Ses: $($env:ELEVENLABS_VOICE_ID)" -ForegroundColor DarkGray }
else { Write-Host "  Ses: varsayilan (Sarah)" -ForegroundColor DarkGray }
Write-Host ""

node live-demo.mjs
