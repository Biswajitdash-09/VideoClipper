"use client";
import { useEffect, useRef } from "react";

const POSTER =
  "https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/b7ebb74a-8c8a-4f7e-8f80-55e2d74ecd05.webp";
const VIDEO =
  "https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/04fd3d5f-99d7-476e-98a4-46c08518ffb3.mp4";
const N = 10,
  PITCH = 196,
  LOOP = N * PITCH,
  TILE = 0.7111;

// rounded quad: each vertex rounded with a quadratic curve of radius r
function roundedQuad(P, r) {
  let d = "";
  P.forEach((p, k) => {
    const a = P[(k + 3) % 4],
      b = P[(k + 1) % 4];
    const to = (q) => {
      const dx = q[0] - p[0],
        dy = q[1] - p[1],
        l = Math.hypot(dx, dy) || 1;
      return [p[0] + (dx / l) * r, p[1] + (dy / l) * r];
    };
    const s1 = to(a),
      s2 = to(b);
    d += `${k ? "L" : "M"}${s1[0]} ${s1[1]}Q${p[0]} ${p[1]} ${s2[0]} ${s2[1]}`;
  });
  return d + "Z";
}

export default function Hero() {
  const root = useRef(),
    deck = useRef();

  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const L = deck.current;
    const cards = [...L.children];
    const vids = [...L.querySelectorAll("video")];
    if (reduce) vids.forEach((v) => v.remove());
    vids.forEach((v) => {
      v.muted = true;
      v.addEventListener("loadeddata", () => (v.style.opacity = 1));
      v.play().catch(() => {});
    });

    // time-based clock
    const clock = document.documentElement.animate([], { duration: 1e9 });
    let pos = 0,
      vel = 0,
      last = clock.currentTime,
      drag = false,
      lx = 0,
      lt = 0,
      sync = 0,
      S = 1,
      raf;

    const frame = () => {
      const now = clock.currentTime,
        dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const phone = innerWidth <= 820,
        W = L.clientWidth,
        Hh = L.clientHeight;
      S = phone ? W / 640 : Math.min(innerWidth / 1440, innerHeight / 1080);
      const cx = phone ? 320 : W / S / 2,
        H = phone ? 340 : 706,
        cy0 = phone ? Hh / S / 2 : 217;
      if (!drag) {
        pos += (reduce ? 0 : 50) * dt - vel * dt;
        vel *= Math.pow(0.05, dt);
      }
      const edgeH = (x) =>
        280 + 92 * Math.min(Math.abs(x - cx) / H, 1.6) ** 2.6;

      cards.forEach((c, i) => {
        let t = (((i * PITCH - pos) % LOOP) + LOOP) % LOOP;
        if (t > LOOP / 2) t -= LOOP;
        const x = cx + t * (1 + 0.083 * (t / H) ** 2);
        const d = Math.min(Math.abs(x - cx) / H, 1.6);
        const w = 170 + 48 * d * d,
          cy = cy0 - 12 * d * d;
        const xl = x - w / 2,
          xr = x + w / 2,
          hl = edgeH(xl),
          hr = edgeH(xr);
        const P = [
          [xl, cy - hl / 2],
          [xr, cy - hr / 2],
          [xr, cy + hr / 2],
          [xl, cy + hl / 2],
        ].map((p) => [p[0] * S, p[1] * S]);
        const minY = Math.min(P[0][1], P[1][1]),
          bh = Math.max(P[2][1], P[3][1]) - minY,
          bw = w * S,
          ox = P[0][0];
        if (ox + bw < 0 || ox > W) {
          c.style.display = "none";
          return;
        }
        const Q = P.map((p) => [p[0] - ox, p[1] - minY]);
        const th = Math.max(bh, bw / TILE),
          tw = th * TILE,
          col = i % 5,
          row = (i / 5) | 0;
        const m = c.firstChild,
          play = c.lastChild,
          ps = 34 * S;
        c.style.cssText = `display:block;left:${ox}px;top:${minY}px;width:${bw}px;height:${bh}px;clip-path:path('${roundedQuad(Q, 15 * S)}')`;
        m.style.width = 5 * tw + "px";
        m.style.height = 2 * th + "px";
        m.style.transform = `translate(${(bw - tw) / 2 - col * tw}px,${(bh - th) / 2 - row * th}px)`;
        play.style.cssText = `width:${ps}px;height:${ps}px;font-size:${ps * 0.6}px;left:${14 * S}px;top:${Q[3][1] - 14 * S - ps}px`;
      });

      if (vids[0] && now - sync > 500) {
        sync = now;
        const t0 = vids[0].currentTime;
        if (vids[0].readyState > 1)
          vids.forEach(
            (v) => Math.abs(v.currentTime - t0) > 0.12 && (v.currentTime = t0),
          );
      }
      raf = requestAnimationFrame(frame);
    };
    frame();

    const down = (e) => {
      drag = true;
      vel = 0;
      lx = e.clientX;
      lt = e.timeStamp;
      L.setPointerCapture(e.pointerId);
    };
    const move = (e) => {
      if (!drag) return;
      const dx = e.clientX - lx,
        dts = Math.max((e.timeStamp - lt) / 1000, 0.001);
      pos -= dx / S;
      vel = vel * 0.5 + (dx / S / dts) * 0.5;
      lx = e.clientX;
      lt = e.timeStamp;
    };
    const up = (e) => {
      drag = false;
      if (e.timeStamp - lt > 100) vel = 0;
    };
    L.addEventListener("pointerdown", down);
    L.addEventListener("pointermove", move);
    L.addEventListener("pointerup", up);
    L.addEventListener("pointercancel", up);

    // Scroll-driven: the hero is pinned (sticky) inside a tall runway. Scrolling through the
    // runway moves only the cards; once the runway ends the page scrolls on as normal.
    // Horizontal wheel/trackpad swipes over the deck also move the cards directly.
    const runway = root.current.closest(".runway");
    const TRAVEL = 2000; // card units travelled over the whole runway
    const progress = () => {
      const r = runway.getBoundingClientRect();
      const room = r.height - innerHeight;
      return innerWidth <= 820 || room <= 0
        ? 0
        : Math.min(1, Math.max(0, -r.top / room));
    };
    let lastP = progress();
    const onScroll = () => {
      const p = progress();
      if (!reduce) pos += (p - lastP) * TRAVEL;
      lastP = p;
    };
    const onWheel = (e) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      pos += e.deltaX / S;
    };
    addEventListener("scroll", onScroll, { passive: true });
    L.addEventListener("wheel", onWheel, { passive: false });

    // entrance
    if (!reduce) {
      const q = (s) => [...root.current.querySelectorAll(`[data-a=${s}]`)];
      const go = (els, kf, delay, dur = 800, gap = 0) =>
        els.forEach((e, i) =>
          e.animate(kf, {
            duration: dur,
            delay: delay + i * gap,
            easing: "cubic-bezier(.2,.8,.2,1)",
            fill: "backwards",
          }),
        );
      const fade = (y, extra = {}) => [
        { opacity: 0, transform: `translateY(${y}px)`, ...extra },
        { opacity: 1, transform: "none" },
      ];
      go(q("nav"), fade(-20), 0, 700, 60);
      go(
        q("badge"),
        [
          { opacity: 0, transform: "scale(.7)" },
          { opacity: 1, transform: "scale(1)" },
        ],
        150,
        600,
      );
      go(
        q("line"),
        fade(40, { filter: "blur(14px)" }).map((k, i) =>
          i ? { ...k, filter: "blur(0)" } : k,
        ),
        300,
        900,
        140,
      );
      go(q("sub"), fade(20), 650);
      go(q("deck"), fade(80), 800, 1000);
      go(
        q("cta"),
        [
          { opacity: 0, transform: "scale(.6)" },
          { opacity: 1, transform: "scale(1)" },
        ],
        1100,
        600,
      );
      go(
        q("draw"),
        [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }],
        1300,
        900,
        120,
      );
      go(q("note"), [{ opacity: 0 }, { opacity: 1 }], 1500, 700);
    }

    return () => {
      cancelAnimationFrame(raf);
      clock.cancel();
      removeEventListener("scroll", onScroll);
      L.removeEventListener("wheel", onWheel);
    };
  }, []);

  const draw = { pathLength: 1, className: "draw", "data-a": "draw" };
  return (
    <div className="runway">
      <div className="hero">
        <div className="frame" ref={root}>
          <header className="top">
            <a
              className="a logo"
              href="#top"
              data-a="nav"
              aria-label="Reelmark home"
            >
              <svg viewBox="0 0 28 28">
                <path d="M4 24C4 10 12 4 25 3c0 13-6 21-18 21" fill="#08482D" />
                <path
                  d="M5 25c5-8 9-12 15-16"
                  stroke="#F5F8EF"
                  strokeWidth="1.8"
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
              Reelmark
            </a>
            <nav className="a nav" aria-label="Main">
              {[
                ["How it works", "#how"],
                ["Try it", "#try"],
                ["Pricing", "#pricing"],
                ["FAQ", "#faq"],
              ].map(([n, h]) => (
                <a key={n} href={h} data-a="nav">
                  {n}
                </a>
              ))}
            </nav>
            <a className="a pill login" href="#try" data-a="nav">
              Log in
            </a>
            <a className="a pill signup" href="#try" data-a="nav">
              Sign up
            </a>
          </header>

          <div className="a badge" data-a="badge">
            Your first reel is free
          </div>
          <h1 className="a">
            <span data-a="line">Captivate Crowds</span>
            <span data-a="line">with Snackable Reels</span>
          </h1>
          <p className="a sub" data-a="sub">
            Paste a YouTube link and we find the best 10–20 seconds, <br />
            crop it to vertical and add captions, ready to post. <br />
            Works with any video you have the rights to.
          </p>

          <svg className="a doodle slash" viewBox="0 0 60 60">
            <path {...draw} d="M14 54 L28 6" />
            <path {...draw} d="M36 54 L50 6" />
          </svg>
          <div className="a note seen" data-a="note">
            Be seen
            <br />
            with clips
          </div>
          <svg className="a doodle arr1" viewBox="0 0 200 150">
            <path {...draw} d="M120 4 C30 12 10 85 70 138" />
            <path {...draw} d="M52 124 L70 140 L76 116" />
          </svg>

          <div className="a deck" ref={deck} data-a="deck">
            {Array.from({ length: N }, (_, i) => (
              <div className="card" key={i}>
                <div className="m">
                  <div
                    className="p"
                    style={{ backgroundImage: `url(${POSTER})` }}
                  />
                  <video
                    src={VIDEO}
                    muted
                    loop
                    playsInline
                    autoPlay
                    preload="auto"
                  />
                </div>
                <i className="play" />
              </div>
            ))}
          </div>

          <div className="a cta" data-a="cta">
            <a href="#try">Make a Reel</a>
          </div>
          <svg className="a doodle arr2" viewBox="0 0 50 50">
            <path {...draw} d="M4 40 C14 44 34 36 44 10" />
            <path {...draw} d="M34 14 L44 8 L47 22" />
          </svg>
          <div className="a note zero" data-a="note">
            First one's free
          </div>
        </div>
      </div>
    </div>
  );
}
