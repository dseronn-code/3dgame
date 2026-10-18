# Arena Royale 3D

Shooter 3D em terceira pessoa, no estilo Free Fire / Fortnite, que roda direto no navegador (PC e celular).

Sobreviva a ondas de inimigos cada vez mais fortes. Ao fim de cada onda você escolhe **1 de 3 melhorias** (dano, cadência, tiro múltiplo, balas explosivas, pulo duplo, vampirismo…), então cada partida monta uma build diferente. A cada 5 ondas aparece um **chefão**.

## Como jogar

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
