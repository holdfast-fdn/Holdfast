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

// ---- atmosphere ----
const STARS = new Array(46).fill(0).map((_, i) => ({
  x: (i * 97.13) % 100,
  y: (i * 53.7 + 11) % 100,
  s: (i % 3) + 1,
  ph: i * 7,
}));

const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const pulse = 0.5 + 0.5 * Math.sin(frame / 34);
  const drift = Math.sin(frame / 70) * 16;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(125% 100% at 50% 26%, #15233f 0%, ${NYX} 62%)` }}>
      {STARS.map((st, i) => {
        const tw = 0.25 + 0.55 * Math.abs(Math.sin((frame + st.ph) / 38));
        return (
          <div key={i} style={{
            position: "absolute", left: `${st.x}%`, top: `${st.y}%`,
            width: st.s, height: st.s, borderRadius: "50%",
            background: "#cfe0ff", opacity: tw * 0.7,
          }} />
        );
      })}
      <AbsoluteFill style={{ background: `radial-gradient(42% 30% at ${50 + drift / 5}% 42%, rgba(217,168,69,${0.1 + 0.07 * pulse}), transparent 70%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(34% 24% at ${50 - drift / 4}% 50%, rgba(63,184,206,0.1), transparent 70%)` }} />
      <AbsoluteFill style={{ boxShadow: "inset 0 0 320px rgba(0,0,0,.85)" }} />
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

const Center: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", textAlign: "center", padding: 80 }}>
    {children}
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
