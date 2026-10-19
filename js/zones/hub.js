// ATO 1 — A Cidade que Lembra. Hub urbano semi-aberto: praça, café, banca, oficina de rádio, Estação Aurora.
import { THREE, world, box, mat, ghostMat, isTouch, rand } from '../engine.js';
import { Z, Echo, NPC, Estatica, interactable, layered } from '../systems.js';
import { player } from '../player.js';
import { Sensor, onPeak, isAbsoluteSilence } from '../sensor.js';
import { sfx, setPannerPos, makePanner } from '../audio.js';
import { S, flag, setFlag, addNote, addItem, hasItem, meet, rel, echoCount, temperament } from '../state.js';
import { subtitle, setObjective, say, choose, $, toast } from '../ui.js';

export const palette = {
  normal: { bg: 0x121827, fogNear: 14, fogFar: 70, sky: 0x6a7aa0, ground: 0x262a33, hemi: 0.8, moon: 0x9aaad8, moonI: 0.7 },
  res: { bg: 0x08202e, fogNear: 8, fogFar: 55, sky: 0x4fb8d8, ground: 0x0a2a3a, hemi: 0.95, moon: 0x7fe9ff, moonI: 1.0 },
};
export const ambient = 'city';

const LIA = { who: 'Lia', pitch: 225 };

export function build(ctx) {
  const g = world.group;
  world.bounds = 46;

  // ---------- chão
  const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(110, 110), mat(0x2a2d33));
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.receiveShadow = true;
  g.add(asphalt);
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), mat(0x5d5a55));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.02;
  plaza.receiveShadow = true;
  g.add(plaza);
  // calçadas ao longo dos prédios
  const sidewalk = mat(0x4a4845);
  for (const [x, z, w, d] of [[0, -19, 40, 2], [0, 19, 40, 2], [-19, 0, 2, 40], [19, 0, 2, 40]]) box(g, x, 0, z, w, 0.08, d, sidewalk, { solid: false, cast: false });
  // faixas
  for (let i = -10; i <= 10; i += 4) {
    box(g, i, 0, -15.5, 2, 0.02, 0.25, 0x9a9a90, { solid: false, cast: false });
    box(g, i, 0, 15.5, 2, 0.02, 0.25, 0x9a9a90, { solid: false, cast: false });
  }

  // ---------- prédios (quarteirões em L em volta da praça; 4 avenidas)
  const facade = [0x6d6a75, 0x7a6658, 0x5d6b73, 0x80786a, 0x6a5d68, 0x58646a];
  const windowM = new THREE.MeshBasicMaterial({ color: 0xffd28a });
  const windowOff = mat(0x1d222c);
  let fi = 0;
  function building(x0, x1, z0, z1, h) {
    const w = x1 - x0, d = z1 - z0, x = (x0 + x1) / 2, z = (z0 + z1) / 2;
    box(g, x, 0, z, w, h, d, facade[fi++ % facade.length], { collide: true });
    box(g, x, h, z, w + 0.3, 0.3, d + 0.3, 0x3a3a40, { solid: false });
    // janelas nas faces voltadas para as ruas
    const faces = [];
    if (Math.abs(z1) < 30 || Math.abs(z0) < 30) faces.push(['z', z0 > 0 ? z0 - 0.03 : z1 + 0.03, x0, x1]);
    if (Math.abs(x1) < 30 || Math.abs(x0) < 30) faces.push(['x', x0 > 0 ? x0 - 0.03 : x1 + 0.03, z0, z1]);
    for (const [axis, at, a0, a1] of faces) {
      for (let a = a0 + 1.5; a < a1 - 1; a += 2.6) {
        for (let y = 3.5; y < h - 1; y += 3) {
          const lit = Math.random() < 0.35;
          const wm = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.4), lit ? windowM : windowOff);
          if (axis === 'z') { wm.position.set(a, y, at); wm.rotation.y = at > 0 ? Math.PI : 0; }
          else { wm.position.set(at, y, a); wm.rotation.y = at > 0 ? -Math.PI / 2 : Math.PI / 2; }
          g.add(wm);
        }
      }
    }
  }
  const blocks = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    // braço ao longo do eixo x e ao longo do eixo z
    blocks.push([sx > 0 ? 4 : -46, sx > 0 ? 46 : -4, sz > 0 ? 20 : -46, sz > 0 ? 46 : -20]);
    blocks.push([sx > 0 ? 20 : -46, sx > 0 ? 46 : -20, sz > 0 ? 4 : -20, sz > 0 ? 20 : -4]);
  }
  for (const [x0, x1, z0, z1] of blocks) {
    // divide em 2 prédios de alturas diferentes
    if (x1 - x0 > z1 - z0) {
      const m = (x0 + x1) / 2 + rand(-4, 4);
      building(x0, m, z0, z1, rand(9, 16));
      building(m, x1, z0, z1, rand(8, 18));
    } else {
      const m = (z0 + z1) / 2 + rand(-3, 3);
      building(x0, x1, z0, m, rand(9, 16));
      building(x0, x1, m, z1, rand(8, 18));
    }
  }
  // fundo das avenidas
  box(g, 0, 0, -47, 10, 12, 1, 0x4a4650, { collide: true }); // atrás da estação
  box(g, 47, 0, 0, 1, 10, 10, 0x4a4650, { collide: true });
  box(g, -47, 0, 0, 1, 10, 10, 0x4a4650, { collide: true });
  box(g, 0, 0, 47, 10, 10, 1, 0x4a4650, { collide: true });

  // ---------- postes de luz (luz real em poucos; brilho falso nos demais)
  const poleM = mat(0x2a2a30);
  const lampHead = new THREE.MeshBasicMaterial({ color: 0xffdca0 });
  const poolGeo = new THREE.CircleGeometry(3.2, 24);
  const poolMat = new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false });
  const posts = [[-11, -11], [11, -11], [-11, 11], [11, 11], [0, -28], [0, -40], [30, 0], [-30, 0], [0, 30], [16, -16], [-16, 16]];
  posts.forEach(([x, z], i) => {
    box(g, x, 0, z, 0.15, 4.2, 0.15, poleM, { collide: true, solid: false });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.3), lampHead);
    head.position.set(x, 4.2, z);
    g.add(head);
    const pool = new THREE.Mesh(poolGeo, poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x, 0.04, z);
    g.add(pool);
    if (i < 4) {
      const L = new THREE.PointLight(0xffc98a, 18, 16, 1.8);
      L.position.set(x, 4, z);
      g.add(L);
    }
  });

  // ---------- praça: chafariz, bancos, árvores, quadro de cartazes
  box(g, 0, 0, 0, 4.4, 0.6, 4.4, 0x77736c, { collide: true });
  box(g, 0, 0.6, 0, 1, 1.4, 1, 0x8a867e);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 3.8), new THREE.MeshLambertMaterial({ color: 0x2a4a66, emissive: 0x0a1a2a }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.55;
  g.add(water);
  const benchM = mat(0x6a4a30);
  for (const [x, z, r] of [[-7, -4, 0], [7, 4, 0], [-4, 7, 1], [4, -7, 1]]) {
    if (r) box(g, x, 0, z, 0.6, 0.45, 2.0, benchM, { collide: true }); else box(g, x, 0, z, 2.0, 0.45, 0.6, benchM, { collide: true });
  }
  const trunk = mat(0x4a3424), leaf = mat(0x2f4a36);
  for (const [x, z] of [[-9, -8], [9, 8], [-9, 8], [9, -3]]) {
    box(g, x, 0, z, 0.35, 2.6, 0.35, trunk, { collide: true });
    const c = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 0), leaf);
    c.position.set(x, 3.4, z);
    c.castShadow = true;
    g.add(c);
  }
  const board = box(g, -6, 0, 9.5, 2.2, 2.0, 0.15, 0x4a3a2a, { collide: true });
  for (let i = 0; i < 4; i++) box(g, -6.7 + i * 0.45, 0.9, 9.42, 0.36, 0.5, 0.02, 0xeeeedd, { solid: false, cast: false });

  // ---------- Café Lume (fim da avenida oeste)
  box(g, -45.5, 0, 0, 1, 4, 8, 0x5a3a2a, { collide: true });
  const cafeSign = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.8), new THREE.MeshBasicMaterial({ color: 0xffb36b }));
  cafeSign.position.set(-44.9, 3.6, 0); cafeSign.rotation.y = Math.PI / 2;
  g.add(cafeSign);
  const cafeWin = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.2), new THREE.MeshBasicMaterial({ color: 0xffd7a0 }));
  cafeWin.position.set(-44.95, 1.5, 0); cafeWin.rotation.y = Math.PI / 2;
  g.add(cafeWin);
  for (const z of [-2, 2]) { box(g, -41, 0, z, 0.8, 0.75, 0.8, 0x3a2a20, { collide: true }); }
  const cafeL = new THREE.PointLight(0xffb36b, 10, 12, 1.8);
  cafeL.position.set(-43, 3, 0);
  g.add(cafeL);

  // ---------- Oficina do Otávio (fim da avenida leste)
  box(g, 45.5, 0, 0, 1, 4, 8, 0x3a4a3a, { collide: true });
  const shopSign = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 0.8), new THREE.MeshBasicMaterial({ color: 0x8adfa0 }));
  shopSign.position.set(44.9, 3.6, 0); shopSign.rotation.y = -Math.PI / 2;
  g.add(shopSign);
  box(g, 41.5, 0, 0, 1.0, 0.95, 3.2, 0x5a4a3a, { collide: true }); // balcão
  const musicBox = box(g, 41.5, 0.95, -0.8, 0.45, 0.3, 0.35, 0x8a5a3a);
  for (let i = 0; i < 4; i++) box(g, 41.5, 0.95, 0.3 + i * 0.35, 0.3, 0.22, 0.25, 0x2a2a2a, { solid: false });
  const shopL = new THREE.PointLight(0x8adfa0, 8, 11, 1.8);
  shopL.position.set(43, 3, 0);
  g.add(shopL);

  // ---------- Banca do Bruno (canto da praça)
  box(g, 12.5, 0, -12.5, 2.4, 2.2, 1.6, 0x2a5a4a, { collide: true });
  box(g, 12.5, 2.2, -12.5, 2.9, 0.15, 2.2, 0x1a3a2a, { solid: false });
  for (let i = 0; i < 4; i++) box(g, 11.6 + i * 0.6, 0.8, -11.68, 0.45, 0.6, 0.02, [0xd84a4a, 0xe8d84a, 0x4a8ad8, 0xeeeeee][i], { solid: false, cast: false });

  // ---------- Prédio da Dona Celeste (fim da avenida sul)
  box(g, 0, 0, 45.5, 8, 4, 1, 0x6a5a6a, { collide: true });
  box(g, 0, 0, 44.9, 1.4, 2.4, 0.1, 0x3a2a2a, { solid: false });
  box(g, 2.5, 0, 42.5, 2.0, 0.45, 0.6, benchM, { collide: true });

  // ---------- Estação Aurora (fim da avenida norte)
  box(g, -4.4, 0, -42, 0.8, 3.4, 6, 0x5a5a62, { collide: true });
  box(g, 4.4, 0, -42, 0.8, 3.4, 6, 0x5a5a62, { collide: true });
  box(g, 0, 3.4, -42, 9.6, 0.6, 6, 0x4a4a52, { solid: false });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.9), new THREE.MeshBasicMaterial({ color: 0x9ab0d8 }));
  sign.position.set(0, 3.7, -38.95);
  g.add(sign);
  // escada descendo (visual)
  for (let i = 0; i < 6; i++) box(g, 0, -0.25 * i - 0.25, -41 - i * 0.6, 7.8, 0.25, 0.6, 0x3a3a3e, { solid: false, cast: false });
  // portão acústico
  const gate = new THREE.Group();
  for (let i = -3.5; i <= 3.5; i += 0.5) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3.0, 0.08), mat(0x6a6a70));
    bar.position.set(i, 1.5, -39.5);
    bar.castShadow = true;
    gate.add(bar);
  }
  const gateFrame = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.15, 0.15), mat(0x6a6a70));
  gateFrame.position.set(0, 2.9, -39.5);
  gate.add(gateFrame);
  g.add(gate);
  const gateCol = { minX: -4, maxX: 4, minZ: -39.7, maxZ: -39.3, top: 10, on: true };
  world.colliders.push(gateCol);
  const gateHorn = box(g, 3.6, 2.3, -39.3, 0.4, 0.4, 0.3, 0x8a7a5a); // "ouvido" do portão

  // ---------- Camada Resonance: rastro da Lia e marcas
  const trail = new THREE.Group();
  const stepGeo = new THREE.CircleGeometry(0.1, 8);
  const stepMat = ghostMat(0x7fe9ff, 0.55);
  const path = [[0, 40], [0, 20], [-3, 12], [-8, 2], [-20, 0], [-38, 0], [-20, 0], [-4, -4], [-1, -12], [0, -20], [0, -37]];
  for (let s = 0; s < path.length - 1; s++) {
    const [ax, az] = path[s], [bx, bz] = path[s + 1];
    const n = Math.floor(Math.hypot(bx - ax, bz - az) / 0.9);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const m = new THREE.Mesh(stepGeo, stepMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(ax + (bx - ax) * t + (i % 2 ? 0.18 : -0.18), 0.05, az + (bz - az) * t);
      trail.add(m);
    }
  }
  // símbolos de onda nas paredes (só na Resonance)
  const glyphMat = ghostMat(0x7fe9ff, 0.7);
  for (const [x, z, ry] of [[-19.9, -6, Math.PI / 2], [19.9, 6, -Math.PI / 2], [-3.9, -30, Math.PI / 2], [3.9, 26, -Math.PI / 2]]) {
    const r = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.6, 24, 1, 0, Math.PI), glyphMat);
    r.position.set(x, 2.2, z); r.rotation.y = ry;
    trail.add(r);
    const r2 = new THREE.Mesh(new THREE.RingGeometry(0.8, 0.9, 24, 1, 0, Math.PI), glyphMat);
    r2.position.copy(r.position); r2.rotation.y = ry;
    trail.add(r2);
  }
  g.add(trail);
  layered(trail, 'res');

  // =====================================================================
  //  HISTÓRIA DO ATO 1
  // =====================================================================
  const mood = () => temperament();
  function updateObjective() {
    if (!flag('met_iara')) setObjective('Descubra quem é a mulher colando cartazes na praça');
    else if (flag('a1_done')) setObjective('Ato 2 — O Subsolo: em desenvolvimento. Explore o bairro à vontade.');
    else {
      const n = echoCount();
      if (flag('a1_station') && flag('met_iara')) setObjective(`Abra o portão da Estação Aurora · ecos da Lia: ${n}/3`);
      else setObjective(`Encontre Lia: ouça os ecos dela em 3 lugares · ${n}/3`);
    }
  }
  ctx.refreshObjective = updateObjective;

  // ---------- Iara (irmã da Lia)
  new NPC({
    id: 'iara', name: 'Iara', pos: new THREE.Vector3(-6, 0, 8.4), facing: Math.PI,
    colors: { skin: 0xb07a55, top: 0x8a3a4a, legs: 0x2a2a3a, hair: 0x1a1210, longHair: true, accent: 0xe8d0a0 },
    talk: async () => {
      if (!flag('met_iara')) {
        await say([
          { who: 'Iara', text: 'Com licença… você mora por aqui? Já viu essa mulher? Lia Moura. Ela some faz dezoito dias.' },
          { who: 'Ari', text: flag('voice_heard') ? 'Eu… acho que ouvi a voz dela. No meu apartamento.' : 'Eu me mudei faz pouco tempo. Pro antigo apartamento dela, acho.', voice: false },
          { who: 'Iara', text: flag('voice_heard') ? 'Ouviu? Como assim ouviu? …Não, deixa. Todo mundo me fala coisa estranha essa semana.' : 'Você tá morando lá? A polícia nem quis abrir o apartamento.' },
          { who: 'Iara', text: 'A Lia gravava sons da cidade. Dizia que a cidade lembra de tudo, que só fala baixo demais. Eu achava bonito. Agora acho que foi isso que levou ela.' },
          { who: 'Iara', text: 'Se você descobrir qualquer coisa… qualquer coisa… me procura. Eu fico aqui até tirarem os cartazes.' },
        ]);
        setFlag('met_iara');
        meet('iara', 'Iara', 'Irmã da Lia. Procura por ela há 18 dias.');
        meet('lia', 'Lia Moura', 'Desaparecida. Gravava os sons da cidade. Antiga moradora do meu apartamento.');
        addNote('n_lia', 'Lia Moura', 'Lia gravava os sons do bairro. “A cidade lembra de tudo, só fala baixo demais.” Se ela deixou ecos, devem estar onde ela gravava.');
        if (flag('voice_heard')) rel('iara', 1);
        updateObjective();
        ctx.save();
        return;
      }
      const n = echoCount();
      if (n === 0) {
        await say([{ who: 'Iara', text: 'Ela tomava café no Lume todo dia cedo. Sentava na praça. Às vezes ia até a estação velha, a Aurora, ficar parada no portão. Eu nunca entendi.' }]);
      } else if (!flag('iara_heard_' + n)) {
        setFlag('iara_heard_' + n);
        const opts = [
          { text: 'Contar o que ouvi da Lia.', note: `Você tem ${n} eco(s) dela` },
          { text: 'Dizer só que está procurando.' },
        ];
        const c = await choose('Iara', 'Você tá com uma cara… descobriu alguma coisa?', opts);
        if (c === 0) {
          rel('iara', 1);
          await say([
            { who: 'Ari', text: n >= 2 ? 'Ela tinha medo de alguma coisa que segue o barulho. E ela ia pra estação. Pra baixo.' : 'Ela falava de um tom por baixo da cidade. Sempre a mesma nota.', voice: false },
            { who: 'Iara', text: n >= 2 ? 'A Aurora fechou em 1987. Nosso avô trabalhava lá. A Lia era obcecada por essa história.' : 'Um tom… ela me mostrou uma gravação uma vez. Eu não ouvi nada. Ela ficou tão decepcionada.' },
          ]);
          meet('iara', 'Iara', n >= 2 ? 'O avô delas trabalhava na Estação Aurora, fechada em 1987.' : 'Lia mostrou a ela uma gravação “vazia”.');
        } else {
          rel('iara', -1);
          await say([{ who: 'Iara', text: 'Tá. Valeu mesmo assim.' }]);
        }
      } else {
        await say([{ who: 'Iara', text: mood() === 'calmo' ? 'Você é estranhamente calmo(a). Quase me acalma também.' : 'Você parece tão agitado(a) quanto eu.' }]);
      }
    },
  });

  // ---------- Bruno (banca) — comenta o quanto você usa a Resonance; não existe na camada oculta
  new NPC({
    id: 'bruno', name: 'Bruno', pos: new THREE.Vector3(11.2, 0, -10.9), facing: -Math.PI * 0.75, frozenInRes: true,
    colors: { skin: 0xd8a080, top: 0xd88a3a, legs: 0x3a3a5a, hair: 0x5a3a20, hat: 0x2a5a4a },
    talk: async () => {
      if (Sensor.R > 0.6) {
        await say([{ who: 'Ari', text: 'Ele está parado. Como uma foto. Na camada oculta, o Bruno simplesmente… não está aqui.', voice: false }]);
        if (!flag('bruno_frozen')) { setFlag('bruno_frozen'); meet('bruno', 'Bruno', 'Na Resonance ele fica congelado, como se não existisse lá.'); }
        return;
      }
      const first = !flag('met_bruno');
      setFlag('met_bruno');
      meet('bruno', 'Bruno', 'Dono da banca da praça. Vê tudo, acredita em pouco.');
      const silent = S.stats.silent + Sensor.history.silent, noisy = S.stats.noisy + Sensor.history.noisy;
      const lines = [];
      if (first) lines.push({ who: 'Bruno', text: 'Fala, vizinho novo! Jornal, figurinha, fofoca. A fofoca é de graça.' });
      if (silent > noisy * 1.5 && silent > 30) lines.push({ who: 'Bruno', text: 'Te vi parado olhando pro nada um tempão. Igualzinho a moça das fitas. Cuidado, hein.' });
      else if (noisy > silent * 1.5 && noisy > 20) lines.push({ who: 'Bruno', text: 'Calma, criatura! Esse barulho todo acorda o bairro. E tem coisa que não devia acordar.' });
      if (!flag('bruno_clue')) {
        lines.push({ who: 'Bruno', text: 'A Lia? Comprava jornal velho comigo. Só edição de 1987. Pagava em moeda, sempre contadinho.' });
        lines.push({ who: 'Bruno', text: 'Última vez que vi, ela tava indo pro lado da Aurora. Tarde da noite. Com o gravador ligado.' });
        setFlag('bruno_clue');
        addNote('n_bruno', 'O que o Bruno viu', 'Lia comprava jornais de 1987. Foi vista pela última vez indo para a Estação Aurora, à noite, gravando.');
        meet('bruno', 'Bruno', 'Viu Lia indo para a Aurora na última noite.');
      } else if (lines.length === 0) {
        lines.push({ who: 'Bruno', text: ['Esse bairro tá esquisito. Até o silêncio tá fazendo barulho.', 'A Iara não come direito faz dias. Leva um café pra ela.', 'Se você ouvir um chiado andando pela rua, não corre. Sei lá. Dizem.'][(Math.random() * 3) | 0] });
      }
      await say(lines);
    },
  });

  // ---------- Dona Celeste — só revela o importante na Resonance
  new NPC({
    id: 'celeste', name: 'Dona Celeste', pos: new THREE.Vector3(2.5, 0, 42.3), facing: Math.PI, sit: true, hasHiddenLayer: true,
    colors: { skin: 0xe0b090, top: 0x6a4a7a, legs: 0x3a2a4a, hair: 0xd8d8d8, accent: 0xa0d0c0 },
    talk: async () => {
      meet('celeste', 'Dona Celeste', 'Moradora antiga. Senta no banco da avenida sul toda noite.');
      if (Sensor.R > 0.6) {
        if (!flag('celeste_info')) {
          await say([
            { who: 'Dona Celeste', text: 'Ah. Então você também ouve. Quarenta anos eu ouço essa cidade sozinha.', res: true, pitch: 160 },
            { who: 'Dona Celeste', text: 'A moça das gravações sentava aqui comigo. Ela também ouvia. Perguntava da Aurora, da linha que fecharam.', res: true, pitch: 160 },
            { who: 'Dona Celeste', text: 'Meu Antônio trabalhava lá. Ele dizia que o túnel guardava as vozes de quem passava. Que lá embaixo o barulho tem dono.', res: true, pitch: 160 },
            { who: 'Dona Celeste', text: 'Quem desce precisa saber ficar quieto. Não por educação, meu bem. Pra continuar sendo ouvido(a).', res: true, pitch: 160 },
          ]);
          setFlag('celeste_info');
          rel('celeste', 2);
          meet('celeste', 'Dona Celeste', 'Ela ouve a Resonance há 40 anos. O marido, Antônio, trabalhou na Aurora.');
          addNote('n_celeste', 'O que Celeste contou no silêncio', 'Lá embaixo, na linha Aurora, “o barulho tem dono”. Quem desce precisa saber ficar quieto.');
        } else {
          await say([{ who: 'Dona Celeste', text: flag('voice_heard') ? 'Ela te chamou primeiro, não foi? A Lia. Ela escolhe bem.' : 'Ela tentou te chamar, sabia? Você não estava escutando.', res: true, pitch: 160 }]);
        }
      } else {
        await say([
          { who: 'Dona Celeste', text: flag('celeste_info') ? 'Boa noite de novo. Quer sentar? Aqui o barulho chega mais devagar.' : 'Boa noite, meu bem. Essa rua tá barulhenta hoje, não tá? Senta um pouco. Fica quietinho(a) comigo.', pitch: 160 },
        ]);
        if (!flag('celeste_hint')) { setFlag('celeste_hint'); subtitle('', 'Ela parece esperar que você fique em silêncio…', 4, 'thought'); }
      }
    },
  });

  // ---------- Seu Otávio — rabugento; na Resonance fala da caixa da Lia
  new NPC({
    id: 'otavio', name: 'Seu Otávio', pos: new THREE.Vector3(42.6, 0, 1.2), facing: -Math.PI / 2, hasHiddenLayer: true, radius: 2.7,
    colors: { skin: 0x8a5a3a, top: 0x5a6a5a, legs: 0x2a2a2a, hair: 0x9a9a9a, accent: 0x3a3a3a },
    talk: async () => {
      meet('otavio', 'Seu Otávio', 'Conserta rádios na avenida leste. Mal-humorado.');
      if (Sensor.R > 0.6) {
        if (!flag('otavio_res')) {
          await say([
            { who: 'Seu Otávio', text: '…você tá me ouvindo assim? Desse jeito? Faz tempo que ninguém me ouve desse jeito.', res: true, pitch: 120 },
            { who: 'Seu Otávio', text: 'A menina deixou uma caixa comigo. Disse que só abria pra quem soubesse escutar. Eu nunca consegui.', res: true, pitch: 120 },
            { who: 'Seu Otávio', text: 'Ela toca uma sequência. Som, silêncio. Ou… se você ficar quieto de verdade, ela toca sozinha.', res: true, pitch: 120 },
          ]);
          setFlag('otavio_res');
          rel('otavio', 1);
          meet('otavio', 'Seu Otávio', 'Guarda uma caixa de música que a Lia deixou com ele.');
        } else {
          await say([{ who: 'Seu Otávio', text: flag('box_open') ? 'Leva a fita. E não desce sozinho(a).' : 'A caixa tá no balcão. Escuta ela primeiro.', res: true, pitch: 120 }]);
        }
      } else {
        await say([{ who: 'Seu Otávio', text: flag('box_open') ? 'Hm. Você abriu a caixa. A menina tinha razão sobre você, então.' : flag('otavio_res') ? 'Já falei o que tinha pra falar. Ou você ouviu, ou não ouviu.' : 'Tá fechado. Rádio velho não conserta sozinho, e eu não converso de graça.', pitch: 120 }]);
      }
    },
  });

  // ---------- Quadro de cartazes
  interactable({ pos: new THREE.Vector3(-6, 0, 8.8), label: 'Cartazes', mesh: board, radius: 1.6, enabled: () => true, onUse: async () => {
    await say([{ who: 'Ari', text: '“DESAPARECIDA: LIA MOURA, 29 anos. Vista pela última vez perto da Estação Aurora.” A foto é a mesma do meu apartamento.', voice: false }]);
  } });

  // =====================================================================
  //  ECOS DA LIA (silêncio real em 3 pontos)
  // =====================================================================
  const afterEcho = () => {
    if (!flag('estatica_on')) {
      setFlag('estatica_on');
      Z.threat.activate();
      setTimeout(() => {
        subtitle('', 'Um chiado atravessa a rua. Ele parece… procurar alguma coisa.', 5, 'thought');
        toast('Ameaça: a Estática se aproxima de quem faz barulho. O silêncio a afasta.');
      }, 2500);
    }
    updateObjective();
    ctx.save();
  };
  new Echo({
    id: 'a1_cafe', title: 'Café Lume, 7h12', pos: new THREE.Vector3(-41.5, 0, 0), facing: -Math.PI / 2, pose: 'record',
    lines: [
      { ...LIA, text: 'Dia quarenta e um. Máquina de espresso, sete e doze. Ouve isso?' },
      { ...LIA, text: 'Por baixo do vapor tem outra coisa. Um tom. Sempre a mesma nota.' },
      { ...LIA, text: 'A cidade não esquece o que ouviu. Ela só fala baixo demais.' },
      { ...LIA, text: 'Se eu sumir, Iara… me procura no silêncio. Não no barulho.' },
    ],
    onComplete: afterEcho,
  });
  new Echo({
    id: 'a1_praca', title: 'A praça, de madrugada', pos: new THREE.Vector3(-3.4, 0, -3.2), facing: 0.8, pose: 'argue',
    lines: [
      { ...LIA, text: 'Para. Para de me seguir.' },
      { ...LIA, text: 'Você não é um monstro, né? Você é tudo que ninguém quis escutar.' },
      { ...LIA, text: 'Quanto mais barulho eu faço, mais perto você chega…' },
      { ...LIA, text: '…então eu vou ficar quieta. Bem quieta. E você vai embora.' },
    ],
    onComplete: () => { addNote('n_estatica', 'A Estática', 'Lia: “Você é tudo que ninguém quis escutar.” Ela se aproxima com barulho e vai embora com silêncio.'); afterEcho(); },
  });
  new Echo({
    id: 'a1_estacao', title: 'O portão da Aurora', pos: new THREE.Vector3(0, 0, -36), facing: Math.PI, pose: 'kneel',
    lines: [
      { ...LIA, text: 'O tom vem lá de baixo. Da linha que fecharam em oitenta e sete.' },
      { ...LIA, text: 'O portão é antigo. Acústico. Abre com um grito. Fecha com o silêncio.' },
      { ...LIA, text: 'Se alguém estiver ouvindo isso… não me procura sozinho.' },
      { ...LIA, text: 'Iara, desculpa por não ter te contado.' },
    ],
    onComplete: () => {
      setFlag('a1_station');
      addNote('n_portao', 'O portão acústico', 'O portão da Estação Aurora abre com um som alto e real. “Abre com um grito, fecha com o silêncio.”');
      afterEcho();
    },
  });

  // =====================================================================
  //  PUZZLE — Caixa de música da Lia (barulho controlado OU silêncio absoluto)
  // =====================================================================
  const PATTERN = [1, 0, 1, 1, 0, 1]; // 1 = som, 0 = silêncio
  const SLOT = 1.25;
  const pz = { active: false, phase: 'idle', t: 0, slot: -1, got: [], hit: false, silentT: 0 };
  const pzEl = $('puzzle'), slotsEl = $('pzSlots'), pzText = $('pzText');
  function drawSlots(states) {
    slotsEl.innerHTML = PATTERN.map((v, i) => `<div class="slot ${v ? 'noise' : 'quiet'} ${states[i] || ''}">${v ? '●' : '○'}</div>`).join('');
  }
  let unPeak = null;
  function startPuzzle() {
    pz.active = true; pz.phase = 'demo'; pz.t = -0.8; pz.slot = -1; pz.got = []; pz.silentT = 0;
    pzEl.classList.remove('hidden');
    pzText.textContent = 'Escute a sequência…';
    drawSlots([]);
    player.puzzleLock = true;
    unPeak = onPeak(() => { if (pz.phase === 'play' && pz.slot >= 0) pz.hit = true; });
  }
  function endPuzzle(success) {
    pz.active = false;
    pzEl.classList.add('hidden');
    player.puzzleLock = false;
    if (unPeak) unPeak();
    if (success) {
      sfx.success();
      setFlag('box_open');
      setFlag('otavio_info');
      rel('otavio', 1);
      addItem('fita7', 'Fita da Lia nº 7', 'Gravação do túnel: três estações abaixo da Aurora, alguém cantarola a mesma nota. No fim, a voz da Lia: “Plataforma 3. Me espera.”');
      addNote('n_fita', 'A fita da caixa', 'A linha Aurora tem três estações abaixo da cidade. A Lia marcou a “Plataforma 3”.');
      subtitle('', 'A caixa se abre. Dentro, uma fita cassete com a letra da Lia: “nº 7”.', 5, 'thought');
      ctx.save();
    }
  }
  $('pzCancel').addEventListener('click', () => { if (pz.active) endPuzzle(false); });
  interactable({ pos: new THREE.Vector3(40.6, 0, -0.8), label: 'Caixa de música', mesh: musicBox, radius: 1.5,
    enabled: () => flag('otavio_res') && !flag('box_open') && !pz.active, onUse: async () => {
      const how = Sensor.mode === 'mic' ? 'Reproduza a sequência: faça um som curto e real (palma, estalo, voz) nos ●, e silêncio nos ○.' : 'Reproduza a sequência com o botão Barulho nos ● e nada nos ○.';
      await say([{ who: 'Ari', text: 'Uma caixa de música com um furinho do lado, como um ouvido. ' + how, voice: false }]);
      startPuzzle();
    } });
  Z.updaters.push((dt) => {
    if (!pz.active) return;
    pz.t += dt;
    const ctxS = { crouch: player.crouch, speed: 0 };
    // caminho alternativo: silêncio absoluto por 12s
    if (isAbsoluteSilence(ctxS)) pz.silentT += dt; else pz.silentT = 0;
    if (pz.silentT > 12) {
      pzText.textContent = 'No silêncio absoluto, a caixa toca sozinha… e se abre.';
      PATTERN.forEach((v, i) => setTimeout(() => (v ? sfx.musicNote(i) : sfx.musicRest()), i * 300));
      drawSlots(PATTERN.map(() => 'ok'));
      setTimeout(() => endPuzzle(true), 2200);
      pz.phase = 'done';
      return;
    }
    if (pz.phase === 'demo') {
      const s = Math.floor(pz.t / SLOT);
      if (s !== pz.slot && s >= 0) {
        pz.slot = s;
        if (s < PATTERN.length) {
          PATTERN[s] ? sfx.musicNote(s) : sfx.musicRest();
          drawSlots(PATTERN.map((_, i) => (i === s ? 'now' : '')));
        } else {
          pz.phase = 'ready'; pz.t = 0; pz.slot = -1;
          pzText.textContent = 'Sua vez. Prepare-se… (ou fique em silêncio absoluto por 12s)';
          drawSlots([]);
        }
      }
    } else if (pz.phase === 'ready') {
      if (pz.t > 1.6) { pz.phase = 'play'; pz.t = 0; pz.slot = 0; pz.hit = false; }
    } else if (pz.phase === 'play') {
      const s = Math.floor(pz.t / SLOT);
      if (s !== pz.slot) {
        // avalia o slot que terminou
        const ok = (PATTERN[pz.slot] === 1) === pz.hit;
        pz.got[pz.slot] = ok ? 'ok' : 'bad';
        if (pz.hit) sfx.musicNote(pz.slot);
        pz.hit = false;
        pz.slot = s;
        if (!ok) {
          sfx.fail();
          pzText.textContent = PATTERN[pz.got.length - 1] ? 'Faltou som ali. A caixa vai tocar de novo.' : 'Era silêncio ali. A caixa vai tocar de novo.';
          drawSlots(pz.got);
          pz.phase = 'retry'; pz.t = 0;
          return;
        }
        if (s >= PATTERN.length) {
          pzText.textContent = 'A sequência está certa.';
          drawSlots(pz.got);
          pz.phase = 'done';
          setTimeout(() => endPuzzle(true), 900);
          return;
        }
      }
      drawSlots(PATTERN.map((_, i) => (i === pz.slot ? 'now' : pz.got[i] || '')));
      pzText.textContent = PATTERN[pz.slot] ? '● Agora: som!' : '○ Agora: silêncio.';
    } else if (pz.phase === 'retry') {
      if (pz.t > 2) { pz.phase = 'demo'; pz.t = -0.5; pz.slot = -1; pz.got = []; pzText.textContent = 'Escute a sequência…'; }
    }
  });

  // =====================================================================
  //  A ESTÁTICA (ameaça introdutória)
  // =====================================================================
  Z.threat = new Estatica(new THREE.Vector3(14, 0, 14), () => ctx.engulf());
  if (flag('estatica_on')) Z.threat.activate();
  Z.peakHandlers.push((s) => Z.threat.peak(s));

  // =====================================================================
  //  PORTÃO ACÚSTICO e escolha final do ato
  // =====================================================================
  const gs = { waiting: false, open: 0 };
  interactable({ pos: new THREE.Vector3(0, 0, -38.6), label: 'Portão acústico', mesh: gateHorn, radius: 2.4,
    enabled: () => !flag('a1_done') && !gs.waiting, onUse: async () => {
      if (!flag('a1_station')) {
        await say([{ who: 'Ari', text: 'Trancado. Tem uma espécie de corneta presa na grade, virada pra rua. Como um ouvido.', voice: false }]);
        if (!flag('met_iara')) return;
        ctx.thought({ neutro: 'A Lia vinha até aqui. Se ela deixou alguma coisa, foi no silêncio.' });
        return;
      }
      if (!flag('met_iara')) {
        await say([{ who: 'Ari', text: 'Antes de descer… a mulher dos cartazes na praça. Ela precisa saber.', voice: false }]);
        return;
      }
      await finalChoice();
    } });

  async function finalChoice() {
    const n = echoCount();
    const info = n + (flag('celeste_info') ? 1 : 0) + (flag('otavio_info') ? 1 : 0);
    const opts = [
      { text: 'Ligar para a Iara e contar tudo o que eu ouvi.', note: n >= 2 ? `Você reuniu ${n} ecos` : 'Exige ao menos 2 ecos da Lia', hidden: false, disabled: n < 2 },
      { text: 'Mandar só uma mensagem: “Acho que sei onde a Lia está.”' },
      { text: 'Descer sozinho(a). Ninguém acreditaria.' },
      { text: 'Pedir ao Seu Otávio que vigie a entrada com o rádio.', note: 'Você abriu a caixa da Lia', hidden: !flag('otavio_info') },
    ];
    let c;
    for (;;) {
      c = await choose('Ari', `Antes de abrir o portão… (informações reunidas: ${info})`, opts);
      if (!opts[c].disabled) break;
      subtitle('', 'Você ainda não sabe o suficiente para contar tudo.', 3, 'thought');
    }
    const end = ['contou_tudo', 'mensagem', 'sozinho', 'otavio'][c];
    setFlag('a1_choice', end);
    if (end === 'contou_tudo') {
      rel('iara', 2);
      await say([
        { who: 'Iara', text: '…Você ouviu a voz dela. De verdade. Ela pediu desculpa?', pitch: 200 },
        { who: 'Iara', text: 'Me espera. Eu vou com você. Não discute.', pitch: 200 },
      ]);
    } else if (end === 'mensagem') {
      await say([{ who: 'Ari', text: 'Mensagem enviada. Duas marcas azuis. Nenhuma resposta. Ainda.', voice: false }]);
    } else if (end === 'sozinho') {
      rel('iara', -1);
      ctx.thought({ calmo: 'Ela pediu pra ninguém descer sozinho. Mas ninguém mais ouve o que eu ouço.', inquieto: 'Melhor assim. Ninguém pra me atrasar.', neutro: 'Vou sozinho(a). Por enquanto.' });
    } else {
      rel('otavio', 2);
      await say([{ who: 'Seu Otávio', text: '(pelo rádio) Tô na escuta. Se o chiado mudar de tom, eu te aviso. Vai devagar.', pitch: 120 }]);
    }
    // o portão só abre com um pico de ruído REAL
    gs.waiting = true;
    $('noiseCue').innerHTML = Sensor.mode === 'mic' ? 'Faça barulho de verdade:<br>bata palma ou fale alto' : 'Use o botão Barulho';
    $('noiseCue').classList.remove('hidden');
    setObjective('Faça barulho para abrir o portão');
    const un = onPeak(() => {
      if (!gs.waiting) return;
      gs.waiting = false;
      un();
      $('noiseCue').classList.add('hidden');
      sfx.gate();
      gs.open = 0.001;
      gateCol.on = false;
      setFlag('a1_done');
      setTimeout(() => ctx.endAct(), 3200);
    });
  }
  Z.updaters.push((dt) => {
    if (gs.open > 0 && gs.open < 1) { gs.open = Math.min(1, gs.open + dt * 0.4); gate.position.y = gs.open * 2.9; }
  });

  if (flag('a1_done')) { gate.position.y = 2.9; gateCol.on = false; }
  updateObjective();
  const spawns = { arrive: { x: -2.5, z: 37, yaw: 0 } };
  return { spawn: spawns.arrive, camMax: 3.4 };
}

export function onEnter(ctx) {
  if (!S.flags.hub_intro) {
    S.flags.hub_intro = true;
    ctx.thought({
      calmo: 'A rua. O ar frio ajuda. Mas o zumbido veio junto.',
      inquieto: 'Ok. Rua. Gente. Barulho normal. Tá tudo normal.',
      neutro: 'A escada de serviço dava direto na rua de trás.',
    }, 5);
    setTimeout(() => subtitle('', 'Na praça, alguém cola cartazes nos postes.', 4, 'thought'), 5500);
  }
  if (ctx.refreshObjective) ctx.refreshObjective();
}
