import React, { useEffect, useState, useRef, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import emblemUrl from "@/assets/fib-emblem.png";

const BOOT_FLAG_KEY = "sidms_boot_played";
const GOLD = "#c9a227";
const DURATION = 30000;

const MESSAGES = [
  { time: 0, text: "INITIALIZING..." },
  { time: 3, text: "VERIFYING CREDENTIALS..." },
  { time: 6, text: "CHECKING SECURITY CLEARANCE..." },
  { time: 9, text: "ESTABLISHING ENCRYPTED TUNNEL..." },
  { time: 12, text: "ACCESSING SID DATABASE..." },
  { time: 15, text: "VERIFYING AGENT PROFILE..." },
  { time: 18, text: "LOADING CASE FILES..." },
  { time: 21, text: "SYNCHRONIZING SECURE NETWORK..." },
  { time: 24, text: "DECRYPTING FILES..." },
  { time: 27, text: "FINALIZING..." },
];

const INTEGRITY_ROWS = [
  { label: "NETWORK MODULE", time: 2 },
  { label: "ENCRYPTION PROTOCOL", time: 6 },
  { label: "DATABASE CONNECTION", time: 11 },
  { label: "USER AUTHENTICATION", time: 16 },
  { label: "SECURE TUNNEL", time: 21 },
  { label: "SYSTEM CHECK", time: 26 },
];

function randHex(len: number) {
  let s = "";
  for (let i = 0; i < len; i++) s += "0123456789ABCDEF"[Math.floor(Math.random() * 16)];
  return s;
}

function hexGrid(rows: number, cols: number) {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => randHex(2)).join(" ")
  );
}

/* Faint moving world map: abstract dotted continents drawn once as SVG dots. */
function WorldMap() {
  const dots = useMemo(() => {
    const pts: { x: number; y: number; o: number }[] = [];
    const blobs = [
      { cx: 18, cy: 32, rx: 10, ry: 9 },
      { cx: 30, cy: 62, rx: 6, ry: 12 },
      { cx: 50, cy: 28, rx: 8, ry: 7 },
      { cx: 55, cy: 55, rx: 6, ry: 9 },
      { cx: 72, cy: 34, rx: 13, ry: 10 },
      { cx: 84, cy: 66, rx: 6, ry: 5 },
    ];
    for (const b of blobs) {
      for (let i = 0; i < 90; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random());
        pts.push({
          x: b.cx + Math.cos(a) * b.rx * r,
          y: b.cy + Math.sin(a) * b.ry * r,
          o: 0.25 + Math.random() * 0.75,
        });
      }
    }
    return pts;
  }, []);
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ opacity: 0.08 }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="w-[160%] h-full boot-map-drift">
        {dots.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r={0.28} fill={GOLD} opacity={d.o} />
        ))}
      </svg>
    </div>
  );
}

/* Vertical encrypted data stream column. */
function DataStream({ className, chars, speed }: { className?: string; chars: number; speed: number }) {
  const [lines, setLines] = useState<string[]>(() => Array.from({ length: chars }, () => randHex(2)));
  useEffect(() => {
    const id = setInterval(() => {
      setLines((prev) => [randHex(2), ...prev.slice(0, -1)]);
    }, speed);
    return () => clearInterval(id);
  }, [speed]);
  return (
    <div className={`flex flex-col gap-[2px] text-[8px] leading-none pointer-events-none ${className ?? ""}`}>
      {lines.map((l, i) => (
        <span key={i} style={{ opacity: Math.max(0.05, 1 - i / chars) * 0.5 }}>{l}</span>
      ))}
    </div>
  );
}

function Panel({ title, children, className, flicker }: { title?: string; children: React.ReactNode; className?: string; flicker?: boolean }) {
  return (
    <div className={`border border-[#c9a227]/25 bg-[#060b16]/80 relative ${flicker ? "boot-flicker" : ""} ${className ?? ""}`}>
      <span className="absolute -top-px -left-px w-2 h-2 border-t border-l border-[#c9a227]/80" />
      <span className="absolute -top-px -right-px w-2 h-2 border-t border-r border-[#c9a227]/80" />
      <span className="absolute -bottom-px -left-px w-2 h-2 border-b border-l border-[#c9a227]/80" />
      <span className="absolute -bottom-px -right-px w-2 h-2 border-b border-r border-[#c9a227]/80" />
      {title && (
        <div className="px-3 pt-2 pb-1 text-[9px] tracking-[0.25em] text-[#c9a227] border-b border-[#c9a227]/15">
          {title}
        </div>
      )}
      <div className="px-3 py-2">{children}</div>
    </div>
  );
}

export default function BootSequence({ onComplete }: { onComplete: () => void }) {
  const { officer } = useAuth();
  const [progress, setProgress] = useState(0);
  const [showWelcome, setShowWelcome] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const requestRef = useRef<number | undefined>(undefined);
  const startTimeRef = useRef<number | undefined>(undefined);
  const lastProgressRef = useRef(0);
  const doneRef = useRef(false);
  const completedRef = useRef(false);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const encryptionKey = useMemo(() => hexGrid(4, 8), []);
  const sessionId = useMemo(
    () => `FIB-SID-${randHex(4)}-${randHex(4)}-${randHex(4)}-${randHex(4)}`,
    []
  );
  const now = new Date();

  const elapsedSec = (progress / 100) * 30;
  const visibleMessages = MESSAGES.filter((m) => elapsedSec >= m.time);
  const currentMessage = visibleMessages[visibleMessages.length - 1] ?? MESSAGES[0];

  const completeSequence = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    sessionStorage.setItem(BOOT_FLAG_KEY, "true");
    onComplete();
  };
  const completeRef = useRef(completeSequence);
  completeRef.current = completeSequence;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") completeRef.current();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const animate = (time: number) => {
      if (startTimeRef.current === undefined) startTimeRef.current = time;
      const elapsed = time - startTimeRef.current;
      const p = Math.min((elapsed / DURATION) * 100, 100);
      // Throttle state updates to ~0.2% steps (~15/s) to keep render load low
      // while the exact 30s timing still comes from the rAF timestamp.
      if (p >= 100 || p - lastProgressRef.current >= 0.2) {
        lastProgressRef.current = p;
        setProgress(p);
      }
      if (elapsed < DURATION) {
        requestRef.current = requestAnimationFrame(animate);
      } else if (!doneRef.current) {
        doneRef.current = true;
        // Bar hits 100% and the welcome text fades in at exactly 30s,
        // holds ~2s, then fades to black over the full 1s transition.
        setShowWelcome(true);
        timeoutsRef.current.push(
          setTimeout(() => {
            setFadeOut(true);
            timeoutsRef.current.push(setTimeout(() => completeRef.current(), 1000));
          }, 2000)
        );
      }
    };
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
    };
  }, []);

  return (
    <div
      data-testid="boot-sequence"
      className={`fixed inset-0 z-50 bg-[#04070f] text-[#8a94ad] font-mono overflow-hidden select-none transition-opacity duration-1000 ${fadeOut ? "opacity-0" : "opacity-100"}`}
    >
      {/* Blueprint grid background */}
      <div
        className="absolute inset-0 boot-grid-drift"
        style={{
          backgroundImage: `linear-gradient(rgba(201,162,39,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(201,162,39,0.05) 1px, transparent 1px), linear-gradient(rgba(90,120,190,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(90,120,190,0.05) 1px, transparent 1px)`,
          backgroundSize: "160px 160px, 160px 160px, 32px 32px, 32px 32px",
        }}
      />
      <WorldMap />
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 20%, #04070f 95%)" }} />

      {/* Scanlines */}
      <div
        className="absolute inset-0 pointer-events-none z-40 opacity-[0.07] boot-scanlines"
        style={{ background: "repeating-linear-gradient(0deg, transparent, transparent 2px, #000 2px, #000 4px)" }}
      />
      {/* Moving scan bar */}
      <div className="absolute left-0 right-0 h-24 z-40 pointer-events-none boot-scanbar" style={{ background: "linear-gradient(180deg, transparent, rgba(201,162,39,0.04), transparent)" }} />
      {/* Screen glitch overlay */}
      <div className="absolute inset-0 z-40 pointer-events-none boot-glitch" style={{ background: "linear-gradient(180deg, transparent 46%, rgba(201,162,39,0.06) 48%, transparent 50%)" }} />

      {/* Encrypted packets travelling between panels */}
      <div className="absolute inset-0 z-20 pointer-events-none hidden lg:block">
        <div className="absolute top-[38%] left-[21%] right-[52%] h-px bg-[#c9a227]/10">
          <span className="boot-packet" style={{ animationDuration: "3.2s" }} />
        </div>
        <div className="absolute top-[46%] left-[52%] right-[22%] h-px bg-[#c9a227]/10">
          <span className="boot-packet" style={{ animationDuration: "2.4s", animationDelay: "0.8s" }} />
        </div>
        <div className="absolute top-[62%] left-[18%] right-[55%] h-px bg-[#c9a227]/10">
          <span className="boot-packet" style={{ animationDuration: "4.1s", animationDelay: "1.5s" }} />
        </div>
        <div className="absolute top-[70%] left-[55%] right-[18%] h-px bg-[#c9a227]/10">
          <span className="boot-packet" style={{ animationDuration: "2.9s", animationDelay: "0.3s" }} />
        </div>
      </div>

      {/* Ambient data streams */}
      <DataStream className="absolute top-[12%] left-[38%] z-10 text-[#5a78be]/60" chars={16} speed={140} />
      <DataStream className="absolute top-[20%] right-[36%] z-10 text-[#5a78be]/60" chars={14} speed={180} />
      <DataStream className="absolute bottom-[16%] left-[44%] z-10 text-[#c9a227]/50" chars={12} speed={160} />

      <div className="relative z-30 w-full h-full flex flex-col px-6 py-4 lg:px-10 lg:py-6">
        {/* Header */}
        <div className="flex justify-between items-start text-[9px] tracking-[0.2em]">
          <div className="flex flex-col gap-1">
            <span className="text-[#c9a227]">FIB.SYSTEMS v2.7.4.1</span>
            <span className="opacity-60">SECURE NETWORK INTERFACE</span>
          </div>
          <div className="hidden md:flex flex-col items-center text-center">
            <span className="text-white/90 text-[13px] tracking-[0.5em]">FEDERAL INVESTIGATION BUREAU</span>
            <span className="text-[#c9a227] text-[9px] tracking-[0.45em] mt-1">SPECIAL INVESTIGATION DIVISION</span>
            <span className="w-40 h-px bg-gradient-to-r from-transparent via-[#c9a227]/60 to-transparent mt-2" />
          </div>
          <div className="flex flex-col gap-1 text-right">
            <span className="text-[#c9a227]">AUTHENTICATION PROTOCOL</span>
            <span className="opacity-60">&gt;&gt; SECURE_CONNECT<span className="boot-cursor">▊</span></span>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_minmax(340px,42%)_1fr] gap-6 items-center min-h-0 py-2">
          {/* Left column */}
          <div className="hidden lg:flex flex-col justify-between h-full py-6 max-w-[240px]">
            <div className="text-[9px] tracking-[0.2em]">
              <div className="flex items-center gap-2 text-[#c9a227]">
                <span className="w-4 h-px bg-[#c9a227]/60" />LOS SANTOS
              </div>
              <div className="opacity-50 mt-1 pl-6">34.0522° N, 118.2437° W</div>
            </div>
            <Panel title="SYSTEM INTEGRITY" flicker>
              <div className="flex flex-col gap-[5px] text-[9px] tracking-[0.15em]">
                {INTEGRITY_ROWS.map((r) => {
                  const ok = elapsedSec >= r.time;
                  return (
                    <div key={r.label} className="flex justify-between gap-4">
                      <span className="opacity-70">{r.label}</span>
                      {ok ? (
                        <span className="text-emerald-400">OK</span>
                      ) : (
                        <span className="text-[#c9a227]/70 boot-cursor">...</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </Panel>
            <div className="text-[8px] tracking-[0.15em] opacity-50">
              <div>LAST LOGIN: {now.toLocaleDateString("de-DE")} {now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</div>
              <div className="mt-1">USER: {(officer?.name ?? "UNKNOWN").toUpperCase()} | {(officer?.rank ?? "AGENT").toUpperCase()}</div>
            </div>
          </div>

          {/* Center column */}
          <div className="flex flex-col items-center justify-center gap-6 min-h-0">
            <div className="relative flex items-center justify-center">
              <div className="absolute w-72 h-72 rounded-full boot-emblem-pulse" style={{ background: `radial-gradient(circle, rgba(201,162,39,0.28) 0%, transparent 65%)` }} />
              <div className="absolute w-[21rem] h-[21rem] rounded-full border border-[#c9a227]/10 boot-ring-slow" style={{ borderTopColor: "rgba(201,162,39,0.45)" }} />
              <div className="absolute w-[18.5rem] h-[18.5rem] rounded-full border border-[#c9a227]/10 boot-ring-rev" style={{ borderBottomColor: "rgba(201,162,39,0.35)" }} />
              <img
                src={emblemUrl}
                alt="FIB Emblem"
                className="w-56 h-56 lg:w-64 lg:h-64 object-contain relative z-10"
                style={{ filter: "drop-shadow(0 0 24px rgba(201,162,39,0.35))" }}
              />
            </div>

            {!showWelcome ? (
              <div className="w-full max-w-md flex flex-col items-center gap-3">
                <div className="text-[11px] tracking-[0.35em] text-[#c9a227]">LOADING SECURE ENVIRONMENT</div>
                <div className="w-full relative border border-[#c9a227]/40 h-5 bg-[#0a1122] overflow-hidden">
                  <div
                    className="h-full relative overflow-hidden"
                    style={{ width: `${progress}%`, background: "linear-gradient(90deg, #8a6d16, #c9a227, #e8c14a)", boxShadow: "0 0 14px rgba(201,162,39,0.6)" }}
                  >
                    <div className="absolute inset-0 boot-bar-sheen" />
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center text-[10px] tracking-[0.3em] font-bold text-white mix-blend-difference" data-testid="text-boot-progress">
                    {Math.floor(progress)}%
                  </div>
                </div>
                <div className="text-[9px] tracking-[0.3em] opacity-60 text-center">
                  BITTE WARTEN SIE, WÄHREND DIE DATEN GELADEN WERDEN ...
                </div>
                <div className="text-[10px] tracking-[0.3em] text-white/85 mt-2 h-4" data-testid="text-boot-status">
                  {currentMessage.text}<span className="boot-cursor text-[#c9a227]">▊</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-center boot-welcome" data-testid="text-boot-welcome">
                <div className="text-2xl tracking-[0.4em] font-bold text-white" style={{ textShadow: "0 0 18px rgba(201,162,39,0.8)" }}>
                  ACCESS GRANTED
                </div>
                <div className="text-base tracking-[0.3em] text-[#c9a227]">
                  WELCOME, {(officer?.rank ?? "AGENT").toUpperCase()}
                </div>
                <div className="text-[10px] tracking-[0.35em] opacity-60 mt-2">
                  INITIALIZING SIDMS...<span className="boot-cursor text-[#c9a227]">▊</span>
                </div>
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="hidden lg:flex flex-col justify-between h-full py-6 max-w-[300px] ml-auto w-full">
            <div className="text-[9px] tracking-[0.15em] flex flex-col gap-[5px]">
              {visibleMessages.slice(0, 5).map((m) => (
                <div key={m.text} className="text-[#c9a227]/80">&gt;&gt; {m.text.replace("...", "")}</div>
              ))}
              <div className="text-[#c9a227]">&gt;&gt;<span className="boot-cursor">▊</span></div>
            </div>
            <div className="flex flex-col gap-4">
              <Panel title="ENCRYPTION KEY" flicker>
                <div className="flex flex-col gap-1 text-[9px] tracking-[0.15em] text-[#5a78be]">
                  {encryptionKey.map((row, i) => (
                    <span key={i}>{elapsedSec > i * 2 + 2 ? row : row.split(" ").map(() => randHex(2)).join(" ")}</span>
                  ))}
                </div>
              </Panel>
              <Panel title="SESSION ID">
                <div className="text-[9px] tracking-[0.2em] text-white/80">{sessionId}</div>
              </Panel>
            </div>
            <div className="text-[9px] tracking-[0.15em] flex flex-col gap-[5px]">
              {visibleMessages.slice(5).map((m) => (
                <div key={m.text} className="text-[#c9a227]/80">&gt;&gt; {m.text.replace("...", "")}</div>
              ))}
              {showWelcome && <div className="text-white font-bold">&gt;&gt; ACCESS GRANTED</div>}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-end text-[8px] tracking-[0.2em] opacity-60">
          <div className="max-w-[50%]">
            <div>WARNING: UNAUTHORIZED ACCESS IS STRICTLY PROHIBITED</div>
            <div className="mt-1">ALL ACTIVITIES ARE MONITORED AND RECORDED</div>
          </div>
          <div className="text-right">
            <div className="text-[#c9a227]">FIB HEADQUARTERS</div>
            <div className="mt-1">LOS SANTOS, SAN ANDREAS</div>
            <button
              type="button"
              onClick={() => completeRef.current()}
              className="mt-2 opacity-60 hover:opacity-100 tracking-[0.3em] text-[8px]"
              data-testid="button-skip-boot"
            >
              ESC — ÜBERSPRINGEN
            </button>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .boot-scanlines { animation: bootScan 9s linear infinite; }
        @keyframes bootScan { from { transform: translateY(0); } to { transform: translateY(-8px); } }
        .boot-scanbar { animation: bootScanBar 7s ease-in-out infinite; }
        @keyframes bootScanBar { 0% { top: -10%; } 50% { top: 105%; } 100% { top: -10%; } }
        .boot-cursor { animation: bootBlink 1s steps(1) infinite; }
        @keyframes bootBlink { 50% { opacity: 0; } }
        .boot-map-drift { animation: bootMapDrift 60s linear infinite alternate; }
        @keyframes bootMapDrift { from { transform: translateX(0); } to { transform: translateX(-20%); } }
        .boot-grid-drift { animation: bootGridDrift 40s linear infinite alternate; }
        @keyframes bootGridDrift { from { transform: translate(0,0); } to { transform: translate(-24px,-16px); } }
        .boot-glitch { animation: bootGlitch 6s steps(1) infinite; opacity: 0; }
        @keyframes bootGlitch {
          0%, 91% { opacity: 0; transform: translateX(0); }
          92% { opacity: 1; transform: translateX(-3px); }
          93% { opacity: 0.6; transform: translateX(3px); }
          94% { opacity: 1; transform: translateX(-1px); }
          95%, 100% { opacity: 0; transform: translateX(0); }
        }
        .boot-flicker { animation: bootFlicker 8s steps(1) infinite; }
        @keyframes bootFlicker {
          0%, 87% { opacity: 1; }
          88% { opacity: 0.55; }
          89% { opacity: 1; }
          94% { opacity: 1; }
          95% { opacity: 0.7; }
          96%, 100% { opacity: 1; }
        }
        .boot-packet { position: absolute; top: -2px; width: 22px; height: 5px; border-radius: 3px;
          background: linear-gradient(90deg, transparent, #c9a227); box-shadow: 0 0 8px rgba(201,162,39,0.9);
          animation-name: bootPacket; animation-timing-function: linear; animation-iteration-count: infinite; }
        @keyframes bootPacket { from { left: -24px; opacity: 0.9; } to { left: 100%; opacity: 0.9; } }
        .boot-emblem-pulse { animation: bootEmblemPulse 3.2s ease-in-out infinite; }
        @keyframes bootEmblemPulse { 0%, 100% { opacity: 0.55; transform: scale(0.96); } 50% { opacity: 1; transform: scale(1.05); } }
        .boot-ring-slow { animation: bootRing 14s linear infinite; }
        .boot-ring-rev { animation: bootRing 20s linear infinite reverse; }
        @keyframes bootRing { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .boot-bar-sheen { background: linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent);
          animation: bootSheen 1.6s linear infinite; }
        @keyframes bootSheen { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
        .boot-welcome { animation: bootWelcome 0.9s ease-out; }
        @keyframes bootWelcome { from { opacity: 0; transform: scale(0.94); } to { opacity: 1; transform: scale(1); } }
        @media (prefers-reduced-motion: reduce) {
          .boot-scanlines, .boot-scanbar, .boot-cursor, .boot-map-drift, .boot-grid-drift,
          .boot-glitch, .boot-flicker, .boot-packet, .boot-emblem-pulse, .boot-ring-slow,
          .boot-ring-rev, .boot-bar-sheen, .boot-welcome { animation: none !important; }
          .boot-glitch { opacity: 0 !important; }
        }
      ` }} />
    </div>
  );
}
