# Echoes: escopo da fatia jogável (v0.1)

Seguindo a seção 8 do Documento Mestre, o escopo foi **cortado em cima da base**, sem sistemas novos.
Esta versão é o Prólogo + Ato 1 completos, com todos os sistemas centrais funcionando.

## Mudança técnica (e por quê)

| Documento | Esta versão | Motivo |
|---|---|---|
| Engine: Unity | Three.js (WebGL) dentro de um app Android nativo (WebView) | O ambiente de desenvolvimento não tem o editor nem a licença do Unity. Toda a lógica (sensor, máquina de estados, história) está separada da renderização e pode ser portada. |
| Microfone: API nativa | Permissão nativa do Android (RECORD_AUDIO) + Web Audio para análise | O app pede a permissão do sistema só quando o jogador escolhe usar o microfone. O áudio é analisado no aparelho e nunca é gravado nem enviado. |
| Backend (nuvem/analytics) | Não incluído | Opcional no documento. Os saves ficam no aparelho. |

## O que está implementado

**Resonance (seção 2)**
- Calibração obrigatória a cada sessão: 16 s medindo o ambiente real e definindo um limiar pessoal relativo ao baseline (mediana + variação).
- Recalibração no menu de pausa. Sensibilidade ajustável.
- Estados: silêncio relativo, neutro e ruído relativo, com buffer de 2,0 s para entrar e 1,6 s para sair.
- Picos de ruído reais (palma, voz) detectados por transientes e usados por portas e puzzles.
- Silêncio absoluto (limiar mais estrito) para puzzles.
- Modo Standard completo: medidor interno de calma (ficar parado e agachar acalmam; correr e andar rápido fazem barulho) e botão "Barulho" no lugar de palma ou voz.
- A Resonance altera o que se vê (paleta, objetos e rastros que só existem na camada oculta), o que se ouve (mixer separando a camada do mundo e a da Resonance, ecos com áudio direcional HRTF), o que se pode interagir (portas, pessoas e falas só na Resonance) e quais ameaças agem (a Estática).
- Histórico de silêncio x ruído salvo ao longo da campanha. Já muda falas do protagonista e de NPCs e o resumo do ato.

**Controles e câmera (seção 3)**
- Terceira pessoa livre em 360°, com colisão de câmera.
- Analógico virtual, arrastar para olhar, giroscópio opcional.
- Correr, agachar, botão de interação contextual e toque direto em objetos destacados.
- Controles invertidos (canhoto) e eixo vertical invertível.
- No PC: WASD, mouse, Shift, C, E, F, Tab e Esc.

**Prólogo: O Primeiro Eco**
- Tutorial de câmera, movimento, corrida e agachar no apartamento.
- A voz só se manifesta em silêncio. Se o jogador não silenciar, segue um caminho confuso (luzes falhando, marcas na parede) e a voz nunca é ouvida, o que muda falas no Ato 1.
- A saída só aparece na camada Resonance.

**Ato 1: A Cidade que Lembra** (corte: 1 bairro denso em vez de 4–5 quarteirões)
- Hub com praça, Café Lume, banca, oficina de rádio, prédio da Dona Celeste e Estação Aurora.
- Missão da pessoa desaparecida (Lia): 3 ecos que exigem silêncio real em locais específicos.
- Puzzle da caixa de música: reproduzir um padrão de som e silêncio com barulho controlado real, **ou** 12 s de silêncio absoluto.
- Ameaça introdutória, a Estática ("tudo o que ninguém quis escutar"). Ela se aproxima com ruído, é afastada pelo silêncio e, na Resonance, vira fragmentos de conversas.
- 4 personagens secundários:
  - Iara: muda com o que você conta.
  - Bruno: comenta seu uso da Resonance e "não existe" na camada oculta.
  - Dona Celeste e Seu Otávio: só revelam o importante na Resonance.
- Portão acústico que só abre com pico de ruído real.
- Escolha final do ato baseada na quantidade de informação coletada pela Resonance.

**Sistemas de apoio (seção 6)**
- Diário automático (ecos, pessoas e relações, notas) e inventário contextual.
- Save automático por zona e por evento + 3 saves manuais.
- Legendas com tamanho ajustável.

## Ainda não feito (próximas etapas, na ordem do documento)
- Ato 2 (Subsolo, com o item que força a Resonance), Atos 3–5 e Epílogo.
- Personagens com animação de alta qualidade e arte final (hoje: low-poly procedural).
- Vozes gravadas (hoje: murmúrio sintetizado + legendas).
- Saves em nuvem e analytics anônimos.
- Versão iOS.
