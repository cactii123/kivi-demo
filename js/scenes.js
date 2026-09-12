const Scenes = (() => {
  const palettes = {
    night: {
      sky: [12, 22, 32],
      sky2: [28, 48, 58],
      bloom: [232, 196, 214],
      leaf: [70, 92, 78],
      wood: [92, 62, 42],
      kiwi: [86, 168, 52],
      kiwiD: [46, 92, 28],
      lantern: [240, 186, 92],
      water: [36, 58, 68],
    },
    day: {
      sky: [168, 206, 224],
      sky2: [232, 236, 210],
      bloom: [255, 214, 224],
      leaf: [86, 140, 72],
      wood: [150, 108, 70],
      kiwi: [92, 176, 48],
      kiwiD: [52, 102, 30],
      lantern: [255, 220, 130],
      water: [120, 168, 176],
    },
  };

  function p(c, x, y, col, s = 1) {
    c.fillStyle = `rgb(${col.join(",")})`;
    c.fillRect(x, y, s, s);
  }

  function rect(c, x, y, w, h, col) {
    c.fillStyle = `rgb(${col.join(",")})`;
    c.fillRect(x, y, w, h);
  }

  function ditherSky(c, w, h, a, b) {
    for (let y = 0; y < h; y++) {
      const t = y / h;
      const col = a.map((v, i) => Math.round(v + (b[i] - v) * t));
      rect(c, 0, y, w, 1, col);
    }
  }

  function tree(c, x, y, pal, bloom) {
    rect(c, x + 6, y + 22, 4, 28, pal.wood);
    for (let i = 0; i < 18; i++) {
      const px = x + ((i * 7) % 18);
      const py = y + ((i * 5) % 20);
      rect(c, px, py, 6, 5, pal.leaf);
      if (bloom) rect(c, px + 1, py - 2, 3, 3, pal.bloom);
    }
  }

  function lantern(c, x, y, pal, glow) {
    rect(c, x + 2, y - 8, 1, 8, [40, 32, 24]);
    rect(c, x, y, 5, 6, pal.lantern);
    if (glow) {
      c.fillStyle = "rgba(255,200,80,0.18)";
      c.fillRect(x - 3, y - 2, 11, 12);
    }
  }

  function kiwi(c, x, y, pal, hop) {
    y -= hop;
    c.fillStyle = "#f3ead8";
    c.beginPath();
    c.ellipse(x + 10, y + 7, 13, 10, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = pal.kiwi;
    c.beginPath();
    c.ellipse(x + 10, y + 7, 11, 8, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(x + 20, y + 6);
    c.lineTo(x + 34, y + 10);
    c.lineTo(x + 20, y + 11);
    c.closePath();
    c.fill();
    p(c, x + 16, y + 5, [20, 20, 16], 2);
    rect(c, x + 6, y + 14, 2, 6, pal.kiwi);
    rect(c, x + 13, y + 14, 2, 6, pal.kiwi);
  }

  function bloom(c, x, y, s) {
    const pinks = [
      [236, 196, 204],
      [214, 168, 186],
      [248, 224, 220],
      [196, 148, 170],
    ];
    for (let i = 0; i < 10; i++) {
      const px = x + ((i * 11) % (s * 2)) - s;
      const py = y + ((i * 7) % s);
      rect(c, px, py, 3 + (i % 3), 2 + (i % 2), pinks[i % pinks.length]);
    }
  }

  function drawLanternWalk(c, w, h, t) {
    const skyGrad = c.createLinearGradient(0, 0, 0, h);
    skyGrad.addColorStop(0,    "rgb(10,10,14)");
    skyGrad.addColorStop(0.22, "rgb(10,10,14)");
    skyGrad.addColorStop(0.42, "rgb(80,50,60)");
    skyGrad.addColorStop(0.67, "rgb(170,120,100)");
    skyGrad.addColorStop(1,    "rgb(170,120,100)");
    c.fillStyle = skyGrad;
    c.fillRect(0, 0, w, h);
    bloom(c, 8, 18, 28);
    bloom(c, 24, 8, 36);
    bloom(c, w - 40, 10, 34);
    bloom(c, w - 18, 22, 26);
    rect(c, 18, 20, 3, 70, [42, 32, 28]);
    rect(c, w - 22, 16, 3, 74, [42, 32, 28]);
    rect(c, 20, 48, w - 40, 1, [70, 52, 40]);
    const lanterns = [28, 48, 68, 88, 108, 128];
    lanterns.forEach((x, i) => {
      const glow = (t + i * 9) % 50 < 28;
      rect(c, x + 2, 40, 1, 8, [70, 52, 38]);
      c.fillStyle = glow ? "rgb(245,192,115)" : "rgb(200,144,82)";
      c.beginPath();
      if (c.roundRect) c.roundRect(x, 48, 7, 9, 2);
      else c.rect(x, 48, 7, 9);
      c.fill();
      if (glow) {
        const grd = c.createRadialGradient(x + 3.5, 52, 1, x + 3.5, 52, 11);
        grd.addColorStop(0, "rgba(255,200,90,0.30)");
        grd.addColorStop(1, "rgba(255,200,90,0)");
        c.fillStyle = grd;
        c.fillRect(x - 8, 42, 24, 24);
      }
    });
    for (let y = 90; y < 188; y++) {
      const k = (y - 90) / 98;
      const pathW = 18 + k * 90;
      const cx = w / 2;
      rect(c, cx - pathW / 2, y, pathW, 1, [18, 22, 24]);
      if (y % 6 === 0) rect(c, cx - 1, y, 2, 1, [48, 40, 36]);
    }
    rect(c, 0, 188, w, 8, [176, 132, 78]);
    rect(c, 0, 196, w, 3, [120, 84, 50]);
    rect(c, 10, 196, 5, 24, [150, 108, 64]);
    rect(c, w - 16, 196, 5, 24, [150, 108, 64]);
    rect(c, 0, 212, w, 8, [90, 64, 40]);
  }

  function drawBridge(c, w, h, pal, t, mouse, hop) {
    ditherSky(c, w, h, pal.sky, pal.sky2);
    for (let i = 0; i < 18; i++) p(c, 10 + i * 12, 8 + (i % 5), [230, 230, 210]);
    tree(c, 8, 40, pal, true);
    tree(c, 40, 28, pal, true);
    tree(c, 150, 36, pal, true);
    tree(c, 178, 50, pal, true);
    rect(c, 0, 210, w, 110, pal.water);
    for (let i = 0; i < w; i += 8) rect(c, i, 218 + ((t + i) % 6), 5, 1, pal.sky2);
    rect(c, 20, 188, 180, 8, pal.wood);
    rect(c, 28, 196, 6, 40, pal.wood);
    rect(c, 186, 196, 6, 40, pal.wood);
    [40, 70, 100, 130, 160].forEach((x, i) => lantern(c, x, 170, pal, Math.abs(mouse.x - x) < 18 || (t + i) % 40 < 12));
    kiwi(c, 88 + Math.sin(t / 20) * 2, 176, pal, hop);
  }

  function drawGrove(c, w, h, pal, t, mouse, hop) {
    ditherSky(c, w, h, pal.sky, [8, 16, 28]);
    rect(c, 140, 28, 28, 28, [240, 236, 200]);
    rect(c, 0, 200, w, 120, pal.kiwiD);
    for (let i = 0; i < 6; i++) tree(c, 6 + i * 34, 90 + (i % 2) * 10, pal, false);
    kiwi(c, 40 + mouse.x * 0.08, 188, pal, hop);
    lantern(c, 170, 160, pal, true);
  }

  function drawRain(c, w, h, pal, t) {
    ditherSky(c, w, h, [18, 22, 28], [40, 48, 52]);
    rect(c, 0, 230, w, 90, [30, 34, 38]);
    for (let i = 0; i < 40; i++) {
      const x = (i * 17 + t * 3) % w;
      const y = (i * 23 + t * 8) % h;
      rect(c, x, y, 1, 6, [180, 190, 200]);
    }
    rect(c, 70, 120, 80, 90, pal.wood);
    rect(c, 78, 128, 64, 50, pal.sky);
    kiwi(c, 92, 176, pal, 0);
  }

  function drawMeadow(c, w, h, pal, t, mouse, hop) {
    ditherSky(c, w, h, pal.sky, pal.sky2);
    rect(c, 160, 36, 32, 32, pal.lantern);
    rect(c, 0, 170, w, 150, pal.leaf);
    for (let i = 0; i < 30; i++) p(c, (i * 19) % w, 180 + (i % 7) * 8, pal.bloom, 2);
    kiwi(c, 100 + Math.sin(t / 16) * 6, 160, pal, hop);
  }

  const fn = { bridge: drawBridge, grove: drawGrove, rain: drawRain, meadow: drawMeadow };

  function start(canvas, getState) {
    const ctx = canvas.getContext("2d");
    let t = 0;
    let hop = 0;
    const mouse = { x: 110, y: 160 };
    canvas.addEventListener("mousemove", (e) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - r.left) / r.width) * canvas.width;
      mouse.y = ((e.clientY - r.top) / r.height) * canvas.height;
    });
    canvas.addEventListener("click", () => {
      hop = 8;
    });
    function tick() {
      const { theme, scene } = getState();
      const pal = palettes[theme === "day" ? "day" : "night"];
      hop = Math.max(0, hop - 0.6);
      ctx.imageSmoothingEnabled = false;
      (fn[scene] || fn.bridge)(ctx, canvas.width, canvas.height, pal, t, mouse, hop);
      t += 1;
      requestAnimationFrame(tick);
    }
    tick();
  }

  function startHome(canvas) {
    const ctx = canvas.getContext("2d");
    let t = 0;
    function tick() {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      drawLanternWalk(ctx, canvas.width, canvas.height, t);
      t += 1;
      requestAnimationFrame(tick);
    }
    tick();
  }

  return { start, startHome };
})();
