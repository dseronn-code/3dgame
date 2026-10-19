# Echoes

Aventura narrativa em terceira pessoa em que o **silêncio do seu ambiente real**, medido pelo microfone do celular, revela uma camada oculta do mundo: a **Resonance**.

- Design completo: [`docs/DOCUMENTO_MESTRE.md`](docs/DOCUMENTO_MESTRE.md)
- O que esta versão cobre e o que foi cortado: [`docs/ESCOPO_FATIA_JOGAVEL.md`](docs/ESCOPO_FATIA_JOGAVEL.md)

Versão atual: **Prólogo + Ato 1** jogáveis, com microfone ou no modo Standard (sem microfone).

## Instalar no Android

O APK pronto está em [`dist/Echoes.apk`](dist/Echoes.apk). Copie para o celular, abra e permita "instalar apps desconhecidos".

- O app só pede o microfone quando você escolhe usá-lo. Dá para trocar para o modo Standard a qualquer momento em Configurações.
- O áudio é analisado no aparelho e nunca é gravado nem enviado.
- Fones de ouvido ajudam: os sons do jogo não "vazam" para o microfone.

Para gerar o APK de novo (sem Android Studio nem SDK; só Java, curl, unzip e zip):

```bash
./android/build.sh
VERSION_CODE=2 VERSION_NAME=0.2 ./android/build.sh   # nova versão
```

## Rodar no navegador (desenvolvimento)

```bash
python3 -m http.server 8000   # abra http://localhost:8000
```

O microfone no navegador exige `localhost` ou HTTPS.

## Estrutura
- `js/sensor.js`: microfone, calibração, limiares, picos, modo Standard e a máquina de estados da Resonance
- `js/audio.js`: mixer (camada do mundo x camada da Resonance), áudio direcional, vozes sintetizadas
- `js/engine.js`: renderização, colisão, personagens
- `js/player.js`: câmera livre em terceira pessoa, analógico, toque, giroscópio, teclado e mouse
- `js/systems.js`: ecos, NPCs, interações, objetos de camada, a Estática
- `js/zones/apartment.js`: Prólogo
- `js/zones/hub.js`: Ato 1
- `js/state.js`, `js/ui.js`, `js/main.js`: saves, diário, interface e fluxo do jogo
- `android/`: app Android (WebView + permissão de microfone) e script de build
