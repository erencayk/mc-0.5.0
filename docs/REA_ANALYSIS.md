# 0.5.0 APK analizi (REA + CPU emülasyonu)

Bu belge, orijinal **Minecraft – Pocket Edition 0.5.0** APK'sının (`com.mojang.minecraftpe`, versionCode 5004, `lib/x86/libminecraftpe.so`) nasıl incelendiğini ve PocketCraft'a hangi bilgilerin aktarıldığını anlatır.

**Ne yapıldı / ne yapılmadı**
- APK depoya **eklenmedi**. Mojang'ın kodu, dokuları ve sesleri PocketCraft'a **kopyalanmadı**.
- Sadece oyunun **davranışını ve sayısal değerlerini** (tarifler, ID'ler, can/hasar değerleri, reaktör zaman çizelgesi, kubbe şekli) ölçtüm. Bunlar `game/src/pe050data.js` dosyasında veri olarak duruyor; oyunu çalıştıran kod PocketCraft'ın kendi kodu.

## Araçlar
- **REA** (`rea-agents` 6.5.0) kuruldu. REA'nın yerel kod analizi Ghidra gerektiriyor; Ghidra'nın GitHub'dan indirilmesi bu ortamın ağ politikası tarafından engellendi.
- Bu yüzden aynı işlemler binutils (`nm`, `readelf`, `objdump`) ve **Unicorn** CPU emülatörü ile yapıldı. Kütüphane "stripped" olsa da 9.525 dinamik C++ sembolü taşıyor.
- `tools/re/redis.py`: i386 PIC disassembly'sinde GOT ve `.rodata` başvurularını sembol adına çeviriyor.
- `tools/re/emu.py`: `.so` dosyasını belleğe yükleyip tek tek fonksiyonları çalıştırıyor; `Level::setTile` gibi çağrıları yakalıyor.
- `init.py`, `recipes.py`, `props2.py`, `props3.py`, `creative.py`, `dome.py`, `decay.py`: oyunun kendi `Tile::initTiles()`, `Item::initItems()`, `Recipes()`, `Inventory::setupDefault()`, `NetherReactorTileEntity::buildDome()` ve benzeri fonksiyonlarını emülatörde çalıştırıp sonuçları okuyor.
- `gen_data.py`: sonuçları `game/src/pe050data.js` dosyasına yazıyor.

Bu betikleri kendin çalıştırmak istersen APK'yı `../apk050/x/` altına açman gerekir (yollar betiklerde sabit).

## Bulgular ve PocketCraft'a etkisi

| Konu | 0.5.0'daki gerçek değer | PocketCraft'taki değişiklik |
|---|---|---|
| Üretim | 95 tarif (55'i çalışma masası gerektiriyor) | Tarif listesi birebir orijinale göre. Kaldırılanlar: taş tuğla, kumtaşı ve nether tuğla merdivenleri, kavun bloğu, gül→boya, gri/siyah/kahverengi boya ve yün tarifleri. Eklenen: cam panel. Merdiven artık 2 adet veriyor. |
| Fırın | 12 tarif; kırmızı mantar → kırmızı boya, kütük → kömür | Birebir uygulandı; kömür/lapis cevheri ve netherrack eritme kaldırıldı. |
| Yaratıcı envanter | 86 öğe, belirli bir sırayla | Orijinal liste ve sırası kullanılıyor. |
| Bloklar | 81 kayıtlı blok; balkabağı, netherrack ve ölü çalı **yok** | Dünya üretiminden balkabağı ve ölü çalı çıkarıldı; sertlik ve patlama direnci değerleri orijinalden alındı (örneğin obsidyen sertliği 10). |
| Eşyalar | Dayanıklılık: tahta 59, taş 131, demir 250, elmas 1561, altın 32; yay 384; çakmak 64; makas 238; mantar çorbası 8 can | Hepsi uygulandı. |
| Mob'lar | Can: inek/domuz/iskelet 10, koyun/örümcek 8, tavuk 4, zombi/Pigman 12, creeper 16. Hasar: zombi 4, Pigman 5, diğerleri 2 | Uygulandı. |
| TNT | Patlama gücü 3.1 | Uygulandı. |
| Nether Reactor deseni | Altta köşelerde altın, diğer yerler kırık taş; ortada çekirdek; üstte kırık taştan artı | Zaten doğruydu, emülasyonla teyit edildi. |
| Aktivasyon | Sadece hayatta kalma modunda; tüm oyuncular ±5 blok içinde; y ≤ 100; orijinal hata mesajları | Uygulandı. |
| Kule (spire) | **Obsidyenden** (netherrack değil); önce 25×25×43'lük alan boşaltılıyor; 3.956 blok yerleştirmesi, y-3'ten y+30'a | Emülasyonla çıkarılan şekil birebir kuruluyor; toplu ışık hesaplaması ve ağ senkronu eklendi. |
| Zaman çizelgesi | Desen 2., 3., 4. ve 7. saniyelerde parlıyor; seviye geçişleri 10, 13, 20, 22, 25, 30, 34, 36, 38 ve 40. saniyelerde; 43-45. saniyelerde obsidyene dönüyor; 920. tickte bitiyor; çalışırken gökyüzü gece moduna geçiyor | Birebir uygulandı. |
| Ganimet | %6/7 ihtimalle glowstone tozu ×3, kavun tohumu, iki mantar, şeker kamışı, kaktüs; %1/7 ihtimalle ok, yatak, kemik, kitap, yay, kase, tüy, tablo, kapı | Uygulandı. |
| Pigman | Seviye 1-3'te 2, 4-5'te 0-1; aynı anda en fazla 3. Reaktör bittikten sonra oyuncular 40 blok içindeyse 2 Pigman tutuluyor, uzaklaşınca siliniyor | Uygulandı. |
| Bitiş | Kulenin yaklaşık %65'i çöküyor (zemin kalıyor, alt duvarlar tamamen yıkılıyor) | Emülasyonla çıkarılan çöküş deseni uygulandı. |

## Neden orijinal APK'yı doğrudan iOS'a "uyumlu hale getirmedim"

- APK'daki oyun kodu **yalnızca x86** (`lib/x86`). Neredeyse tüm telefonlar ARM işlemcili, bu yüzden bu APK onlarda çalışmaz.
- `targetSdk` 9; Android 14 ve üzeri, `targetSdk` 23'ün altındaki uygulamaların kurulmasını engelliyor.
- iOS, Android ikili dosyalarını çalıştıramaz. Orijinal kodu iOS'a taşımak, 9.4 MB'lık C++ kodunu tamamen decompile edip yeniden derlemek demek. Bu hem pratikte mümkün değil hem de Mojang'ın kodunu yeniden dağıtmak olurdu.

Bu nedenle PocketCraft'ın iOS ve Android sürümleri kendi motorunu kullanmaya devam ediyor; ama artık oyun verileri ve Nether Reactor davranışı 0.5.0'dan ölçülen değerlere göre çalışıyor.
