import { useEffect, useRef } from "react";
import { CircuitBoard, ArrowRight, ArrowUpRight } from "lucide-react";

/* Animated pixel/dot field background, drawn on a canvas.
   The whole field drifts slowly on a diagonal while each dot softly pulses —
   gives a calm, living "digital matrix" feel behind the sign-in. */
function DotField() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const GAP = 16;
    const SIZE = 2.5;
    const VX = 16; // px/sec drift
    const VY = 9;
    let w = 0, h = 0, raf = 0, last = 0;
    let offx = 0, offy = 0;

    // stable per-cell brightness from logical coords (so bright dots drift with the field)
    const hash = (x: number, y: number) => {
      const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      return s - Math.floor(s);
    };

    const resize = () => {
      w = cv.clientWidth;
      h = cv.clientHeight;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const render = (t: number) => {
      const dt = last ? Math.min((t - last) / 1000, 0.05) : 0;
      last = t;
      offx += VX * dt;
      offy += VY * dt;
      const baseLx = Math.floor(offx / GAP);
      const baseLy = Math.floor(offy / GAP);
      const ox = offx - baseLx * GAP;
      const oy = offy - baseLy * GAP;
      const cols = Math.ceil(w / GAP) + 2;
      const rows = Math.ceil(h / GAP) + 2;
      const waveT = t * 0.0016; // moving brightness wave

      ctx.clearRect(0, 0, w, h);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const px = c * GAP - ox;
          const py = r * GAP - oy;
          const b = hash(baseLx + c, baseLy + r); // sparkle distribution, drifts with field
          // diagonal brightness band that sweeps across over time -> clearly moving
          const wave = 0.5 + 0.5 * Math.sin(px * 0.02 + py * 0.02 + waveT);
          const a = 0.05 + Math.pow(b, 3) * 0.5 * (0.3 + 0.7 * wave) + wave * 0.06;
          ctx.fillStyle = `rgba(255,255,255,${a})`;
          ctx.fillRect(px, py, SIZE, SIZE);
        }
      }
      raf = requestAnimationFrame(render);
    };

    resize();
    raf = requestAnimationFrame(render);

    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="absolute inset-0 h-full w-full"
      style={{
        WebkitMaskImage: "radial-gradient(ellipse 95% 75% at 50% 38%, #000 58%, transparent 100%)",
        maskImage: "radial-gradient(ellipse 95% 75% at 50% 38%, #000 58%, transparent 100%)",
      }}
    />
  );
}

export default function Landing({ onEnter }: { onEnter: () => void }) {
  const d = (ms: number) => ({ animationDelay: `${ms}ms` });

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#0a0a0b] text-[#e5e5e0] font-sans antialiased flex flex-col">
      <DotField />
      <div className="lp-topglow" aria-hidden="true" />

      {/* Top glass nav pill */}
      <header className="relative z-10 flex justify-center px-4 pt-6">
        <nav className="lp-anim lp-glass flex items-center gap-1 rounded-full py-1.5 pl-3 pr-1.5" style={d(60)}>
          <div className="flex items-center gap-2 pr-3 pl-1">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-600 text-white">
              <CircuitBoard size={16} />
            </span>
          </div>
          <span className="hidden px-2 font-serif italic text-base font-semibold tracking-tight text-[#f5f5f0] sm:block">
            Fluxbench
          </span>
          <span className="mr-1 hidden items-center rounded-full border border-white/10 px-2 py-0.5 text-[9px] font-mono text-zinc-500 sm:inline-flex">
            v2.1
          </span>
          <a
            href="https://github.com/ahmadch7/fluxbench"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/5 px-4 py-1.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/10 hover:text-white"
          >
            GitHub
            <ArrowUpRight size={14} />
          </a>
        </nav>
      </header>

      {/* Hero / sign-in */}
      <main className="relative z-10 mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-5 pb-24 text-center">
        <h1 className="lp-anim whitespace-nowrap text-5xl font-bold tracking-tight text-white sm:text-6xl" style={d(140)}>
          Welcome, Maker
        </h1>
        <p className="lp-anim mt-3 text-lg font-light text-zinc-400" style={d(220)}>
          Your microcontroller companion
        </p>

        <button
          onClick={onEnter}
          className="lp-anim group mt-10 inline-flex items-center gap-2 rounded-2xl bg-white px-7 py-3.5 text-sm font-semibold text-black shadow-[0_0_34px_rgba(255,255,255,0.22)] transition-transform hover:scale-[1.03]"
          style={d(300)}
        >
          Open the Dashboard
          <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
        </button>

        <p className="lp-anim mt-6 text-xs text-zinc-500" style={d(400)}>
          Runs locally in your browser — no account needed.
        </p>
      </main>
    </div>
  );
}
