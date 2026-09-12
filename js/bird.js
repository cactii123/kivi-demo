const Bird = (() => {
  function start(yard, bird) {
    let x = 48;
    let facing = 1;
    let vx = 0.055;        // slow, gentle drift
    let paused = false;
    let rest = 0;

    function maxX() {
      return Math.max(12, yard.clientWidth - bird.offsetWidth - 16);
    }

    function paint() {
      // Use CSS custom properties so the animation keyframes can read them
      bird.style.setProperty("--bx", `${x}px`);
      bird.style.setProperty("--bf", String(facing));
      bird.style.transform = `translate(${x}px, 0) scaleX(${facing})`;
    }

    function tick() {
      if (!paused) {
        if (rest > 0) {
          rest -= 1;
        } else {
          x += vx;
          const edge = maxX();
          if (x < 16) {
            x = 16;
            vx = Math.abs(vx);
          }
          if (x > edge) {
            x = edge;
            vx = -Math.abs(vx);
          }
          facing = vx >= 0 ? 1 : -1;
          // rest a bit more often, a bit longer — calm bird energy
          if (Math.random() < 0.006) {
            rest = 220 + Math.random() * 300;
          }
          // very rare spontaneous direction flip
          if (Math.random() < 0.0005) vx *= -1;
        }
      }
      bird.classList.toggle("walk", !paused && rest <= 0);
      bird.classList.toggle("idle", rest > 0);
      paint();
      requestAnimationFrame(tick);
    }

    document.addEventListener("visibilitychange", () => {
      paused = document.hidden;
    });

    paint();
    tick();
  }

  return { start };
})();
