// PRÓLOGO — O Primeiro Eco. Apartamento pequeno: tutorial, primeira voz, saída que só aparece no silêncio.
import { THREE, world, box, mesh, ghostMat, isTouch } from '../engine.js';
import { M, solid, fabric, glow } from '../gfx.js';
import { Z, Echo, interactable, layered } from '../systems.js';
import { player, cam, input } from '../player.js';
import { Sensor } from '../sensor.js';
import { sfx, makePanner } from '../audio.js';
import { S, flag, setFlag, addNote, addItem } from '../state.js';
import { subtitle, setObjective, say } from '../ui.js';

export const palette = {
  normal: { fog: 0x0c0f17, fogNear: 8, fogFar: 30, sky: 0x8a7a6a, ground: 0x2a2420, hemi: 0.35, moon: 0x8899cc, moonI: 0.0, exposure: 1.0 },
  res: { fog: 0x061a26, fogNear: 4, fogFar: 22, sky: 0x4fa8c8, ground: 0x0a2a3a, hemi: 0.6, moon: 0x7fe9ff, moonI: 0.0, exposure: 1.15 },
};
export const ambient = 'apartment';
export const background = 'dark';

export function build(ctx) {
  const g = world.group;
  world.bounds = 8;
  const H = 2.7;
  const wallM = M('wall'), woodM = M('wood');
  const darkWood = solid(0x3a2a20, 0.6), whiteM = solid(0xe8e4dc, 0.5), metalM = solid(0x8a8c90, 0.35, 0.8);

  // chão, teto, paredes
  box(g, 0, -0.1, 0, 12, 0.1, 9, woodM, { solid: false, cast: false });
  box(g, 0, H, 0, 10.4, 0.1, 7.4, solid(0xeae6de, 0.95), { cast: false });
  box(g, 0, 0, -3.6, 10.4, H, 0.2, wallM, { collide: true });          // norte
  box(g, -5.1, 0, 0, 0.2, H, 7.4, wallM, { collide: true });           // oeste
  box(g, 1.35, 0, 3.6, 7.7, H, 0.2, wallM, { collide: true });         // sul (porta em x=-3)
  box(g, -4.55, 0, 3.6, 1.1, H, 0.2, wallM, { collide: true });
  box(g, -3, 2.1, 3.6, 2, 0.6, 0.2, wallM);
  const frontDoor = box(g, -3, 0, 3.55, 1.0, 2.1, 0.08, darkWood, { collide: true, round: 0.02, dynamic: true });
  mesh(g, new THREE.SphereGeometry(0.04, 10, 8), solid(0xd4af37, 0.3, 1), -2.62, 1.0, 3.48, { dynamic: true });
  for (const sx of [-3.55, -2.45]) box(g, sx, 0, 3.5, 0.1, 2.2, 0.06, whiteM, { solid: false });
  box(g, -3, 2.15, 3.5, 1.2, 0.1, 0.06, whiteM, { solid: false });
  // leste com a passagem de serviço escondida (z de -2.4 a -1.2)
  box(g, 5.1, 0, 1.2, 0.2, H, 4.8, wallM, { collide: true });
  box(g, 5.1, 0, -3.0, 0.2, H, 1.2, wallM, { collide: true });
  box(g, 5.1, 2.1, -1.8, 0.2, 0.6, 1.2, wallM);
  const panel = box(g, 5.08, 0, -1.8, 0.16, 2.1, 1.2, wallM, { collide: true, dynamic: true });
  // divisória do quarto
  box(g, -1.2, 0, -2.1, 0.15, H, 3.0, wallM, { collide: true });
  // rodapés
  for (const [x, z, w, d] of [[0, -3.48, 10.2, 0.04], [-4.98, 0, 0.04, 7.2], [1.35, 3.48, 7.7, 0.04], [4.98, 1.2, 0.04, 4.8]]) box(g, x, 0, z, w, 0.1, d, whiteM, { solid: false, cast: false });
  // corredor de serviço
  const darkM = solid(0x23211f, 0.9);
  box(g, 6.2, -0.1, -1.8, 2.2, 0.1, 1.6, darkM, { solid: false, cast: false });
  box(g, 6.2, 0, -2.7, 2.2, H, 0.2, darkM, { collide: true });
  box(g, 6.2, 0, -0.9, 2.2, H, 0.2, darkM, { collide: true });
  box(g, 7.3, 0, -1.8, 0.2, H, 1.6, darkM, { collide: true });
  const stairGlow = new THREE.PointLight(0x9ab0ff, 3, 4, 2);
  stairGlow.position.set(6.6, 2.2, -1.8);
  g.add(stairGlow);

  // janela com a cidade lá fora + cortinas
  const winTex = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 160;
    const x = c.getContext('2d');
    const gr = x.createLinearGradient(0, 0, 0, 160); gr.addColorStop(0, '#0b1426'); gr.addColorStop(1, '#2a3550');
    x.fillStyle = gr; x.fillRect(0, 0, 256, 160);
    for (let i = 0; i < 9; i++) { const bx = i * 30 + Math.random() * 10, bh = 50 + Math.random() * 70; x.fillStyle = '#0a0d16'; x.fillRect(bx, 160 - bh, 26, bh); for (let k = 0; k < 14; k++) if (Math.random() < 0.4) { x.fillStyle = Math.random() < 0.8 ? '#ffcf8a' : '#9ab8ff'; x.fillRect(bx + 3 + (k % 3) * 8, 160 - bh + 6 + Math.floor(k / 3) * 12, 4, 6); } }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.1), new THREE.MeshBasicMaterial({ map: winTex, color: 0xcccccc }));
  win.position.set(0.8, 1.55, -3.49);
  g.add(win);
  for (const [x, y, w, h] of [[0.8, 0.98, 1.8, 0.07], [0.8, 2.1, 1.8, 0.07], [-0.1, 1.0, 0.07, 1.17], [1.7, 1.0, 0.07, 1.17], [0.8, 1.0, 0.04, 1.1]]) box(g, x, y, -3.46, w, h, 0.08, whiteM, { solid: false });
  box(g, 0.8, 0.94, -3.38, 1.9, 0.05, 0.22, whiteM, { solid: false });
  box(g, -0.23, 0.2, -3.4, 0.2, 2.3, 0.08, fabric(0x6a4a5a), { solid: false, round: 0.03 });
  box(g, 1.95, 0.2, -3.4, 0.45, 2.3, 0.08, fabric(0x6a4a5a), { solid: false, round: 0.03 });
  const winLight = new THREE.PointLight(0x7f9cff, 2.5, 6, 2);
  winLight.position.set(0.8, 1.6, -2.6);
  g.add(winLight);

  // sofá
  const sofaM = fabric(0x3d4a5c);
  box(g, 0.8, 0.1, 1.7, 2.1, 0.35, 0.85, sofaM, { collide: true, top: 0.45, round: 0.08 });
  box(g, 0.8, 0.1, 2.05, 2.1, 0.75, 0.22, sofaM, { round: 0.08 });
  for (const sx of [-0.2, 1.8]) box(g, sx, 0.1, 1.7, 0.22, 0.55, 0.85, sofaM, { round: 0.08 });
  for (const sx of [0.35, 1.25]) box(g, sx, 0.45, 1.65, 0.85, 0.14, 0.7, fabric(0x4a5a6e), { solid: false, round: 0.06 });
  box(g, 1.5, 0.55, 1.95, 0.4, 0.35, 0.14, fabric(0xb5653a), { solid: false, round: 0.06 });
  for (const [x, z] of [[-0.2, 1.35], [1.8, 1.35], [-0.2, 2.1], [1.8, 2.1]]) box(g, x, 0, z, 0.06, 0.1, 0.06, darkWood, { solid: false });
  // tapete
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.8), fabric(0x7a4a3a));
  rug.rotation.x = -Math.PI / 2; rug.position.set(0.8, 0.005, 0.6); rug.receiveShadow = true;
  g.add(rug);
  // mesa de centro
  box(g, 0.8, 0.36, 0.3, 1.1, 0.05, 0.6, woodM, { collide: true, top: 0.42, round: 0.02 });
  for (const [x, z] of [[0.3, 0.05], [1.3, 0.05], [0.3, 0.55], [1.3, 0.55]]) box(g, x, 0, z, 0.05, 0.36, 0.05, darkWood, { solid: false });
  mesh(g, new THREE.CylinderGeometry(0.05, 0.04, 0.1, 12), solid(0xe8e4dc, 0.3), 0.6, 0.46, 0.25);
  box(g, 1.0, 0.41, 0.35, 0.3, 0.03, 0.22, solid(0x8a3a3a, 0.8), { solid: false });
  // cozinha: bancada com armários, pia, fogão, geladeira
  box(g, 3.65, 0, -3.15, 2.3, 0.88, 0.6, solid(0x6a7a6e, 0.6), { collide: true, round: 0.02 });
  box(g, 3.65, 0.88, -3.15, 2.36, 0.05, 0.64, solid(0x2a2a2c, 0.25, 0.1), { round: 0.01 });
  for (let i = 0; i < 4; i++) { box(g, 2.75 + i * 0.6, 0.08, -2.84, 0.55, 0.72, 0.02, solid(0x7a8a7e, 0.55), { solid: false }); box(g, 2.75 + i * 0.6 + 0.2, 0.62, -2.82, 0.08, 0.02, 0.03, metalM, { solid: false }); }
  box(g, 3.2, 0.9, -3.15, 0.5, 0.04, 0.38, metalM, { solid: false });
  mesh(g, new THREE.CylinderGeometry(0.015, 0.015, 0.3, 8), metalM, 3.2, 1.08, -3.35);
  for (const [x, z] of [[4.1, -3.0], [4.45, -3.0], [4.1, -3.3], [4.45, -3.3]]) mesh(g, new THREE.CylinderGeometry(0.1, 0.1, 0.02, 16), solid(0x111111, 0.4), x, 0.94, z);
  box(g, -0.72, 0, -3.1, 0.75, 1.9, 0.7, solid(0xe8e8e4, 0.3, 0.1), { collide: true, round: 0.06 });
  box(g, -0.5, 0.9, -2.73, 0.04, 0.6, 0.03, metalM, { solid: false });
  // estante com livros
  box(g, 4.8, 0, 0.6, 0.45, 2.1, 1.8, woodM, { collide: true });
  const bookCols = [0x8b3a3a, 0x3a5a8b, 0x6b8b3a, 0x8b7a3a, 0x5a3a6b, 0x2a2a2a, 0xc8b89a];
  for (let shelf = 0; shelf < 4; shelf++) {
    box(g, 4.62, 0.22 + shelf * 0.5, 0.6, 0.38, 0.03, 1.7, darkWood, { solid: false });
    let z = -0.2;
    while (z < 1.35) { const bw = 0.04 + Math.random() * 0.05, bh = 0.25 + Math.random() * 0.15; box(g, 4.63, 0.25 + shelf * 0.5, z + bw / 2, 0.28, bh, bw, solid(bookCols[(Math.random() * bookCols.length) | 0], 0.8), { solid: false, cast: false }); z += bw + 0.005; if (Math.random() < 0.08) z += 0.15; }
  }
  // cama
  box(g, -3.6, 0, -2.3, 2.0, 0.3, 2.2, darkWood, { collide: true, top: 0.55 });
  box(g, -3.6, 0.3, -2.3, 1.9, 0.22, 2.1, fabric(0xe0dcd4), { solid: false, round: 0.08 });
  box(g, -3.6, 0.5, -1.9, 1.95, 0.08, 1.4, fabric(0x6a5a80), { solid: false, round: 0.04 });
  for (const sx of [-4.1, -3.1]) box(g, sx, 0.52, -3.1, 0.7, 0.16, 0.4, fabric(0xf0ece4), { solid: false, round: 0.07 });
  box(g, -3.6, 0, -3.42, 2.05, 1.0, 0.08, darkWood, { solid: false, round: 0.02 });
  // guarda-roupa
  box(g, -4.6, 0, 1.5, 0.9, 2.1, 1.6, woodM, { collide: true, round: 0.02 });
  box(g, -4.14, 0.05, 1.5, 0.02, 2.0, 0.02, darkWood, { solid: false });
  for (const z of [1.42, 1.58]) mesh(g, new THREE.CylinderGeometry(0.012, 0.012, 0.2, 8), metalM, -4.13, 1.05, z);
  // mesinha do rádio + rádio
  box(g, -0.4, 0, 2.7, 0.6, 0.62, 0.6, woodM, { collide: true, round: 0.02 });
  const radio = box(g, -0.4, 0.62, 2.7, 0.46, 0.26, 0.22, solid(0x5a3a26, 0.5), { round: 0.04, dynamic: true });
  mesh(g, new THREE.CircleGeometry(0.08, 20), solid(0x1a1a1a, 0.9), -0.52, 0.75, 2.59, { dynamic: true }).rotation.y = Math.PI;
  mesh(g, new THREE.CylinderGeometry(0.02, 0.02, 0.03, 10), glow(0xffb070, 2), -0.28, 0.78, 2.585, { dynamic: true }).rotation.x = Math.PI / 2;
  // caixas de mudança com fita
  const card = solid(0xa8834f, 0.9), tape = solid(0xc8b080, 0.5);
  for (const [x, y, z, w, h, d] of [[2.6, 0, 2.6, 0.7, 0.6, 0.6], [2.6, 0.6, 2.6, 0.55, 0.45, 0.55], [-2.4, 0, 0.9, 0.6, 0.5, 0.6]]) {
    box(g, x, y, z, w, h, d, card, { collide: y === 0, round: 0.015 });
    box(g, x, y + h, z, w + 0.005, 0.005, 0.08, tape, { solid: false, cast: false });
  }
  // planta
  mesh(g, new THREE.CylinderGeometry(0.18, 0.13, 0.35, 14), solid(0xb0603a, 0.8), 1.95, 0.175, -2.9);
  for (let i = 0; i < 5; i++) { const l = mesh(g, new THREE.IcosahedronGeometry(0.22, 1), solid(0x3b6a33, 0.8), 1.95 + Math.cos(i) * 0.15, 0.55 + i * 0.07, -2.9 + Math.sin(i * 2) * 0.12); l.scale.set(1, 1.3, 1); }
  const photo = box(g, 4.55, 1.85, 0.2, 0.05, 0.22, 0.3, whiteM, { solid: false, dynamic: true });
  box(g, 4.52, 1.88, 0.2, 0.01, 0.16, 0.24, solid(0x6a7a8a, 0.6), { solid: false });

  // luminária de chão (luz quente)
  mesh(g, new THREE.CylinderGeometry(0.15, 0.18, 0.04, 16), metalM, -0.4, 0.02, 1.5);
  mesh(g, new THREE.CylinderGeometry(0.015, 0.015, 1.6, 8), metalM, -0.4, 0.82, 1.5);
  const shade = mesh(g, new THREE.CylinderGeometry(0.16, 0.26, 0.3, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffc58a, emissiveIntensity: 1.6, side: THREE.DoubleSide }), -0.4, 1.7, 1.5, { cast: false, dynamic: true });
  const lamp = new THREE.PointLight(0xffb878, 9, 10, 2);
  lamp.position.set(-0.4, 1.55, 1.5);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(512, 512);
  lamp.shadow.bias = -0.002;
  g.add(lamp);
  const fill = new THREE.PointLight(0xffd8b0, 2.5, 8, 2);
  fill.position.set(-3.2, 2.2, -1.5);
  g.add(fill);
  void shade;

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
      lamp.intensity = Math.random() < 0.3 ? 0.5 : 9;
      if (Math.random() < 0.1) sfx.flicker();
      if (p.flick <= 0) lamp.intensity = 9;
    }
    // saída
    if (p.doorOpen && player.pos.x > 5.6) ctx.goZone('hub', 'arrive');
  });

  // ponto de partida
  if (S.flags.pro_door) { p.step = 5; openPanel(); p.slide = 0; panel.position.z = -0.65; }
  return { spawn: { x: -2.6, z: 1.6, yaw: Math.PI * 0.25 }, camMax: 2.3, ceiling: 2.5 };
}

export function onEnter(ctx) {
  if (!S.flags.pro_intro) {
    S.flags.pro_intro = true;
    ctx.thought({ neutro: 'Duas semanas nesse apartamento e eu ainda não durmo direito. E esse zumbido…' }, 5);
  }
}

export { input };
