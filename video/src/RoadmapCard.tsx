import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { Background, GOLD_TEXT, CINZEL, INTER, CYAN } from "./Launch";

const LAUREL = "#7FC08A";
const STEEL = "#8696b3";

type St = "done" | "next" | "later";
const PHASES: { n: string; name: string; desc: string; st: St; hl?: boolean }[] = [
  { n: "00", name: "Mechanical validation", desc: "resolver math + multi-tick world sim", st: "done" },
  { n: "01", name: "Tuning & balance lab", desc: "economy provably healthy while active", st: "done" },
  { n: "02", name: "On-chain settlement", desc: "live on Base · parity gate + self-audit", st: "done" },
  { n: "03", name: "AI Game Master & factions", desc: "factions play autonomously, on honest VRF", st: "done" },
  { n: "★", name: "Public agent arena", desc: "@holdfastfdn/agent-sdk — anyone's agent plays", st: "done", hl: true },
  { n: "04", name: "Closed playtest", desc: "~10 players · daily ticks · is it fun?", st: "next" },
  { n: "05", name: "Companion & indexer", desc: "history, war log, UX polish", st: "later" },
  { n: "06", name: "Scaling & hardening", desc: "VRF · external audit · legal · global layer", st: "later" },
];

const dotColor = (st: St) => (st === "done" ? LAUREL : st === "next" ? CYAN : STEEL);

const Row: React.FC<{ p: typeof PHASES[number]; last: boolean }> = ({ p, last }) => {
  const c = dotColor(p.st);
  const dim = p.st === "later" ? 0.62 : 1;
  return (
    <div style={{ display: "flex", gap: 22, opacity: dim }}>
      {/* node + connector */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 34 }}>
        <div style={{
          width: 26, height: 26, borderRadius: "50%", flex: "0 0 26px",
          background: p.st === "done" ? c : "transparent",
          border: `2.5px solid ${c}`,
          boxShadow: p.st === "next" ? `0 0 16px ${c}` : "none",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, color: "#0B0E15", fontWeight: 900,
        }}>{p.st === "done" ? "✓" : ""}</div>
        {!last && <div style={{ width: 2, flex: 1, background: "linear-gradient(180deg,#3a4d6b,#283449)", minHeight: 40 }} />}
      </div>
      {/* text */}
      <div style={{ paddingBottom: 26, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span style={{ fontFamily: INTER, fontWeight: 800, fontSize: 14, letterSpacing: 2, color: p.hl ? "#FFDA2E" : STEEL }}>
            {p.hl ? "NOW LIVE" : `PHASE ${p.n}`}
          </span>
          {p.st === "next" && <span style={{ fontFamily: INTER, fontWeight: 800, fontSize: 12, letterSpacing: 2, color: "#0B0E15", background: CYAN, padding: "3px 9px", borderRadius: 20 }}>NEXT</span>}
        </div>
        <div style={{ fontFamily: CINZEL, fontWeight: 700, fontSize: 27, color: p.st === "later" ? "#cfd8e6" : "#F1EEE4", marginTop: 3, letterSpacing: .5 }}>{p.name}</div>
        <div style={{ fontFamily: INTER, fontSize: 16.5, color: "#9fb0cc", marginTop: 3 }}>{p.desc}</div>
      </div>
    </div>
  );
};

export const RoadmapCard: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0B0E15" }}>
      <Background />
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(6,12,20,.55), rgba(6,14,22,.7))" }} />
      <AbsoluteFill style={{ padding: "60px 70px", display: "flex", flexDirection: "column" }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 8 }}>
          <Img src={staticFile("holdfast-logo.png")} style={{ width: 74, filter: "drop-shadow(0 0 14px rgba(63,184,206,.4))" }} />
          <div>
            <div style={{ fontFamily: INTER, fontWeight: 700, letterSpacing: 6, fontSize: 14, color: CYAN }}>THE SUNDERED ISLES</div>
            <div style={{ ...GOLD_TEXT, fontSize: 52, lineHeight: 1.05 }}>ROADMAP</div>
          </div>
        </div>
        <div style={{ fontFamily: INTER, fontStyle: "italic", fontSize: 17, color: "#c2cee0", marginBottom: 30, marginLeft: 92 }}>
          Lowest risk to highest. Prove it's fun before scaling.
        </div>

        {/* phases */}
        <div style={{ flex: 1 }}>
          {PHASES.map((p, i) => <Row key={i} p={p} last={i === PHASES.length - 1} />)}
        </div>

        {/* footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #232B3C", paddingTop: 22 }}>
          <div style={{ fontFamily: CINZEL, fontWeight: 700, fontSize: 19, color: "#AEF2FF", letterSpacing: 1 }}>holdfast.foundation ⚓</div>
          <div style={{ fontFamily: INTER, fontSize: 15, color: STEEL }}>GM proposes · chain disposes</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
