TALEP KONTROL - PORTABLE PYTHON RUNTIME

Normal kullanimda BASLAT.bat / Talep Kontrol.vbs zinciri START_GUI.ps1 uzerinden
PYTHON_BOOTSTRAP.ps1 calistirir. Sistemde Python yoksa resmi Python.org embed
paketini indirir, SHA-256 dogrular ve _runtime klasorune acar.

Tamamen offline kurulum istenirse uygun resmi ZIP dosyasini bu klasore ayni adla koyun:
- x64: python-3.13.17-embed-amd64.zip
- ARM64: python-3.13.17-embed-arm64.zip
- x86: python-3.13.17-embed-win32.zip

Bootstrap resmi SHA-256 degerini kontrol etmeden ZIP'i kullanmaz.
