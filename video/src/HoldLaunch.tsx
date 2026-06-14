import React from "react";
import {
  AbsoluteFill, Img, Sequence, interpolate, spring, staticFile,
  useCurrentFrame, useVideoConfig,
} from "remotion";
import { Background, Center, useReveal, GOLD_TEXT, CINZEL, INTER, CYAN } from "./Launch";

const ORANGE = "#FF613D";
const CREAM = "#E9E5D0";

// 1 — $HOLD reveal
const SceneHold: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 130 } });
  const scale = interpolate(s, [0, 1], [0.55, 1]);
  const glow = 0.5 + 0.5 * Math.sin(frame / 16);
  const ticker = useReveal(12, 14);
  const sub = useReveal(30, 16);
  return (
    <Center>
      <Img src={staticFile("holdfast-logo.png")} style={{
        width: 150, marginBottom: 4,
        filter: `drop-shadow(0 0 ${16 + 8 * glow}px rgba(63,184,206,.5)) drop-shadow(0 12px 26px rgba(0,0,0,.6))`,
      }} />
      <div style={{ ...GOLD_TEXT, fontSize: 152, lineHeight: 1, transform: `scale(${scale})`, opacity: ticker.opacity }}>$HOLD</div>
      <div style={{
        fontFamily: INTER, fontWeight: 600, letterSpacing: 5, fontSize: 22, color: "#AEF2FF",
        marginTop: 16, opacity: sub.opacity, transform: `translateY(${sub.y}px)`,
        textShadow: "0 0 16px rgba(63,184,206,.4)",
      }}>THE ANCHOR TOKEN OF HOLDFAST</div>
    </Center>
  );
};

// 2 — launching on Bankr
const SceneBankr: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const head = useReveal(2, 14);
  const s = spring({ frame: frame - 12, fps, config: { damping: 120, mass: 0.8 } });
  const scale = interpolate(s, [0, 1], [0.7, 1]);
  const glow = 0.5 + 0.5 * Math.sin(frame / 18);
  const wm = useReveal(30, 14);
  return (
    <Center scrim={0.5}>
      <div style={{ fontFamily: INTER, fontWeight: 600, letterSpacing: 6, fontSize: 24, color: "#C9D4E8", marginBottom: 32, opacity: head.opacity }}>LAUNCHING ON</div>
      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", inset: -42, borderRadius: 44, background: `radial-gradient(circle, rgba(255,97,61,${0.32 + 0.2 * glow}), transparent 70%)`, filter: "blur(10px)" }} />
        <Img src={staticFile("bankr.svg")} style={{ width: 230, transform: `scale(${scale})`, filter: "drop-shadow(0 16px 36px rgba(0,0,0,.55))", borderRadius: 30, position: "relative" }} />
      </div>
      <div style={{ fontFamily: CINZEL, fontWeight: 900, fontSize: 66, letterSpacing: 4, color: CREAM, marginTop: 26, opacity: wm.opacity, transform: `translateY(${wm.y}px)`, textShadow: "0 4px 18px rgba(0,0,0,.6)" }}>BANKR</div>
    </Center>
  );
};

// 3 — one world, two tokens (the pool)
const Token: React.FC<{ img: string; label: string; sub: string; reveal: { opacity: number; y: number } }> = ({ img, label, sub, reveal }) => (
  <div style={{ opacity: reveal.opacity, transform: `translateY(${reveal.y}px)`, textAlign: "center" }}>
    <Img src={staticFile(img)} style={{ width: 132, filter: "drop-shadow(0 10px 24px rgba(0,0,0,.5))" }} />
    <div style={{ ...GOLD_TEXT, fontSize: 38, marginTop: 6 }}>{label}</div>
    <div style={{ fontFamily: INTER, fontSize: 15, letterSpacing: 2, color: "#8696b3", textTransform: "uppercase", marginTop: 2 }}>{sub}</div>
  </div>
);

const ScenePool: React.FC = () => {
  const frame = useCurrentFrame();
  const head = useReveal(4, 14);
  const left = useReveal(18, 12);
  const right = useReveal(30, 12);
  const note = useReveal(50, 16);
  const swap = 0.5 + 0.5 * Math.sin(frame / 11);
  return (
    <Center>
      <div style={{ ...GOLD_TEXT, fontSize: 54, opacity: head.opacity, transform: `translateY(${head.y}px)` }}>One world. Two tokens.</div>
      <div style={{ display: "flex", alignItems: "center", gap: 36, marginTop: 46 }}>
        <Token img="holdfast-logo.png" label="$HOLD" sub="anchor" reveal={left} />
        <div style={{ fontSize: 52, color: CYAN, opacity: 0.45 + 0.55 * swap, transform: `scale(${0.92 + 0.12 * swap})` }}>⇄</div>
        <Token img="flux-token.svg" label="$FLUX" sub="in-game" reveal={right} />
      </div>
      <div style={{ fontFamily: INTER, fontSize: 27, color: "#9fb0cc", marginTop: 44, maxWidth: 760, opacity: note.opacity }}>
        $HOLD seeds the <b style={{ color: "#fff" }}>$HOLD/$FLUX</b> pool — a real market for in-game Flux.
      </div>
    </Center>
  );
};

// 4 — rewards
const SceneReward: React.FC = () => {
  const head = useReveal(4, 16);
  const note = useReveal(26, 16);
  return (
    <Center>
      <div style={{ fontFamily: INTER, fontWeight: 600, letterSpacing: 5, fontSize: 22, color: ORANGE, marginBottom: 14, opacity: head.opacity }}>AND IT FUNDS THE REWARDS</div>
      <div style={{ ...GOLD_TEXT, fontSize: 70, opacity: head.opacity, transform: `translateY(${head.y}px)` }}>Play earns.</div>
      <div style={{ fontFamily: INTER, fontSize: 28, color: "#9fb0cc", marginTop: 40, maxWidth: 760, lineHeight: 1.5, opacity: note.opacity }}>
        Take isles, hold ground, outplay the AI factions — the treasury that pays
        players is backed by $HOLD. The chain settles it.
      </div>
    </Center>
  );
};

// 5 — CTA
const SceneCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const a = useReveal(6, 18);
  const b = useReveal(26, 18);
  const foot = useReveal(46, 16);
  const glow = 0.5 + 0.5 * Math.sin(frame / 16);
  return (
    <Center>
      <Img src={staticFile("holdfast-logo.png")} style={{ width: 120, marginBottom: 20, filter: `drop-shadow(0 0 ${14 + 8 * glow}px rgba(63,184,206,.5))` }} />
      <div style={{ ...GOLD_TEXT, fontSize: 88, opacity: a.opacity, transform: `translateY(${a.y}px)` }}>$HOLD on Bankr</div>
      <div style={{ fontFamily: CINZEL, fontWeight: 700, fontSize: 42, color: "#E7EDF7", marginTop: 8, letterSpacing: 1, opacity: b.opacity, transform: `translateY(${b.y}px)` }}>Hold what is yours.</div>
      <div style={{ fontFamily: INTER, fontWeight: 700, fontSize: 30, color: "#AEF2FF", marginTop: 34, letterSpacing: 1, opacity: foot.opacity, textShadow: "0 0 16px rgba(63,184,206,.45)" }}>holdfast.foundation ⚓</div>
    </Center>
  );
};

export const HoldLaunch: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0B0E15" }}>
      <Background />
      <Sequence from={0} durationInFrames={90}><SceneHold /></Sequence>
      <Sequence from={84} durationInFrames={106}><SceneBankr /></Sequence>
      <Sequence from={184} durationInFrames={122}><ScenePool /></Sequence>
      <Sequence from={300} durationInFrames={94}><SceneReward /></Sequence>
      <Sequence from={388} durationInFrames={102}><SceneCTA /></Sequence>
    </AbsoluteFill>
  );
};
