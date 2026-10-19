// Auditoria automática do cenário: alcance de pontos importantes, câmera vazando por paredes,
// objetos sobrepostos, personagens dentro de objetos e rotas de figurantes.
// Uso: python3 -m http.server 8765 (na raiz) e depois: node tools/auditoria.mjs  (requer o pacote playwright)
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 800, height: 450 } })).newPage();
page.on('pageerror', e => console.log('PAGEERR', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CERR', m.text().slice(0, 160)); });
await page.addInitScript(() => { localStorage.setItem('echoes_settings', JSON.stringify({ micMode: 'standard', quality: 'low' })); });
await page.goto('http://localhost:8765/');
await page.waitForFunction(() => !document.getElementById('title').classList.contains('hidden'), null, { timeout: 120000 });
await page.click('#btnNew'); await page.waitForTimeout(300); await page.click('#btnStandardGo'); await page.waitForTimeout(4000);
for (const zone of ['apartment', 'hub']) {
  const rep = await page.evaluate((zone) => {
    const E = window.__echoes; const W = E.world; const out = { zone, issues: [] };
    E.loadZone(zone);
    if (zone === 'apartment') { /* abre a passagem para checar a saída */ for (const c of W.colliders) if (Math.abs(c.minX - 5.0) < 0.05 && c.minZ < -1.8 && c.maxZ > -1.8) c.on = false; }
    const R = 0.32, STEP = 0.2, B = W.bounds;
    const blocked = (x, z) => { if (Math.abs(x) > B || Math.abs(z) > B) return true; for (const c of W.colliders) { if (!c.on) continue; const cx = Math.max(c.minX, Math.min(x, c.maxX)), cz = Math.max(c.minZ, Math.min(z, c.maxZ)); if ((x - cx) ** 2 + (z - cz) ** 2 < R * R) return true; } return false; };
    const n = Math.ceil((2 * B) / STEP) + 1; const key = (i, j) => i * n + j; const toI = (v) => Math.round((v + B) / STEP);
    const sp = E.zoneInfo().spawn; const seen = new Uint8Array(n * n); const q = [];
    const si = toI(sp.x), sj = toI(sp.z);
    if (blocked(sp.x, sp.z)) out.issues.push('spawn bloqueado'); else { seen[key(si, sj)] = 1; q.push([si, sj]); }
    while (q.length) { const [i, j] = q.pop(); for (const [di, dj] of [[1,0],[-1,0],[0,1],[0,-1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= n || b >= n || seen[key(a, b)]) continue; if (blocked(a * STEP - B, b * STEP - B)) continue; seen[key(a, b)] = 1; q.push([a, b]); } }
    const reach = (x, z, r) => { for (let i = toI(x - r); i <= toI(x + r); i++) for (let j = toI(z - r); j <= toI(z + r); j++) { if (i < 0 || j < 0 || i >= n || j >= n || !seen[key(i, j)]) continue; if (Math.hypot(i * STEP - B - x, j * STEP - B - z) <= r) return true; } return false; };
    let cells = 0; for (let i = 0; i < seen.length; i++) cells += seen[i];
    out.reachableArea = (cells * STEP * STEP).toFixed(0) + ' m²';
    for (const it of E.Z.interactables) if (!reach(it.pos.x, it.pos.z, it.radius - 0.05)) out.issues.push(`interação inalcançável: "${it.label}" em (${it.pos.x.toFixed(1)}, ${it.pos.z.toFixed(1)})`);
    for (const e of E.Z.echoes) if (!reach(e.pos.x, e.pos.z, e.radius - 0.3)) out.issues.push(`eco inalcançável: ${e.id}`);
    if (zone === 'apartment' && !reach(5.8, -1.8, 0.2)) out.issues.push('saída do apartamento (x>5.6) inalcançável');
    // câmera: em pontos alcançáveis perto de paredes, vários ângulos
    const P = E.player, C = E.cam, cam = E.camera; let leaks = 0, tested = 0; const samples = [];
    for (let i = 0; i < n; i += 2) for (let j = 0; j < n; j += 2) {
      if (!seen[key(i, j)]) continue; const x = i * STEP - B, z = j * STEP - B;
      // só pontos a menos de 0.8m de algum colisor alto
      let near = false; for (const c of W.colliders) { if (c.top < 1.5) continue; const cx = Math.max(c.minX, Math.min(x, c.maxX)), cz = Math.max(c.minZ, Math.min(z, c.maxZ)); if (Math.hypot(x - cx, z - cz) < 0.8) { near = true; break; } }
      if (!near) continue;
      if (Math.random() > (zone === 'hub' ? 0.25 : 1)) continue;
      for (let a = 0; a < 8; a++) for (const pitch of [-0.9, -0.1, 0.6]) {
        P.pos.set(x, 0, z); C.yaw = (a / 8) * Math.PI * 2; C.pitch = pitch; C.dist = 0.01;
        E.updateCamera(1, 0); tested++;
        const cp = cam.position; const piv = { x, y: 1.6, z };
        // vazamento = câmera dentro de colisor alto OU parede entre a cabeça e a câmera
        let inside = false; for (const c of W.colliders) if (c.on && cp.y < c.top && cp.x > c.minX && cp.x < c.maxX && cp.z > c.minZ && cp.z < c.maxZ) inside = true;
        const T = E.THREE; const head = new T.Vector3(x, 1.6 - 0.45 * 0, z);
        const v = cp.clone().sub(head); const len = v.length(); let through = false;
        if (len > 0.05) { const rc = window.__rc || (window.__rc = new T.Raycaster()); rc.set(head, v.normalize()); rc.far = len; through = rc.intersectObjects(W.solids, false).length > 0; }
        // perto demais de uma face (o plano de corte da câmera mostraria o outro lado)
        let grazing = false; for (const c of W.colliders) if (c.on && c.top > 1.5 && cp.y < c.top && cp.x > c.minX - 0.07 && cp.x < c.maxX + 0.07 && cp.z > c.minZ - 0.07 && cp.z < c.maxZ + 0.07) grazing = true;
        if (grazing) inside = true;
        if (inside) { leaks++; if (samples.length < 6) samples.push(`(${x.toFixed(1)},${z.toFixed(1)}) yaw ${C.yaw.toFixed(2)} pitch ${pitch}`); }
      }
    }
    // colisores que se atravessam (objetos dentro de objetos)
    const cs = W.colliders.filter((c) => c.on);
    for (let a = 0; a < cs.length; a++) for (let b = a + 1; b < cs.length; b++) {
      const A = cs[a], Bc = cs[b];
      const ox = Math.min(A.maxX, Bc.maxX) - Math.max(A.minX, Bc.minX), oz = Math.min(A.maxZ, Bc.maxZ) - Math.max(A.minZ, Bc.minZ);
      if (ox > 0.05 && oz > 0.05) out.issues.push(`sobreposição: [${A.minX.toFixed(1)},${A.minZ.toFixed(1)}→${A.maxX.toFixed(1)},${A.maxZ.toFixed(1)} h${A.top.toFixed(1)}] x [${Bc.minX.toFixed(1)},${Bc.minZ.toFixed(1)}→${Bc.maxX.toFixed(1)},${Bc.maxZ.toFixed(1)} h${Bc.top.toFixed(1)}]`);
    }
    const inCol = (x, z, r) => cs.find((c) => { const cx = Math.max(c.minX, Math.min(x, c.maxX)), cz = Math.max(c.minZ, Math.min(z, c.maxZ)); return (x - cx) ** 2 + (z - cz) ** 2 < r * r; });
    for (const npc of E.Z.npcs) { if (npc.sit) continue; const c = inCol(npc.pos.x, npc.pos.z, 0.25); if (c) out.issues.push(`personagem dentro de objeto: ${npc.name || npc.id}`); }
    for (const e of E.Z.echoes) { if (inCol(e.pos.x, e.pos.z, 0.25)) out.issues.push(`eco dentro de objeto: ${e.id}`); }
    for (const w of E.Z.npcs.filter((n) => n.path)) {
      for (let k = 0; k < w.path.length; k++) {
        const a = w.path[k], b = w.path[(k + 1) % w.path.length];
        for (let t = 0; t <= 1; t += 0.02) { const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t; if (inCol(x, z, 0.3)) { out.issues.push(`figurante ${w.id} atravessa objeto perto de (${x.toFixed(1)}, ${z.toFixed(1)})`); break; } }
      }
    }
    out.cameraTests = tested; out.cameraLeaks = leaks; out.leakSamples = samples;
    return out;
  }, zone);
  console.log(JSON.stringify(rep, null, 1));
}
await browser.close();
