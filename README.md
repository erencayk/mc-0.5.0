# PocketCraft 0.5.0 — iOS + Android, yerel ağda (LAN) çok oyunculu

Minecraft Pocket Edition **v0.5.0 alpha** (Kasım 2012) sürümünün oynanışını sıfırdan yeniden yazan, **iPhone/iPad ve Android'de çalışan** ve **iOS ile Android'in aynı Wi-Fi üzerinden birlikte oynayabildiği** bir hayran yapımı.

> **Yasal not:** Bu proje "clean-room" (temiz oda) bir yeniden yapımdır. İçinde Mojang/Microsoft'a ait **hiçbir kod, doku, ses veya dosya yoktur**. Orijinal 0.5.0 APK'sı REA yaklaşımıyla (statik analiz + CPU emülasyonu) yalnızca **ölçüm** için incelendi: tarifler, ID'ler, can/hasar değerleri ve Nether Reactor'ün davranışı çıkarılıp `game/src/pe050data.js` dosyasına veri olarak yazıldı (ayrıntılar: [docs/REA_ANALYSIS.md](docs/REA_ANALYSIS.md)). APK'nın kendisi, kodu ve dosyaları dağıtılmıyor. Tüm dokular (`game/src/textures.js`) ve sesler (`game/src/audio.js`) program tarafından üretilir. Proje Mojang veya Microsoft ile bağlantılı değildir ve yalnızca kişisel kullanım içindir.

---

## İçindekiler
1. [Hazır APK'yı Android'e yükleme](#1-androide-yükleme-hazır-apk)
2. [iPhone/iPad'e yükleme (Mac + Xcode)](#2-iphoneipade-yükleme-mac--xcode)
3. [Birlikte oynama (LAN)](#3-birlikte-oynama-lan)
4. [Kontroller](#4-kontroller)
5. [0.5.0 içeriği — neler var](#5-050-içeriği--neler-var)
6. [Kaynaktan derleme](#6-kaynaktan-derleme)
7. [Mimari](#7-mimari)
8. [Sorun giderme](#8-sorun-giderme)

---

## 1. Android'e yükleme (hazır APK)

Hazır, imzalı APK: **[`releases/PocketCraft-0.5.0.apk`](releases/PocketCraft-0.5.0.apk)** (≈130 KB, Android 7.0 ve üzeri).

1. Telefonun tarayıcısıyla GitHub'da bu depoyu aç → `releases` klasörü → `PocketCraft-0.5.0.apk` → **Download (İndir)**.
   *(Ya da APK'yı bilgisayardan USB, Google Drive, Telegram vb. ile telefona at.)*
2. İndirilenler bildirimine ya da **Dosyalar** uygulamasındaki APK'ya dokun.
3. "Bilinmeyen uygulamalar" uyarısı çıkarsa **Ayarlar**'a dokun ve *"Bu kaynaktan izin ver"* seçeneğini aç. Bu izin, APK'yı açtığın uygulamaya (Chrome, Dosyalar vb.) verilir. Sonra geri dön.
4. **Yükle**'ye dokun. Google Play Protect *"Uygulama taranmadı"* uyarısı verirse **Ayrıntılar → Yine de yükle** de. Uygulama Play Store'da olmadığı için bu uyarı normaldir.
5. **PocketCraft** ikonuyla aç. Oyun yatay modda açılır.

Bilgisayardan ADB ile kurmak istersen: `adb install -r releases/PocketCraft-0.5.0.apk`

> Kendi derlediğin bir APK'yı, farklı anahtarla imzalanmış eski sürümün üzerine kurarken "paket çakışıyor" hatası alırsan önce eski uygulamayı kaldır. Bunu yaparsan dünyalar silinir.

---

## 2. iPhone/iPad'e yükleme (Mac + Xcode)

Gerekenler: **Mac**, **Xcode 15 veya üstü**, ücretsiz bir **Apple ID** ve **iOS 14+** bir iPhone/iPad. Ücretli geliştirici hesabı gerekmez.

1. Depoyu Mac'e indir:
   ```bash
   git clone -b pocketcraft-0.5.0 https://github.com/erencayk/mc-0.5.0.git
   cd mc-0.5.0
   open ios/PocketCraft.xcodeproj
   ```
   Derlenmiş oyun dosyası (`www/game.js`) depoda hazır geliyor. Node.js kurmana gerek yok.
2. Xcode → **Settings → Accounts** → **+** → Apple ID'nle giriş yap.
3. Soldan **PocketCraft** projesini → **PocketCraft** hedefini → **Signing & Capabilities** sekmesini seç:
   - **Automatically manage signing** işaretli olsun.
   - **Team**: Apple ID'n *(Personal Team)*.
   - **Bundle Identifier**: `com.pocketcraft.pe050` başka biri tarafından alınmışsa benzersiz bir ad ver (ör. `com.erencayk.pocketcraft`).
4. iPhone'u kabloyla Mac'e bağla, telefonda **"Bu bilgisayara güven"** de.
5. iOS 16 ve üstünde: **Ayarlar → Gizlilik ve Güvenlik → Geliştirici Modu → Aç**. Telefon yeniden başlar.
6. Xcode'un üstündeki cihaz listesinden **iPhone'unu** seç ve **▶ Run (⌘R)** tuşuna bas.
7. İlk seferde *"Güvenilmeyen Geliştirici"* uyarısı çıkarsa telefonda: **Ayarlar → Genel → VPN ve Cihaz Yönetimi** → Apple ID'ne dokun → **Güven**. Sonra uygulamayı tekrar aç.
8. Oyun ilk kez çok oyunculu ekranı açtığında *"Yerel ağdaki cihazları bulmak istiyor"* izni sorulur. **İzin Ver** de, yoksa LAN çalışmaz.

> Ücretsiz Apple ID ile yüklenen uygulamalar **7 gün** sonra açılmaz. Telefonu bağlayıp Xcode'da tekrar **Run** demen yeterli; dünyaların silinmez.

---

## 3. Birlikte oynama (LAN)

Orijinal 0.5.0'daki gibi: dünyayı açan cihaz **sunucu (host)** olur, diğerleri ona katılır. iOS ile Android birbirine sorunsuz bağlanır.

1. Tüm cihazlar **aynı Wi-Fi ağında** olmalı. Wi-Fi yoksa bir telefonun **kişisel erişim noktasını (hotspot)** açıp diğerlerini ona bağlayabilirsin.
2. **Host:** *Start Game* → bir dünya seç veya oluştur. Dünya otomatik olarak LAN'da görünür olur; sağ üstte `LAN 192.168.x.x · 1P` yazar. Durdurmak için: Pause (II) → *LAN game: Visible/Hidden*.
3. **Katılan:** *Join Game* → listede dünyanın adı birkaç saniye içinde çıkar → dokun. Dünya host'tan indirilir (birkaç saniye sürer).
4. Liste boş kalırsa host'un ekranındaki IP'yi (ör. `192.168.1.23`) *"Or enter the host's IP address"* kutusuna yazıp **Join by IP**'ye bas.

Kullanılan port: **TCP 19135**. Keşif: Bonjour/mDNS (`_pocketcraft._tcp`).

Çok oyunculuda olanlar:
- Bloklar, mob'lar, eşyalar, gün/gece ve Nether Reactor herkes için senkronize.
- Her oyuncunun envanteri sunucuda tutulur. Biri ayrılıp yeniden girdiğinde envanteri ve konumu geri gelir.
- Sohbet: klavyede **T**, dokunmatikte HUD'daki **T** düğmesi.
- Oyuncuların üstünde isim etiketleri görünür. İsim ve tişört rengi *Options* ekranından değişir.
- Sandık, fırın, çalışma masası ve yatak ağ üzerinden çalışır. Gece herkes yatağa yatınca sabah olur.

---

## 4. Kontroller

### Dokunmatik (0.5.0'daki gibi)
| Hareket | Ne yapar |
|---|---|
| Sol alttaki **D-pad** oklar | Yürü / geri / sağa-sola |
| D-pad ortası (●) | Zıpla · Yaratıcı modda **iki kez dokun = uç** |
| D-pad'in sağ üstündeki küçük tuş | Eğil (sneak) aç/kapa |
| Ekranda **parmağı sürükle** | Etrafa bak |
| Bir bloğa **dokun** | Blok koy / kullan (kapı, sandık, fırın, yatak, reaktör…) |
| Bir bloğa **basılı tut** | Kır (çatlaklar görünür) |
| Bir mob'a **dokun** | Vur · makasla koyuna dokun = yün kırp |
| Havaya dokun (elde yiyecek varken) | Ye |
| Elde **yay** varken basılı tut → bırak | Ok at |
| Hotbar'a dokun | Slot seç · seçili slota **basılı tut = eşyayı at** |
| **•••** | Envanter / üretim (crafting) |
| **II** | Menü (kaydet, LAN, oyun modu, ayarlar) |
| Uçarken sağdaki ▲▼ | Yüksel / alçal |

*Options → Crosshair aiming: ON* yaparsan dokunduğun yer yerine ekranın ortasındaki artıya göre hedef alırsın.

### Klavye + fare (tarayıcıda test için)
WASD hareket · Space zıpla (iki kez = uç) · Shift eğil · Fare bak · Sol tık kır/vur · Sağ tık koy/kullan · 1–9 / tekerlek slot · E envanter · Q eşya at · T sohbet · Esc menü · F uçmayı aç/kapa (yaratıcı mod).

---

## 5. 0.5.0 içeriği — neler var

**0.5.0 ile gelenler**
- **Nether Reactor Core** (3 elmas + 6 demir külçe). Altın blok ve kırık taştan 3×3×3 deseni kur, çekirdeğe dokun. Sadece **hayatta kalma** modunda çalışır; tüm oyuncular reaktörün 5 blok yakınında olmalıdır. Etraftaki alan boşaltılır, **obsidyenden** bir **Nether Spire** yükselir ve gökyüzü kararır. Desen birkaç saniye içinde **Glowing Obsidian**'a döner. Yaklaşık 46 saniye boyunca 10 dalga hâlinde ganimet (glowstone tozu, kavun tohumu, mantar, şeker kamışı, kaktüs; daha nadir olarak ok, yatak, kemik, kitap, yay, kase, tüy, tablo, kapı) ve **Zombie Pigman** çıkar. Sonunda reaktör söner, gökyüzü aydınlanır ve kulenin büyük kısmı çöker. Bütün süreler ve sayılar orijinal oyundan ölçüldü.
  ```
  Alt kat:  A K A      Orta kat: K . K      Üst kat:  . K .
            K K K               . R .                K K K
            A K A               K . K                . K .
  (A = altın blok, K = kırık taş, R = reaktör çekirdeği, . = boş)
  ```
- **Zombie Pigman**: tarafsızdır; birine vurursan hepsi saldırır.
- **Glowstone** (ışık 15) ve glowstone tozu.
- **Tablolar (Painting)**: duvara koy, boyuta göre rastgele resim çıkar; vurunca düşer.
- **Kavun**: kavun tohumu → sap → kavun bloğu → kavun dilimi.
- **Mantar tarımı**: mantarlar karanlıkta yayılır, kemik tozu ile çoğalır. Mantar çorbası yapılabilir.
- Yatakta uyumak canı doldurur, yiyecekler daha fazla can verir, sis azaltıldı.

**Önceki sürümlerden gelen her şey**
- **Hayatta kalma ve yaratıcı mod.** Yaratıcı modda uçma, sınırsız blok ve hasar yok.
- 256×256×128 sonlu dünya: biyomlar (ova, orman, çöl, tayga, bataklık, sahil, okyanus), mağaralar, lav gölleri, cevherler (kömür, demir, altın, elmas, lapis, kızıltaş), ağaçlar (meşe, ladin, huş), çiçekler, uzun ot, şeker kamışı, kaktüs, balkabağı, kar ve buz. Düz dünya seçeneği de var.
- Gün/gece döngüsü, yumuşak ışıklandırma ve ambient occlusion, bulutlar, güneş, ay ve yıldızlar.
- **Mob'lar**: domuz, inek, koyun (makas, boya, renkli yün, ot yiyip yün yenileme), tavuk (yumurta bırakır, atılan yumurtadan tavuk çıkabilir), zombi (gündüz yanar, eski PE'deki gibi tüy düşürür), iskelet (ok atar), örümcek (gündüz tarafsız), creeper (patlar).
- **Üretim**: 0.5.0 tarzı liste. Envanterde 2×2 tarifler, çalışma masasında hepsi. Orijinal oyunun **95 tarifinin tamamı** (birebir aynı liste), 12 fırın tarifi ve orijinal sırasıyla 86 öğelik yaratıcı envanter.
- **Fırın** (yakıt ve pişirme), **sandık** (27 slot), **yatak** (doğma noktası).
- **Çiftçilik**: çapa, tohum, buğday, ekmek, sulanan tarla toprağı, kemik tozu ile büyütme.
- **Su ve lav akışı**: sonsuz su kaynağı, obsidyen ve kırık taş oluşumu. Kum ve çakıl düşer. TNT ve creeper patlamaları. Ateş ve çakmak taşı.
- Alet dayanıklılığı, kazma seviyeleri (ör. elmas için demir kazma gerekir), düşme, boğulma, lav, kaktüs ve boşluk hasarı; ölünce eşyalar düşer.
- Dünyalar cihazda otomatik kaydedilir (90 sn'de bir, menü açıldığında ve uygulama arka plana geçtiğinde).

---

## 6. Kaynaktan derleme

Gerekenler: **Node.js 18+**, **JDK 17+**, **Python 3**, `curl`, `zip`/`unzip`.

```bash
npm install
npm run build          # game/src → www/game.js
npm run android        # → dist/PocketCraft-0.5.0.apk (imzalı, kurulabilir)
npm run ios            # www/game.js'i ve ios/PocketCraft.xcodeproj'u yeniler
```

**Android SDK veya Android Studio gerekmez.** `tools/build-android.sh` şunları yapar:
1. `aapt2`, `D8`, `apksig` ve Android framework kaynak tablosunu, bunları yeniden dağıtan npm paketlerinden indirir. sha512 bütünlük kontrolü yapılır ve `tools/.cache`'te saklanır.
2. Java kabuğunu (`android/src`) sadece derleme için yazılmış framework stub'larına (`android/stubs`) karşı derler. Stub'lar APK'ya girmez.
3. D8 ile `classes.dex` üretir, aapt2 ile manifest, ikon ve `www` varlıklarını bağlar, hizalar (`tools/zipalign.py`) ve v2+v3 imzalar.

İmzalama anahtarı `android/debug-signing.p12` (şifre `pocketcraft`). Kişisel bir debug anahtarıdır; aynı anahtarla derlenen sürümler birbirinin üzerine güncellenebilir.

**Tarayıcıda deneme** (geliştirme için):
```bash
npm run relay          # http://localhost:8080
```
İki sekme açıp birinde dünya oluştur, diğerinde *Join Game* de. Yerel geliştirme sunucusu (`tools/devserver.js`), telefondaki LAN köprüsünü WebSocket üzerinden taklit eder.

---

## 7. Mimari

```
game/src/        Ortak oyun motoru (JavaScript + WebGL 1), iOS ve Android'de aynen çalışır
  textures.js    Prosedürel 16×16 doku atlası (tüm görseller kodla üretilir)
  blocks.js      Blok kayıtları, çarpışma ve seçim kutuları
  items.js       Eşyalar, 100+ tarif, fırın tarifleri, envanter
  world.js       256×256×128 dünya, gök ışığı + blok ışığı (artımlı BFS)
  worldgen.js    Arazi, biyom, mağara, cevher, ağaç üretimi
  mesher.js      16³ bölüm mesh'leri, yumuşak ışık + AO
  renderer.js    WebGL çizici: gökyüzü, bulut, sis, su, el modeli
  entities.js    Fizik, oyuncu, mob yapay zekâsı, eşya, ok, TNT, tablo
  game.js        Otoriter simülasyon: etkileşimler, sıvılar, büyüme, reaktör, uyku, doğma
  net.js         LAN protokolü: host-otoriter, JSON mesajlar, dünya akışı
  bridge.js      Yerel köprü (TCP, Bonjour/NSD, dosya) + tarayıcı yedeği
  ui.js / input.js / controller.js / scene.js / audio.js / main.js
android/         Java WebView kabuğu + NetBridge (ServerSocket/Socket + NsdManager)
ios/             Swift WKWebView kabuğu + NativeBridge (Network.framework NWListener/NWConnection/NWBrowser)
www/             Derlenmiş oyun (index.html, style.css, game.js)
tools/           APK derleme, ikon ve Xcode projesi üreticileri, geliştirme sunucusu
```

**Ağ protokolü.** TCP üzerinde her mesaj `4 bayt big-endian uzunluk + UTF-8 JSON`. Android ve iOS köprüleri birebir aynı çerçevelemeyi kullandığı için iki platform birbiriyle konuşabiliyor. Host dünyayı 16×16'lık sütunlar halinde, deflate ile sıkıştırarak gönderir. Ardından blok değişiklikleri, 10 Hz'de varlık konumları, sesler/efektler, envanter ve can bilgisi akar. İstemci kendi hareketini 20 Hz'de bildirir; kırma/koyma/üretim gibi eylemler host'ta doğrulanıp uygulanır.

---

## 8. Sorun giderme

| Sorun | Çözüm |
|---|---|
| Join listesinde oyun görünmüyor | Aynı Wi-Fi'da mısınız? Misafir ağları ve bazı modemlerin "AP/Client isolation" özelliği cihazları birbirinden ayırır. **Join by IP** deneyin ya da bir telefonun hotspot'unu kullanın. |
| iPhone bağlanamıyor | **Ayarlar → Gizlilik ve Güvenlik → Yerel Ağ → PocketCraft** açık olmalı. |
| Android'de "Uygulama yüklenmedi" | Aynı paket adlı farklı imzalı eski sürümü kaldırın. Telefonda yeterli alan olduğundan emin olun. |
| iOS'ta "Untrusted Developer" | Ayarlar → Genel → VPN ve Cihaz Yönetimi → geliştiriciye **Güven**. |
| iOS uygulaması 7 gün sonra açılmıyor | Ücretsiz Apple ID sınırı: Xcode'dan tekrar **Run**. |
| Yavaş çalışıyor | *Options → Render distance: Short*. |
| Xcode "Signing requires a development team" | Signing & Capabilities → Team seçin, Bundle Identifier'ı benzersiz yapın. |
