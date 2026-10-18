# Arena Royale 3D

Shooter 3D em terceira pessoa, no estilo Free Fire / Fortnite, que roda direto no navegador (PC e celular).

Sobreviva a ondas de inimigos cada vez mais fortes. Ao fim de cada onda você escolhe **1 de 3 melhorias** (dano, cadência, tiro múltiplo, balas explosivas, pulo duplo, vampirismo…), então cada partida monta uma build diferente. A cada 5 ondas aparece um **chefão**.

## Android (APK)

O APK pronto está em [`dist/ArenaRoyale.apk`](dist/ArenaRoyale.apk). Copie para o celular, abra e permita "instalar apps desconhecidos" quando o Android pedir. O jogo roda offline, em tela cheia e na horizontal. No celular, o botão voltar pausa o jogo; apertando de novo em até 2 segundos, o app fecha.

Para gerar o APK de novo (não precisa de Android Studio nem do Android SDK, só Java, curl, unzip e zip):

```bash
./android/build.sh          # gera dist/ArenaRoyale.apk
VERSION_CODE=2 VERSION_NAME=1.1 ./android/build.sh   # para uma nova versão
```

O app é uma WebView nativa (`android/src/.../MainActivity.java`) que carrega os arquivos do jogo de dentro do APK.

## Como jogar no navegador

O jogo usa módulos ES, então precisa de um servidor local (abrir o `index.html` direto pelo arquivo não funciona):

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

Também funciona publicado no **GitHub Pages** (Settings → Pages → branch). Não há etapa de build nem dependências externas: o Three.js está em `lib/`.

### Controles no PC
| Tecla | Ação |
|---|---|
| W A S D | andar (relativo à câmera) |
| Mouse | girar a câmera |
| Clique esquerdo | atirar |
| Clique direito | mirar (zoom sobre o ombro) |
| Shift | correr |
| Espaço | pular |
| C | agachar (use os sacos de areia como cobertura) |
| R | recarregar |
| Esc / P | pausar |

### Controles no celular (estilo Free Fire)
- **Analógico à esquerda**: andar. Empurre até o fim para frente para **correr**.
- **Arraste no lado direito da tela**: girar a câmera.
- **Botão de tiro** (direita e esquerda): segure para atirar e arraste o dedo para mirar enquanto atira.
- Botões de mirar, pular, agachar e recarregar. Tem uma leve assistência de mira.

## Inimigos
- **Soldado** (vermelho): atira de média distância.
- **Corredor** (laranja): rápido, ataca corpo a corpo.
- **Atirador** (azul): mostra um laser vermelho antes de disparar. Saia da linha!
- **Brutamonte** (roxo): tanque, dispara rajadas.
- **Chefão** (dourado): rajadas e anéis de balas. Pule para desviar dos anéis.

Headshots dão dano extra; abates em sequência aumentam o multiplicador de combo. O recorde fica salvo no navegador.

## Estrutura
- `index.html`: HUD, menus e controles de toque
- `style.css`: visual da interface
- `game.js`: o jogo inteiro (mundo, personagem, câmera em terceira pessoa, IA, ondas, melhorias, áudio sintetizado)
- `lib/three.module.min.js`: Three.js r160
- `android/`: app Android (manifest, Activity, ícones, script de build)
- `dist/ArenaRoyale.apk`: APK pronto para instalar
