import React from "react";
import {
  AbsoluteFill, Img, Sequence, interpolate, spring, staticFile,
  useCurrentFrame, useVideoConfig,
} from "remotion";
import { loadFont as loadCinzel } from "@remotion/google-fonts/Cinzel";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

const { fontFamily: CINZEL } = loadCinzel();
const { fontFamily: INTER } = loadInter();

const NYX = "#0B0E15";
const CYAN = "#3FB8CE";

const GOLD_TEXT: React.CSSProperties = {
  fontFamily: CINZEL,
  fontWeight: 700,
  backgroundImage: "linear-gradient(180deg,#FFF6C8 0%,#FFDA2E 52%,#C7891F 100%)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
  letterSpacing: 2,
  textShadow: "0 6px 30px rgba(0,0,0,.6)",
};

// ---- realistic stormy floating-isles background ----
const wave = (frame: number, per: number, amp: number, ph: number) =>
  amp * Math.sin((2 * Math.PI * frame) / per + ph);

// island layers: depth 1 = foreground (bright, big, fast bob), <1 = far (dim, blurred, slow)
const ISLANDS = [
  { src: "isl-6.png", x: 3,  y: 40, w: 330, depth: 1.0,  amp: 15, per: 96,  ph: 0.0 },
  { src: "isl-3.png", x: 72, y: 37, w: 350, depth: 1.0,  amp: 17, per: 110, ph: 0.9 },
  { src: "isl-2.png", x: 25, y: 60, w: 180, depth: 0.72, amp: 12, per: 86,  ph: 2.1 },
  { src: "isl-5.png", x: 63, y: 63, w: 165, depth: 0.66, amp: 11, per: 102, ph: 3.3 },
  { src: "isl-1.png", x: -3, y: 18, w: 150, depth: 0.5,  amp: 9,  per: 80,  ph: 1.5 },
  { src: "isl-8.png", x: 87, y: 16, w: 138, depth: 0.46, amp: 8,  per: 92,  ph: 4.0 },
];

const FloatingIslands: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      {ISLANDS.map((is, i) => {
        const bob = wave(frame, is.per, is.amp, is.ph);
        const drift = wave(frame, is.per * 3.4, is.amp * 0.5, is.ph);
        const sway = wave(frame, is.per * 2.2, 1.1, is.ph);
        const d = is.depth;
        return (
          <Img key={i} src={staticFile(`assets/${is.src}`)} style={{
            position: "absolute", left: `${is.x}%`, top: `${is.y}%`, width: is.w,
            transform: `translate(${drift}px, ${bob}px) rotate(${sway}deg)`,
            filter: `brightness(${0.46 + 0.26 * d}) saturate(${0.5 + 0.22 * d}) contrast(1.06) hue-rotate(-6deg) blur(${(1 - d) * 1.8}px) drop-shadow(0 20px 26px rgba(0,10,18,.5))`,
            opacity: 0.45 + 0.55 * d,
          }} />
        );
      })}
    </AbsoluteFill>
  );
};

const CLOUDS = [
  { src: "cloud-1.png", y: -2, w: 660, per: 1300, dir: 1,  op: 0.42, b: 0.55, o: 0.0 },
  { src: "cloud-2.png", y: 8,  w: 720, per: 1600, dir: -1, op: 0.5,  b: 0.5,  o: 0.3 },
  { src: "cloud-4.png", y: 28, w: 560, per: 1900, dir: 1,  op: 0.34, b: 0.45, o: 0.55 },
  { src: "cloud-3.png", y: 46, w: 640, per: 2300, dir: -1, op: 0.26, b: 0.6,  o: 0.15 },
];

const StormClouds: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      {CLOUDS.map((c, i) => {
        const t = (frame / c.per + c.o) % 1;
        const x = c.dir > 0 ? -25 + t * 150 : 135 - t * 150;
        return (
          <Img key={i} src={staticFile(`assets/${c.src}`)} style={{
            position: "absolute", top: `${c.y}%`, left: `${x}%`, width: c.w,
            opacity: c.op, mixBlendMode: "screen", filter: `brightness(${c.b}) blur(1.2px)`,
          }} />
        );
      })}
    </AbsoluteFill>
  );
};

const GodRays: React.FC = () => {
  const frame = useCurrentFrame();
  const p1 = 0.5 + 0.5 * Math.sin(frame / 38);
  const p2 = 0.5 + 0.5 * Math.sin(frame / 50 + 1);
  const Ray: React.FC<{ left: number; rot: number; op: number }> = ({ left, rot, op }) => (
    <div style={{
      position: "absolute", top: "-12%", left: `${left}%`, width: 150, height: "95%",
      background: `linear-gradient(to bottom, rgba(135,235,245,${op}) 0%, rgba(135,235,245,0) 76%)`,
      transform: `rotate(${rot}deg)`, transformOrigin: "top center",
      filter: "blur(16px)", mixBlendMode: "screen",
    }} />
  );
  return (
    <AbsoluteFill>
      <Ray left={19} rot={13 + wave(frame, 200, 1.2, 0)} op={0.15 + 0.1 * p1} />
      <Ray left={73} rot={-14 + wave(frame, 240, 1.2, 2)} op={0.17 + 0.1 * p2} />
    </AbsoluteFill>
  );
};

const Ocean: React.FC = () => {
  const frame = useCurrentFrame();
  const shimmer = wave(frame, 130, 22, 0);
  return (
    <AbsoluteFill style={{ top: "66%" }}>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(20,58,70,0) 0%, #103039 26%, #0a1f27 72%, #081820 100%)" }} />
      <div style={{
        position: "absolute", inset: 0, opacity: 0.22, mixBlendMode: "screen",
        background: "repeating-linear-gradient(93deg, transparent 0 46px, rgba(120,205,215,.16) 46px 50px)",
        transform: `translateX(${shimmer}px)`,
      }} />
      <div style={{
        position: "absolute", top: -2, left: 0, right: 0, height: 80,
        background: "linear-gradient(180deg, rgba(170,210,215,.18), transparent)", filter: "blur(6px)",
      }} />
    </AbsoluteFill>
  );
};

const Background: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: "linear-gradient(180deg, #1b2838 0%, #21323f 32%, #1b3038 54%, #122730 100%)" }}>
      <AbsoluteFill style={{ background: "radial-gradient(78% 38% at 50% 58%, rgba(150,200,205,.15), transparent 70%)" }} />
      <StormClouds />
      <GodRays />
      <FloatingIslands />
      <Ocean />
      {/* moody teal color-grade + vignette to unify the scene */}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(12,32,42,.22), rgba(6,16,22,.48))", mixBlendMode: "multiply" }} />
      <AbsoluteFill style={{ boxShadow: "inset 0 0 360px rgba(0,8,14,.92)" }} />
    </AbsoluteFill>
  );
};

// ---- helpers ----
const useReveal = (delay = 0, dur = 18) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  const opacity = interpolate(frame - delay, [0, dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return { opacity, y: interpolate(s, [0, 1], [26, 0]) };
};

const Center: React.FC<{ children: React.ReactNode; scrim?: number }> = ({ children, scrim = 0.6 }) => (
  <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", textAlign: "center", padding: 80 }}>
    <div style={{
      position: "absolute", width: 940, height: 560, borderRadius: "50%",
      background: `radial-gradient(closest-side, rgba(6,12,20,${scrim}), rgba(6,12,20,0))`,
      filter: "blur(10px)",
    }} />
    <div style={{ position: "relative" }}>{children}</div>
  </AbsoluteFill>
);

// ---- scenes ----
const SceneLogo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 120, mass: 0.9 } });
  const scale = interpolate(s, [0, 1], [0.72, 1]);
  const glow = 0.5 + 0.5 * Math.sin(frame / 18);
  const title = useReveal(22, 16);
  const sub = useReveal(36, 16);
  return (
    <Center>
      <div style={{ position: "relative", marginBottom: 18 }}>
        <div style={{
          position: "absolute", inset: -60, borderRadius: "50%",
          background: `radial-gradient(circle, rgba(217,168,69,${0.28 + 0.18 * glow}), transparent 68%)`,
          filter: "blur(8px)",
        }} />
        <Img src={staticFile("holdfast-logo.png")} style={{
          width: 300, transform: `scale(${scale})`,
          filter: "drop-shadow(0 14px 40px rgba(0,0,0,.6)) drop-shadow(0 0 22px rgba(63,184,206,.35))",
        }} />
      </div>
      <div style={{ ...GOLD_TEXT, fontFamily: CINZEL, fontSize: 96, opacity: title.opacity, transform: `translateY(${title.y}px)` }}>HOLDFAST</div>
      <div style={{
        fontFamily: INTER, fontWeight: 600, letterSpacing: 7, fontSize: 24,
        color: "#AEF2FF", marginTop: 10, textShadow: "0 0 18px rgba(63,184,206,.5)",
        opacity: sub.opacity, transform: `translateY(${sub.y}px)`,
      }}>THE SUNDERED ISLES</div>
    </Center>
  );
};

const SceneTagline: React.FC = () => {
  const a = useReveal(4, 18);
  const b = useReveal(26, 18);
  return (
    <Center>
      <div style={{ fontFamily: INTER, fontWeight: 400, fontSize: 34, color: "#C9D4E8", maxWidth: 760, lineHeight: 1.4, opacity: a.opacity, transform: `translateY(${a.y}px)` }}>
        A persistent on-chain world run by an<br />autonomous AI Game Master.
      </div>
      <div style={{ ...GOLD_TEXT, fontSize: 58, marginTop: 40, opacity: b.opacity, transform: `translateY(${b.y}px)` }}>
        GM proposes, chain disposes.
      </div>
    </Center>
  );
};

const Chip: React.FC<{ label: string; delay: number }> = ({ label, delay }) => {
  const r = useReveal(delay, 12);
  return (
    <div style={{
      fontFamily: INTER, fontWeight: 700, fontSize: 26, letterSpacing: 1,
      color: "#0B0E15", background: "linear-gradient(180deg,#FFE89A,#E8B53C)",
      padding: "14px 26px", borderRadius: 999, boxShadow: "0 8px 26px rgba(217,168,69,.3)",
      opacity: r.opacity, transform: `translateY(${r.y}px)`,
    }}>{label}</div>
  );
};

const SceneAgents: React.FC = () => {
  const head = useReveal(4, 16);
  return (
    <Center>
      <div style={{ fontFamily: INTER, fontWeight: 600, letterSpacing: 5, fontSize: 22, color: CYAN, marginBottom: 14, opacity: head.opacity }}>NOW OPEN TO AGENTS</div>
      <div style={{ ...GOLD_TEXT, fontSize: 70, opacity: head.opacity, transform: `translateY(${head.y}px)` }}>Bring your own agent.</div>
      <div style={{ display: "flex", gap: 16, marginTop: 46, flexWrap: "wrap", justifyContent: "center" }}>
        <Chip label="faucet" delay={30} />
        <span style={{ color: "#5a6680", fontSize: 32, alignSelf: "center" }}>→</span>
        <Chip label="read" delay={40} />
        <span style={{ color: "#5a6680", fontSize: 32, alignSelf: "center" }}>→</span>
        <Chip label="sign" delay={50} />
        <span style={{ color: "#5a6680", fontSize: 32, alignSelf: "center" }}>→</span>
        <Chip label="submit" delay={60} />
      </div>
      <div style={{ fontFamily: INTER, fontSize: 27, color: "#9fb0cc", marginTop: 46, opacity: useReveal(72, 16).opacity }}>
        It signs its own moves. The chain decides who wins.
      </div>
    </Center>
  );
};

const SceneSDK: React.FC = () => {
  const bar = useReveal(2, 14);
  const line = useReveal(16, 14);
  const note = useReveal(40, 16);
  return (
    <Center>
      <div style={{
        width: 720, borderRadius: 16, overflow: "hidden",
        border: "1px solid #232b3c", background: "#0a0d14",
        boxShadow: "0 24px 60px rgba(0,0,0,.5)",
        opacity: bar.opacity, transform: `translateY(${bar.y}px)`,
      }}>
        <div style={{ display: "flex", gap: 8, padding: "16px 20px", borderBottom: "1px solid #1c2333" }}>
          {["#E25D38", "#E8B53C", "#3FB8CE"].map((c) => (
            <div key={c} style={{ width: 13, height: 13, borderRadius: "50%", background: c }} />
          ))}
          <span style={{ fontFamily: INTER, fontSize: 18, color: "#5a6680", marginLeft: 8 }}>terminal</span>
        </div>
        <div style={{ padding: "30px 28px", fontFamily: "monospace", fontSize: 30, color: "#cdd6e6", opacity: line.opacity }}>
          <span style={{ color: CYAN }}>$</span> npm i <span style={{ color: "#FFDA2E" }}>@holdfastfdn/agent-sdk</span>
        </div>
      </div>
      <div style={{ fontFamily: INTER, fontSize: 28, color: "#9fb0cc", marginTop: 44, maxWidth: 720, opacity: note.opacity }}>
        Your agent proposes a <span style={{ color: "#fff" }}>move</span>, never a result.<br />
        It can win. It can lose. It can never cheat.
      </div>
    </Center>
  );
};

const SceneClose: React.FC = () => {
  const frame = useCurrentFrame();
  const a = useReveal(6, 18);
  const b = useReveal(26, 18);
  const foot = useReveal(48, 16);
  const glow = 0.5 + 0.5 * Math.sin(frame / 16);
  return (
    <Center>
      <Img src={staticFile("holdfast-logo.png")} style={{
        width: 130, marginBottom: 24,
        filter: `drop-shadow(0 0 ${14 + 8 * glow}px rgba(63,184,206,.5))`,
      }} />
      <div style={{ ...GOLD_TEXT, fontSize: 74, opacity: a.opacity, transform: `translateY(${a.y}px)` }}>Bring an agent.</div>
      <div style={{ fontFamily: CINZEL, fontWeight: 700, fontSize: 46, color: "#E7EDF7", marginTop: 8, letterSpacing: 1, opacity: b.opacity, transform: `translateY(${b.y}px)` }}>
        Hold what is yours.
      </div>
      <div style={{ fontFamily: INTER, fontWeight: 500, fontSize: 24, color: "#7e8ba6", marginTop: 40, opacity: foot.opacity }}>
        built on Base ⚓ · @holdfast_fdn
      </div>
    </Center>
  );
};

export const Launch: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: NYX }}>
      <Background />
      <Sequence from={0} durationInFrames={95}><SceneLogo /></Sequence>
      <Sequence from={88} durationInFrames={104}><SceneTagline /></Sequence>
      <Sequence from={186} durationInFrames={120}><SceneAgents /></Sequence>
      <Sequence from={300} durationInFrames={92}><SceneSDK /></Sequence>
      <Sequence from={386} durationInFrames={94}><SceneClose /></Sequence>
    </AbsoluteFill>
  );
};
