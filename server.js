// CAOS vs ORDEN - servidor autoritativo (Node.js + Express + Socket.io)
const express = require("express"), http = require("http"), path = require("path");
const { Server } = require("socket.io");
const app = express(), srv = http.createServer(app), io = new Server(srv);
app.use(express.static(path.join(__dirname, "public")));

const walls = [{x:0,y:0,w:1400,h:20},{x:0,y:880,w:1400,h:20},{x:0,y:0,w:20,h:900},{x:1380,y:0,w:20,h:900},{x:460,y:0,w:16,h:300},{x:460,y:420,w:16,h:480},{x:940,y:0,w:16,h:450},{x:940,y:570,w:16,h:330},{x:0,y:450,w:320,h:16},{x:1080,y:450,w:320,h:16}];
const R = [{t:"orden",z:18,sx:580,sy:170},{t:"orden",z:20,sx:650,sy:170},{t:"orden",z:18,sx:720,sy:170},{t:"caos",z:22,sx:580,sy:780},{t:"caos",z:20,sx:650,sy:780},{t:"caos",z:18,sx:720,sy:780}];
const DN = ["Chica 1","Chica 2","Chica 3","Chico 1","Chico 2","Chico 3"];
const ICO = ["👧","🎀","👻","🐕","⚡","⚽"];
const SAY = ["¡Las 4 ayudantes!","¡Pegatinas!","¡A charlar!","¡Perro suelto!","¡Súper velocidad!","¡Pelotazo!"];
const RAW = [[200,180,90,50,"#b45309","table"],[160,185,26,26,"#d97706","chair"],[305,185,26,26,"#d97706","chair"],[100,80,40,30,"#16a34a","plant"],[380,35,45,18,"#f43f5e","picture"],[120,560,50,45,"#0ea5e9","sofa"],[340,620,50,30,"#1f2937","tv"],[150,780,80,34,"#92400e","shelf"],[650,220,140,55,"#2563eb","sofa"],[680,320,80,45,"#b7791f","table"],[550,260,45,45,"#3b82f6","sofa"],[660,430,120,30,"#78350f","shelf"],[680,35,70,18,"#eab308","picture"],[630,620,150,90,"#10b981","bed"],[830,680,40,40,"#f59e0b","lamp"],[1150,140,110,130,"#ec4899","bed"],[1020,80,80,40,"#d6b98c","table"],[1040,135,30,30,"#ef4444","chair"],[1180,650,80,120,"#8b5cf6","wardrobe"],[1020,780,100,35,"#a16207","table"]];
const NBASE = RAW.length;
const clean = n => String(n || "").replace(/[<>&"']/g, "").trim().slice(0, 12);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rooms = {};

function Game(code, onEmpty) {
  const slots = Array(6).fill(null); // {o: socketId, n: nombre}
  let ph = "lobby", cd = 30, cdT = null, tickT = null, secT = null, endT = null;
  let pl = [], it = [], dg = [], mn = [], gh = [], bl = [], tm = 180, fr = 0, last = 0, lastSnap = 0;
  const ev = (n, d) => io.to(code).emit(n, d);
  const socks = () => [...(io.sockets.adapter.rooms.get(code) || [])];
  const lobby = () => ({ ph, cd: cdT ? cd : null, s: slots.map(s => s && { n: s.n, o: s.o }) });
  const bc = () => ev("lobby", lobby());
  const mine = s => pl.find(p => p.owner === s.id);

  /* ---------- Sala de espera ---------- */
  function startCD() {
    if (cdT || ph !== "lobby") return;
    cd = 30;
    cdT = setInterval(() => { cd--; if (cd <= 0) { if (slots.some(Boolean)) return start(); cd = 30; } bc(); }, 1000);
    bc();
  }
  function resetLobby() {
    clearTimeout(endT); clearInterval(tickT); clearInterval(secT); clearInterval(cdT); cdT = null;
    ph = "lobby"; slots.fill(null); pl = []; it = [];
    if (socks().length) startCD();
    bc();
  }
  function startData(me) {
    return { me, it: it.map(o => [o.x, o.y, o.w, o.h, o.c, o.k, o.m ? 1 : 0, Math.round(o.tx), Math.round(o.ty)]).slice(0, NBASE), pl: pl.map(p => [p.n, p.pw]) };
  }
  function start() {
    clearInterval(cdT); cdT = null; ph = "playing";
    const perm = [0,1,2,3,4,5].sort(() => Math.random() - .5); // poderes al azar
    it = RAW.map((o, i) => ({ x:o[0], y:o[1], w:o[2], h:o[3], c:o[4], k:o[5], m:i % 2 == 1, p:false, tx:0, ty:0 }));
    pl = R.map((r, i) => ({ id:i, t:r.t, z:r.z, v:3.4, x:r.sx, y:r.sy, owner:slots[i] ? slots[i].o : null,
      n: slots[i] ? slots[i].n : DN[i] + " 🤖", pw:perm[i], cd:0, ft:0, st:0, bl:0, wd:0, ang:0, sk:0, lx:r.sx, ly:r.sy, mvg:0, ix:0, iy:0, th:null, tg:null }));
    dg = []; mn = []; gh = []; bl = []; tm = 180; fr = 0;
    for (const id of socks()) { const s = io.sockets.sockets.get(id); if (s) s.emit("start", startData(pl.findIndex(p => p.owner === id))); }
    last = Date.now(); lastSnap = 0;
    tickT = setInterval(tick, 16); secT = setInterval(sec, 1000);
  }
  function end() {
    clearInterval(tickT); clearInterval(secT); ph = "ended";
    ev("end", { o: score() });
    endT = setTimeout(resetLobby, 20000);
  }

  /* ---------- Lógica de juego (servidor autoritativo) ---------- */
  function score() { return Math.round(it.filter(o => !o.m).length / it.length * 100); }
  function mv(e, dx, dy) {
    const hit = (x, y) => walls.some(w => x + e.z > w.x && x - e.z < w.x + w.w && y + e.z > w.y && y - e.z < w.y + w.h);
    const ox = e.x, oy = e.y;
    if (!hit(e.x + dx, e.y)) e.x += dx;
    if (!hit(e.x, e.y + dy)) e.y += dy;
    if (e.x != ox || e.y != oy) e.mvg = 1;
  }
  const wh = (x, y, r) => walls.some(w => x + r > w.x && x - r < w.x + w.w && y + r > w.y && y - r < w.y + w.h);
  const elig = (t, o) => (t == "orden" && o.m) || (t == "caos" && !o.m && !o.p);
  function apply(t, o) {
    if (t == "orden") {
      if (o.p) { const i = it.indexOf(o); if (i >= 0) it.splice(i, 1); ev("clean", { x: o.x + 8, y: o.y + 8 }); }
      else { o.m = false; o.tx = 0; o.ty = 0; ev("kick", { i: it.indexOf(o), t: "orden", tx: 0, ty: 0, sp: 0 }); }
    } else {
      o.m = true; o.tx = (Math.random() - .5) * 80; o.ty = (Math.random() - .5) * 60;
      ev("kick", { i: it.indexOf(o), t: "caos", tx: o.tx, ty: o.ty, sp: .35 * (Math.random() < .5 ? -1 : 1) });
    }
  }
  function near(a) {
    let best = null, bd = 95;
    for (const o of it) { const d = Math.hypot(a.x - (o.x + o.w / 2), a.y - (o.y + o.h / 2)); if (d < bd && elig(a.t, o)) { bd = d; best = o; } }
    return best;
  }
  function act(a) { if (ph !== "playing" || a.st > 0 || a.bl > 0) return; const b = near(a); if (b) apply(a.t, b); }
  const say = (a, t) => { if (a.owner) io.to(a.owner).emit("msg", t); };
  function pwr(a) {
    if (ph !== "playing" || a.cd > 0 || a.st > 0 || a.bl > 0) return;
    a.cd = 15; const w = a.pw, rv = pl.filter(p => p.t != a.t);
    if (w == 0) for (let i = 0; i < 4; i++) mn.push({ x: a.x + (Math.random() - .5) * 70, y: a.y + (Math.random() - .5) * 70, t: a.t, l: 180, ci: i });
    if (w == 1) { let n = 0; rv.forEach(p => { if (Math.hypot(p.x - a.x, p.y - a.y) < 300) { p.bl = 3; n++; } }); if (!n) a.cd = 0; }
    if (w == 2) { const t = rv.find(p => Math.hypot(p.x - a.x, p.y - a.y) < 220 && p.st <= 0); if (t) { t.st = 3; gh.push({ x: t.x + 16, y: t.y, l: 180 }); } else a.cd = 0; }
    if (w == 3) dg.push({ x: a.x, y: a.y, vx: (Math.random() - .5) * 7, vy: (Math.random() - .5) * 7, l: 180, c: 0, t: a.t });
    if (w == 4) a.ft = 3;
    if (w == 5) { const an = Math.random() * 6.28; bl.push({ x: a.x, y: a.y, vx: Math.cos(an) * 9, vy: Math.sin(an) * 9, l: 360, t: a.t }); }
    if (a.cd > 0) { a.th = { t: ICO[w], l: 90 }; ev("pw", { id: a.id, pw: w }); say(a, SAY[w]); } else say(a, "Sin rivales cerca");
  }
  function botAI(b) {
    if (b.st > 0) return;
    const s = (b.ft > 0 ? b.v * 1.7 : b.v) * .85;
    if (fr % 20 == 0) { b.sk = Math.hypot(b.x - b.lx, b.y - b.ly) < 8 ? b.sk + 1 : 0; b.lx = b.x; b.ly = b.y; if (b.sk >= 2) { b.wd = 40; b.ang = Math.random() * 6.28; b.sk = 0; } }
    if (b.bl > 0 && b.wd <= 0) { b.wd = 20; b.ang = Math.random() * 6.28; }
    if (b.wd > 0) { b.wd--; mv(b, Math.cos(b.ang) * s, Math.sin(b.ang) * s); return; }
    // objetivo "inteligente": cercano, pero repartiéndose entre compañeros de equipo
    if (!b.tg || !it.includes(b.tg) || !elig(b.t, b.tg) || fr % 90 == 0) {
      let best = null, bs = 1e9;
      for (const o of it) if (elig(b.t, o)) {
        const d = Math.hypot(b.x - (o.x + o.w / 2), b.y - (o.y + o.h / 2)) + pl.filter(q => q !== b && q.t == b.t && q.tg === o).length * 160 + Math.random() * 50;
        if (d < bs) { bs = d; best = o; }
      }
      b.tg = best;
    }
    if (b.tg) {
      const dx = b.tg.x + b.tg.w / 2 - b.x, dy = b.tg.y + b.tg.h / 2 - b.y, d = Math.hypot(dx, dy) || 1;
      if (d > 60) mv(b, dx / d * s, dy / d * s);
      if (d < 85 && fr % 12 == 0) act(b);
    }
    if (b.ft > 0 && fr % 6 == 0) act(b);
    if (b.cd <= 0 && fr % 30 == 0 && Math.random() < .4) {
      if ((b.pw == 1 || b.pw == 2) && !pl.some(q => q.t != b.t && Math.hypot(q.x - b.x, q.y - b.y) < 220)) return;
      pwr(b);
    }
  }
  function step() {
    fr++;
    for (const p of pl) {
      p.mvg = 0;
      if (p.owner) {
        if (p.st <= 0) {
          const s = p.ft > 0 ? p.v * 1.7 : p.v; let x = p.ix, y = p.iy; const l = Math.hypot(x, y);
          if (l > 1) { x /= l; y /= l; }
          if (l > .05) mv(p, x * s, y * s);
          if (p.ft > 0 && fr % 6 == 0) act(p);
        }
      } else botAI(p);
      if (p.th && p.th.l > 0) p.th.l--;
      if (fr % 10 == 0 && !(p.th && p.th.l > 0) && it.some(o => o.p && Math.hypot(o.x + 8 - p.x, o.y + 8 - p.y) < 20)) { p.th = { t: "😖", l: 80 }; if (p.owner) io.to(p.owner).emit("splat", { id: p.id }); }
    }
    for (let i = mn.length - 1; i >= 0; i--) { // las 4 ayudantes
      const m = mn[i]; m.l--; let best = null, bd = 1e9;
      for (const o of it) if (elig(m.t, o)) { const d = Math.hypot(m.x - (o.x + o.w / 2), m.y - (o.y + o.h / 2)); if (d < bd) { bd = d; best = o; } }
      if (best) { if (bd < 32) apply(m.t, best); else { m.x += (best.x + best.w / 2 - m.x) / bd * 5; m.y += (best.y + best.h / 2 - m.y) / bd * 5; } }
      if (m.l <= 0) mn.splice(i, 1);
    }
    for (let i = dg.length - 1; i >= 0; i--) { // perro
      const d = dg[i]; d.x += d.vx; d.y += d.vy; d.l--; d.c++;
      if (d.x < 40 || d.x > 1360) d.vx *= -1; if (d.y < 40 || d.y > 860) d.vy *= -1;
      if (d.c % 20 == 0) {
        if (d.t == "caos") it.push({ x: d.x - 8, y: d.y - 8, w: 16, h: 16, c: "#5b3a1a", k: "poop", m: true, p: true, tx: 0, ty: 0 });
        else { const ps = it.find(o => o.p && Math.hypot(o.x - d.x, o.y - d.y) < 70); if (ps) apply("orden", ps); }
      }
      if (Math.random() < .03) { d.vx = (Math.random() - .5) * 7; d.vy = (Math.random() - .5) * 7; }
      if (d.l <= 0) dg.splice(i, 1);
    }
    for (let i = bl.length - 1; i >= 0; i--) { // balón
      const b = bl[i]; b.l--;
      if (wh(b.x + b.vx, b.y, 8)) b.vx *= -1; else b.x += b.vx;
      if (wh(b.x, b.y + b.vy, 8)) b.vy *= -1; else b.y += b.vy;
      for (const o of it.slice()) if (elig(b.t, o)) {
        const dx = Math.max(o.x - b.x, 0, b.x - o.x - o.w), dy = Math.max(o.y - b.y, 0, b.y - o.y - o.h);
        if (Math.hypot(dx, dy) < 12) apply(b.t, o);
      }
      if (b.l <= 0) bl.splice(i, 1);
    }
    for (let i = gh.length - 1; i >= 0; i--) if (--gh[i].l <= 0) gh.splice(i, 1);
  }
  function tick() {
    const n = Date.now(); let steps = Math.min(4, Math.floor((n - last) / 16.67));
    if (steps < 1) return;
    last += steps * 16.67;
    while (steps-- > 0) step();
    if (n - lastSnap >= 33) { lastSnap = n; snap(); }
  }
  function sec() {
    tm--; pl.forEach(p => { if (p.cd > 0) p.cd--; if (p.ft > 0) p.ft--; if (p.st > 0) p.st--; if (p.bl > 0) p.bl--; });
    if (tm <= 0) end();
  }
  function snap() {
    const r1 = v => Math.round(v * 10) / 10;
    ev("s", { tm, sc: score(),
      p: pl.map(p => [r1(p.x), r1(p.y), p.mvg, p.st, p.bl, p.ft, p.cd, p.th && p.th.l > 0 ? p.th.t : ""]),
      i: it.slice(0, NBASE).map(o => [o.m ? 1 : 0, Math.round(o.tx), Math.round(o.ty)]),
      po: it.slice(NBASE).map(o => [o.x + 8, o.y + 8]),
      dg: dg.map(d => [Math.round(d.x), Math.round(d.y)]), mn: mn.map(m => [Math.round(m.x), Math.round(m.y), m.ci]),
      gh: gh.map(g => [Math.round(g.x), Math.round(g.y)]), bl: bl.map(b => [Math.round(b.x), Math.round(b.y)]) });
  }

  /* ---------- API para los sockets ---------- */
  return {
    join(s) {
      s.join(code);
      if (ph === "lobby") { startCD(); bc(); }
      else if (ph === "playing") s.emit("start", startData(-1)); // espectador
      else s.emit("end", { o: score() });
    },
    pick(s, d) {
      if (ph !== "lobby" || !d) return; const i = d.i | 0;
      if (i < 0 || i > 5 || (slots[i] && slots[i].o !== s.id)) return;
      slots.forEach((x, j) => { if (x && x.o === s.id) slots[j] = null; });
      slots[i] = { o: s.id, n: clean(d.n) || DN[i] }; bc();
    },
    drop(s) { if (ph !== "lobby") return; slots.forEach((x, j) => { if (x && x.o === s.id) slots[j] = null; }); bc(); },
    name(s, d) { if (ph !== "lobby" || !d) return; const x = slots.find(q => q && q.o === s.id); if (x) { x.n = clean(d.n) || x.n; bc(); } },
    startNow() { if (ph === "lobby" && slots.some(Boolean)) start(); },
    again() { if (ph === "ended") resetLobby(); },
    input(s, d) { const p = mine(s); if (p && d) { p.ix = clamp(+d.x || 0, -1, 1); p.iy = clamp(+d.y || 0, -1, 1); } },
    doAct(s) { const p = mine(s); if (p) act(p); },
    doPwr(s) { const p = mine(s); if (p) pwr(p); },
    leave(s) {
      if (ph === "lobby") { slots.forEach((x, j) => { if (x && x.o === s.id) slots[j] = null; }); bc(); }
      else pl.forEach(p => { if (p.owner === s.id) { p.owner = null; p.ix = p.iy = 0; } }); // pasa a ser Bot
      if (!socks().length) { clearTimeout(endT); clearInterval(tickT); clearInterval(secT); clearInterval(cdT); onEmpty(); }
    }
  };
}

io.on("connection", s => {
  let g = null;
  s.on("join", d => {
    if (g) return;
    const c = String((d && d.room) || "main").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 20) || "main";
    g = rooms[c] || (rooms[c] = Game(c, () => delete rooms[c]));
    g.join(s);
  });
  s.on("pick", d => g && g.pick(s, d));
  s.on("drop", () => g && g.drop(s));
  s.on("name", d => g && g.name(s, d));
  s.on("startnow", () => g && g.startNow());
  s.on("again", () => g && g.again());
  s.on("in", d => g && g.input(s, d));
  s.on("act", () => g && g.doAct(s));
  s.on("pwr", () => g && g.doPwr(s));
  s.on("disconnect", () => g && g.leave(s));
});

const PORT = process.env.PORT || 3000;
srv.listen(PORT, "0.0.0.0", () => console.log("CAOS vs ORDEN en http://localhost:" + PORT + "  (salas: ?sala=nombre)"));
