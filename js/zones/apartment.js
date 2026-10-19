// PRÓLOGO — O Primeiro Eco. Apartamento pequeno: tutorial, primeira voz, saída que só aparece no silêncio.
import { THREE, world, box, mat, ghostMat, isTouch } from '../engine.js';
import { Z, Echo, interactable, layered } from '../systems.js';
import { player, cam, input } from '../player.js';
import { Sensor } from '../sensor.js';
import { sfx, makePanner } from '../audio.js';
import { S, flag, setFlag, addNote, addItem } from '../state.js';
import { subtitle, setObjective, say } from '../ui.js';

export const palette = {
  normal: { bg: 0x0c0f17, fogNear: 6, fogFar: 26, sky: 0x8a7a6a, ground: 0x2a2420, hemi: 0.75, moon: 0x8899cc, moonI: 0.5 },
  res: { bg: 0x061a26, fogNear: 4, fogFar: 22, sky: 0x4fa8c8, ground: 0x0a2a3a, hemi: 0.9, moon: 0x7fe9ff, moonI: 0.9 },
};
export const ambient = 'apartment';

export function build(ctx) {
  const g = world.group;
  world.bounds = 8;
  const H = 2.7;
  const wallM = mat(0xcfc6b8), floorM = mat(0x6b5440), woodM = mat(0x5a4030), darkM = mat(0x2a2522);

  // chão, teto, paredes
  box(g, 0, -0.1, 0, 12, 0.1, 9, floorM, { solid: false, cast: false });
  box(g, 0, H, 0, 10.4, 0.1, 7.4, wallM, { cast: false });
  box(g, 0, 0, -3.6, 10.4, H, 0.2, wallM, { collide: true });          // norte
  box(g, -5.1, 0, 0, 0.2, H, 7.4, wallM, { collide: true });           // oeste
  // sul com a porta da frente em x=-3
  box(g, 1.35, 0, 3.6, 7.7, H, 0.2, wallM, { collide: true });
  box(g, -4.55, 0, 3.6, 1.1, H, 0.2, wallM, { collide: true });
  box(g, -3, 2.1, 3.6, 2, 0.6, 0.2, wallM);
  const frontDoor = box(g, -3, 0, 3.55, 1.0, 2.1, 0.12, woodM, { collide: true });
  box(g, -2.65, 1.0, 3.48, 0.08, 0.08, 0.06, 0xd4af37, { solid: false, cast: false });
  // leste com a passagem de serviço escondida (z de -2.4 a -1.2)
  box(g, 5.1, 0, 1.0, 0.2, H, 5.2, wallM, { collide: true });
  box(g, 5.1, 0, -3.0, 0.2, H, 1.2, wallM, { collide: true });
  box(g, 5.1, 2.1, -1.8, 0.2, 0.6, 1.2, wallM);
  const panel = box(g, 5.08, 0, -1.8, 0.16, 2.1, 1.2, wallM, { collide: true });
  // divisória do quarto
  box(g, -1.2, 0, -2.1, 0.15, H, 3.0, wallM, { collide: true });
  // corredor de serviço atrás da parede leste
  box(g, 6.2, -0.1, -1.8, 2.2, 0.1, 1.6, darkM, { solid: false, cast: false });
  box(g, 6.2, 0, -2.7, 2.2, H, 0.2, darkM, { collide: true });
  box(g, 6.2, 0, -0.9, 2.2, H, 0.2, darkM, { collide: true });
  box(g, 7.3, 0, -1.8, 0.2, H, 1.6, darkM, { collide: true });

  // janela (luar)
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.1), new THREE.MeshBasicMaterial({ color: 0x5a78a8 }));
  win.position.set(0.8, 1.55, -3.49);
  g.add(win);
  box(g, 0.8, 1.0, -3.45, 1.8, 0.08, 0.14, woodM, { solid: false });

  // móveis
  box(g, 0.8, 0, 1.7, 2.1, 0.45, 0.85, 0x3d4a5c, { collide: true });        // sofá
  box(g, 0.8, 0.45, 2.05, 2.1, 0.45, 0.2, 0x3d4a5c);
  box(g, 0.8, 0, 0.3, 1.1, 0.4, 0.6, woodM, { collide: true });              // mesa de centro
  box(g, 3.65, 0, -3.15, 2.3, 0.92, 0.6, 0x8a8a84, { collide: true });       // bancada
  box(g, 3.65, 0.92, -3.15, 2.3, 0.05, 0.62, 0x444444);
  box(g, 4.8, 0, 0.6, 0.45, 2.1, 1.8, woodM, { collide: true });             // estante
  for (let i = 0; i < 4; i++) box(g, 4.62, 0.3 + i * 0.5, 0.6, 0.1, 0.32, 1.5, [0x8b3a3a, 0x3a5a8b, 0x6b8b3a, 0x8b7a3a][i], { solid: false, cast: false });
  box(g, -3.6, 0, -2.3, 2.0, 0.5, 2.2, 0x6a5a80, { collide: true });          // cama
  box(g, -4.6, 0, 1.5, 0.9, 2.0, 1.6, woodM, { collide: true });             // guarda-roupa
  box(g, -0.4, 0, 2.7, 0.6, 0.65, 0.6, woodM, { collide: true });            // mesinha do rádio
  const radio = box(g, -0.4, 0.65, 2.7, 0.45, 0.25, 0.22, 0x4a3a2a);
  box(g, 2.6, 0, 2.6, 0.7, 0.6, 0.6, 0x9a7a50, { collide: true });           // caixas de mudança
  box(g, 2.6, 0.6, 2.6, 0.55, 0.45, 0.55, 0x8a6a40);
  box(g, -2.4, 0, 0.9, 0.6, 0.5, 0.6, 0x9a7a50, { collide: true });
  const photo = box(g, 4.55, 1.85, 0.2, 0.05, 0.22, 0.3, 0xddddcc, { solid: false });

  // luminária
  box(g, -0.4, 0, 1.5, 0.08, 1.6, 0.08, darkM, { solid: false });
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.3, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd9a0, side: THREE.DoubleSide }));
  shade.position.set(-0.4, 1.7, 1.5);
  g.add(shade);
  const lamp = new THREE.PointLight(0xffc98a, 2.2, 9, 1.6);
  lamp.position.set(-0.4, 1.6, 1.5);
  g.add(lamp);

  // --- Camada Resonance: contorno da porta de serviço e marcas de mão
  const outline = new THREE.Group();
  const om = ghostMat(0x7fe9ff, 0.9);
  for (const [y, h, z, d] of [[0, 2.1, -2.42, 0.06], [0, 2.1, -1.18, 0.06], [2.08, 0.06, -1.8, 1.3]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.04, h, d), om);
    b.position.set(4.98, y + h / 2, z);
    outline.add(b);
  }
  const hand = new THREE.Mesh(new THREE.CircleGeometry(0.12, 12), ghostMat(0x7fe9ff, 0.7));
  hand.rotation.y = -Math.PI / 2;
  hand.position.set(4.97, 1.2, -1.5);
  outline.add(hand);
  // rastro de passos até a porta
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(new THREE.CircleGeometry(0.09, 8), ghostMat(0x7fe9ff, 0.6));
    s.rotation.x = -Math.PI / 2;
    s.position.set(2.0 + i * 0.5, 0.02, -0.4 - i * 0.25 + (i % 2) * 0.15);
    outline.add(s);
  }
  g.add(outline);
  layered(outline, "res");

  // --- Estado do prólogo
  const p = { step: S.flags.pro_step || 0, timer: 0, confT: 0, crouchT: 0, doorOpen: false, triedDoor: false, flick: 0 };
  const radioPanner = makePanner({ x: -0.4, y: 0.8, z: 2.7 }, 'world', 1.5, 12);
  let radioT = 0;

  function openPanel() {
    if (p.doorOpen) return;
    p.doorOpen = true;
    sfx.door();
    panel.userData.collider.on = false;
    world.solids.splice(world.solids.indexOf(panel), 1);
    p.slide = 1;
    setObjective('Atravesse a passagem');
    setFlag('pro_door');
  }

  // --- Interações
  interactable({ pos: new THREE.Vector3(-3, 0, 3.1), label: 'Porta da frente', mesh: frontDoor, onUse: async () => {
    sfx.locked();
    p.triedDoor = true;
    await say([{ who: 'Ari', text: 'Trancada. Por fora? Isso não faz sentido.', voice: false }]);
    if (p.step === 4) toStep5();
  } });
  interactable({ pos: new THREE.Vector3(-0.4, 0, 2.2), label: 'Rádio', mesh: radio, onUse: async () => {
    if (Sensor.R > 0.6) await say([{ who: 'Ari', text: 'O chiado parou. No lugar dele… uma respiração. Como se alguém estivesse do outro lado, esperando.', voice: false }]);
    else { sfx.radio(radioPanner); await say([{ who: 'Ari', text: 'Só chiado. Mas tem um tom por baixo. Sempre a mesma nota.', voice: false }]); }
  } });
  interactable({ pos: new THREE.Vector3(4.2, 0, 0.2), label: 'Foto esquecida', mesh: photo, onUse: async () => {
    await say([
      { who: 'Ari', text: 'Ficou da antiga moradora. Duas irmãs na frente de uma estação de metrô. “Estação Aurora”.', voice: false },
      { who: 'Ari', text: 'Atrás tem escrito: “Lia e Iara, antes de fecharem a linha”.', voice: false },
    ]);
    addItem('foto', 'Foto das irmãs', 'Lia e Iara na frente da Estação Aurora. Deixada pela antiga moradora do apartamento.');
    addNote('n_foto', 'A antiga moradora', 'Meu apartamento era da Lia. Ela deixou uma foto com a irmã, Iara, na Estação Aurora.');
  } });
  interactable({ pos: new THREE.Vector3(4.6, 0, -1.8), radius: 1.6, layer: 'res', label: 'Porta de serviço', mesh: panel,
    enabled: () => p.step >= 5 && !p.doorOpen, onUse: async () => { openPanel(); } });
  interactable({ pos: new THREE.Vector3(4.6, 0, -1.8), radius: 1.6, layer: 'normal', label: 'Marcas na parede', mesh: panel,
    enabled: () => flag('pro_confused') && !p.doorOpen, onUse: async () => {
      await say([{ who: 'Ari', text: 'Tem uma fresta aqui. A parede… é uma porta. Pintaram por cima.', voice: false }]);
      openPanel();
    } });

  // --- O primeiro eco: a voz que só aparece no silêncio
  new Echo({
    id: 'pro_voz', title: 'A voz no apartamento', pos: new THREE.Vector3(3.4, 0, -1.2), facing: Math.PI / 2, pose: 'reach', radius: 3.6, hold: 11,
    active: () => p.step >= 5,
    lines: [
      { who: 'Voz', text: '…tem alguém aí? Se você consegue me ouvir, não faça barulho.' },
      { who: 'Voz', text: 'Eu morei aqui. Eu sei que a porta da frente não abre. Não pra quem escuta.' },
      { who: 'Voz', text: 'A porta de serviço. Atrás da parede, do lado da estante.' },
      { who: 'Voz', text: 'Ela só aparece quando tudo fica quieto. Vai. Antes que o barulho volte.' },
    ],
    onComplete: () => {
      setFlag('voice_heard');
      setObjective('Encontre a saída que só aparece no silêncio');
      ctx.thought({ calmo: 'Eu ouvi. Eu realmente ouvi alguém.', inquieto: 'Tá, isso não foi imaginação. Foi?', neutro: 'Uma voz. Aqui dentro.' });
    },
  });

  function toStep5() {
    if (p.step >= 5) return;
    p.step = 5;
    S.flags.pro_step = 5;
    p.confT = 0;
    if (Sensor.mode === 'mic') {
      setObjective('Fique em silêncio. Escute.');
      ctx.thought({ neutro: 'Esse zumbido… some quando tudo fica quieto. Quieto de verdade.' });
      subtitle('', 'Dica: deixe o SEU ambiente em silêncio por alguns segundos. A barra no canto mostra o limiar.', 6, 'thought');
    } else {
      setObjective('Fique parado. Respire.');
      ctx.thought({ neutro: 'Se eu ficar parado… o zumbido diminui.' });
      subtitle('', 'Dica: fique parado (agachado é mais rápido) até a barra no canto se acalmar.', 6, 'thought');
    }
  }

  const tutorial = [
    { obj: isTouch ? 'Arraste o dedo no lado direito da tela para olhar ao redor' : 'Mova o mouse para olhar ao redor (clique na tela)', done: () => cam.lookTotal > 2.2 },
    { obj: isTouch ? 'Use o analógico à esquerda para andar' : 'Use W A S D para andar', done: () => player.movedDist > 3 },
    { obj: isTouch ? 'Toque em “Correr” e ande' : 'Segure Shift para correr', done: () => player.sprintTime > 0.8 },
    { obj: isTouch ? 'Toque em “Agachar”' : 'Aperte C para agachar', done: () => p.crouchT > 0.5 },
  ];

  Z.updaters.push((dt, R) => {
    p.timer += dt;
    if (player.crouch) p.crouchT += dt;
    outline.visible = outline.visible && p.step >= 5 && !p.doorOpen;
    if (p.slide > 0) { p.slide -= dt; panel.position.z = -1.8 + (1 - Math.max(0, p.slide)) * 1.15; }
    // rádio chia fora da Resonance
    radioT -= dt;
    if (radioT <= 0 && R < 0.5) { radioT = 1.2 + Math.random(); sfx.radio(radioPanner); }

    if (p.step < 4) {
      const t = tutorial[p.step];
      setObjective(t.obj);
      if (t.done()) {
        p.step++;
        S.flags.pro_step = p.step;
        if (p.step === 4) {
          setObjective('Saia do apartamento');
          ctx.thought({ calmo: 'Preciso de ar. Vou dar uma volta.', inquieto: 'Não aguento mais esse lugar. Vou sair.', neutro: 'Vou sair um pouco.' });
        }
      }
    } else if (p.step === 4) {
      if (p.timer > 40) toStep5();
    } else if (p.step === 5 && !flag('voice_heard') && !flag('pro_confused')) {
      // caminho confuso: o jogador não ficou quieto
      const started = Z.echoes[0] && Z.echoes[0].progress > 0;
      if (!started) p.confT += dt;
      if (p.confT > 75) {
        setFlag('pro_confused');
        p.flick = 3;
        ctx.thought({ neutro: 'Não consigo pensar com esse barulho todo… a parede do lado da estante. Ela sempre teve essas marcas?' });
        setObjective('Examine a parede ao lado da estante');
      }
    }
    if (p.flick > 0) {
      p.flick -= dt;
      lamp.intensity = Math.random() < 0.3 ? 0.2 : 2.2;
      if (Math.random() < 0.1) sfx.flicker();
      if (p.flick <= 0) lamp.intensity = 2.2;
    }
    // saída
    if (p.doorOpen && player.pos.x > 5.6) ctx.goZone('hub', 'arrive');
  });

  // ponto de partida
  if (S.flags.pro_door) { p.step = 5; openPanel(); p.slide = 0; panel.position.z = -0.65; }
  return { spawn: { x: -2.6, z: 1.6, yaw: Math.PI * 0.25 }, camMax: 2.3 };
}

export function onEnter(ctx) {
  if (!S.flags.pro_intro) {
    S.flags.pro_intro = true;
    ctx.thought({ neutro: 'Duas semanas nesse apartamento e eu ainda não durmo direito. E esse zumbido…' }, 5);
  }
}

export { input };
