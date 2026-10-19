# DOCUMENTO MESTRE — ECHOES

Versão 1.0 — Documento de design completo
Plataforma inicial: Mobile (Android/iOS)
Câmera: Third-person livre (controle total de olhar e movimento)
Gênero: Aventura narrativa exploratória com camada de sensor
Evolução prevista: Expansão de conteúdo e possível versão em outras plataformas mantendo a mesma conta e progressão

## 1. Visão e Pilares

Echoes é um jogo third-person 3D de exploração e narrativa em que o jogador controla um personagem capaz de perceber uma camada oculta do mundo chamada Resonance. Essa camada só se manifesta de forma completa quando o ambiente real do jogador está suficientemente quieto. O microfone do celular é a ferramenta que mede isso.

Pilares obrigatórios:
- A câmera é sempre third-person livre. O jogador controla o olhar com o dedo ou giroscópio opcional. Não existe câmera fixa ou auto-runner.
- A mecânica de Resonance não é cosmética. Ela altera o que o jogador vê, ouve, pode interagir e quais ameaças existem.
- A história e os personagens precisam ter densidade suficiente para justificar o uso da mecânica. Sem isso a inovação vira gimmick.
- O jogo funciona sem microfone (modo Standard), mas a experiência completa e recomendada é com ele.
- Mundo semi-aberto com áreas densas, não mapa contínuo gigante. Streaming de zonas.

## 2. Mecânica Central — Resonance

O jogo lê o microfone localmente. Nenhum áudio é enviado a servidor. Só são processados volume médio, picos e padrões simples de frequência.

**Calibração (obrigatória no início de cada sessão):**
- 15–20 segundos de medição do ruído base do ambiente atual do jogador.
- O jogo define um limiar pessoal. Tudo é relativo a esse baseline, não a um valor absoluto global.
- Recalibração disponível a qualquer momento no menu.

**Estados:**
- **Silêncio relativo** (abaixo do limiar calibrado por X segundos): entra em Resonance. O mundo revela a camada oculta.
- **Ruído relativo** (acima do limiar): Resonance enfraquece ou some. Certas ameaças só existem ou só atacam nesse estado. Algumas habilidades ou interações exigem ruído deliberado.
- Transição não é instantânea. Existe um buffer de 1,5–3 segundos para evitar oscilação por barulhos curtos.

**O que a Resonance permite:**
- Ver e ouvir ecos (memórias visuais e sonoras de eventos passados).
- Interagir com objetos e personagens que só existem na camada oculta.
- Resolver puzzles que exigem ouvir sequências ou permanecer em silêncio por tempo determinado.
- Reduzir a detecção de certas entidades hostis.
- Acessar diálogos e informações que mudam o rumo de cenas.

**O que o ruído permite ou provoca:**
- Algumas portas ou mecanismos só abrem com um pico de ruído real.
- Certas criaturas ou eventos só se ativam quando o jogador está barulhento.
- Em momentos específicos da história o jogador precisa fazer barulho de propósito (falar, bater palma, etc.) para avançar ou distrair.

Modo Standard (sem microfone): a Resonance é controlada por um medidor interno que o jogador gerencia com ações no jogo (ficar parado, usar itens, etc.). A experiência é completa, porém menos imersiva.

## 3. Controles e Câmera

- Movimento: joystick virtual ou controles de toque configuráveis.
- Câmera: arrastar o dedo na tela para girar livremente em 360°. Opção de giroscópio para ajuste fino de olhar.
- Interação: botão contextual ou toque em objetos destacados.
- Sprint, agachar, interagir com objetos do ambiente.
- Não existe mira automática obrigatória. O jogo não é shooter competitivo; tiros ou confrontos, quando existem, são situacionais e com câmera livre.

## 4. Estrutura do Jogo — Fase por Fase

O jogo é dividido em 5 atos principais + prólogo e epílogo. Cada ato tem zonas exploráveis, eventos obrigatórios e usos específicos da Resonance.

**Prólogo — O Primeiro Eco (15–25 min)**
- Tutorial de movimento e câmera em um apartamento pequeno.
- Primeira calibração de microfone.
- Evento: o personagem ouve uma voz que só aparece quando o ambiente real fica quieto. Se o jogador não ficar quieto, a voz não se manifesta e o prólogo segue por um caminho mais confuso.
- Objetivo: sair do apartamento. A saída só fica clara na camada Resonance.

**Ato 1 — A Cidade que Lembra (2–3 horas)**
- Hub urbano semi-aberto (bairro com 4–5 quarteirões densos).
- Personagens secundários reagem se o jogador usa muito ou pouco a Resonance.
- Missões:
  - Encontrar uma pessoa desaparecida ouvindo ecos em locais específicos (exige silêncio real em 3 pontos).
  - Um puzzle de sequência sonora: o jogador precisa reproduzir um padrão fazendo barulho controlado na vida real ou permanecendo em silêncio absoluto.
- Ameaça introdutória: entidade que só se aproxima quando há ruído. Ficar quieto a afasta.
- Final do ato: escolha narrativa baseada em quantas informações o jogador coletou via Resonance.

**Ato 2 — O Subsolo (2–3 horas)**
- Zona subterrânea linear-com-exploração (túneis, estações abandonadas).
- Resonance aqui revela mapas antigos e diálogos de pessoas que passaram por ali décadas atrás.
- Sequência longa em que o jogador precisa manter silêncio real por vários minutos enquanto atravessa uma área. Qualquer pico de ruído atrai uma perseguição.
- Puzzle central: ouvir três ecos em ordem correta. Cada eco só toca se o ambiente estiver abaixo do limiar.
- Introdução de item que permite “forçar” um breve estado de Resonance mesmo com algum ruído (uso limitado).

**Ato 3 — As Pessoas que Ficaram (3–4 horas)**
- Retorno ao hub urbano com novas áreas desbloqueadas e personagens que evoluíram.
- Várias linhas de relação. Algumas só avançam se o jogador trouxer informações obtidas na Resonance.
- Evento grande: uma cena em que o jogador precisa alternar deliberadamente entre silêncio e ruído para manipular duas entidades ao mesmo tempo.
- Confronto situacional (não é combate livre): usar o ambiente e o estado de Resonance para sobreviver ou escapar.
- Ramificações claras baseadas em escolhas anteriores.

**Ato 4 — O Lugar de Onde Vieram os Ecos (2–3 horas)**
- Zona mais abstrata / onírica. A física e a câmera continuam normais, mas a camada Resonance é mais instável.
- O jogo começa a reagir ao histórico de uso do microfone do jogador ao longo da campanha (quanto tempo ele passou em silêncio vs. ruído).
- Sequências que exigem precisão: ficar quieto por exatamente X segundos, depois produzir um pico de ruído no momento certo.
- Revelações principais da história. Algumas só são completas se o jogador tiver coletado ecos suficientes nos atos anteriores.

**Ato 5 — O Último Silêncio (1,5–2,5 horas)**
- Clímax. Zonas menores e mais focadas.
- Várias cenas em que a presença ou ausência de Resonance muda radicalmente o que acontece com os personagens.
- Final varia de acordo com:
  - Quantidade de ecos coletados.
  - Relações mantidas.
  - Padrão geral de uso do microfone (mais silêncio vs. mais ruído).
- Não existe “final bom” único. Existem finais coerentes com o que o jogador fez.

**Epílogo**
- Cena curta que reflete o estado final do mundo e do personagem.
- Possibilidade de revisitar o hub com novos diálogos.

## 5. Personagens Principais

- Protagonista: pessoa comum que começa a ouvir os ecos. Personalidade reativa ao estilo de jogo do usuário.
- 4–6 personagens secundários com arcos próprios. Pelo menos dois só revelam informações importantes via Resonance.
- Entidades da camada oculta: algumas são memórias, outras são ameaças. Nenhuma é “monstro genérico de terror”.

## 6. Sistemas de Apoio

- Inventário limitado e contextual (itens de história, ferramentas de Resonance, consumíveis).
- Diário automático que registra ecos ouvidos e relações.
- Mundo reativo simples: NPCs comentam ações anteriores e o quanto o jogador “ouve” ou ignora.
- Save automático por zona + saves manuais limitados.

## 7. O que o Jogo Deve Usar (Requisitos Técnicos)

- Engine: Unity (melhor suporte atual a sensores mobile e otimização para aparelhos medianos).
- Microfone: API nativa do sistema operacional. Processamento 100% local. Pedido de permissão claro e reversível.
- Câmera e movimento: sistema third-person padrão com colisão e animação de alta qualidade.
- Áudio: mixer avançado que separa sons do mundo real processado dos sons do jogo. Áudio direcional forte na camada Resonance.
- Otimização: targeting em aparelhos mid-range. Gráficos escaláveis. Streaming de zonas.
- Backend mínimo: apenas para saves em nuvem opcionais e analytics anônimos de uso da mecânica (sem áudio).
- Acessibilidade: modo Standard completo, opções de sensibilidade de microfone, legendas, remapeamento de controles.

## 8. Escopo Realista e Riscos

Este documento descreve o jogo completo desejado. Na prática:
- Um protótipo que já mostre a câmera livre + Resonance funcionando em uma cena leva meses.
- O jogo inteiro como descrito exige equipe (narrativa, programação, arte, áudio, design) e orçamento significativo. Sozinho ou em time muito pequeno o escopo precisa ser cortado (menos atos, menos zonas, menos personagens).
- O maior risco não é técnico: é a história e a direção não serem fortes o suficiente para a mecânica valer a pena. Se os ecos e as cenas forem medianos, o jogador vai tratar o microfone como incômodo.
- Segundo risco: adoção. Muita gente vai jogar no modo Standard. O design precisa garantir que esse modo ainda seja bom.

O documento acima é o jogo escrito. Qualquer corte ou mudança de escopo deve ser feito em cima dessa base, não inventando sistemas novos no meio do caminho.
