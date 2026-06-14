import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { Background, GOLD_TEXT, CINZEL, INTER, CYAN } from "./Launch";

const Pillar: React.FC<{ icon: string; title: string; desc: React.ReactNode }> = ({ icon, title, desc }) => (
  <div style={{ display: "flex", gap: 18, alignItems: "flex-start", marginBottom: 22 }}>
    <span style={{ fontSize: 36, lineHeight: 1 }}>{icon}</span>
    <div>
      <div style={{ ...GOLD_TEXT, fontFamily: CINZEL, fontSize: 27 }}>{title}</div>
      <div style={{ fontFamily: INTER, fontSize: 19, color: "#c5d0e2", lineHeight: 1.4, marginTop: 2 }}>{desc}</div>
    </div>
  </div>
);

const ODDS = [
  { c: "60", x: "match", p: 43 },
  { c: "120", x: "2×", p: 52 },
  { c: "240", x: "4×", p: 60 },
  { c: "400", x: "≈7×", p: 66 },
];

const OddsRow: React.FC<{ c: string; x: string; p: number }> = ({ c, x, p }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 11 }}>
    <div style={{ width: 150, fontFamily: "monospace", fontSize: 19, color: "#e7edf7" }}>
      {c} Flux <span style={{ color: "#6b7894", fontSize: 15 }}>({x})</span>
    </div>
    <div style={{ flex: 1, height: 16, background: "#0a121b", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ width: `${p}%`, height: "100%", background: "linear-gradient(90deg,#E8B53C,#FFDA2E)", boxShadow: "0 0 10px rgba(255,218,46,.4)" }} />
    </div>
    <div style={{ width: 64, textAlign: "right", fontFamily: "monospace", fontWeight: 700, fontSize: 20, color: "#FFDA2E" }}>~{p}%</div>
  </div>
);

export const PlayerGuide: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0B0E15" }}>
      <Background />
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(6,12,20,.55), rgba(6,14,22,.72))" }} />
      <AbsoluteFill style={{ padding: "58px 72px", display: "flex", flexDirection: "column" }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 30 }}>
          <Img src={staticFile("holdfast-logo.png")} style={{ width: 74, filter: "drop-shadow(0 0 14px rgba(63,184,206,.4))" }} />
          <div>
            <div style={{ fontFamily: INTER, fontWeight: 700, letterSpacing: 6, fontSize: 14, color: CYAN }}>THE SUNDERED ISLES</div>
            <div style={{ ...GOLD_TEXT, fontSize: 52, lineHeight: 1.05 }}>HOW TO PLAY</div>
          </div>
        </div>

        {/* pillars */}
        <Pillar icon="🎯" title="Take isles, hold them" desc="Every isle you hold yields Flux to you each tick. More ground = more Flux." />
        <Pillar icon="💰" title="Flux is your war chest" desc={<>Commit it to attack. <b style={{ color: "#fff" }}>Win</b> → take the isle + spoils. <b style={{ color: "#fff" }}>Lose</b> → most of it burns.</>} />
        <Pillar icon="🎲" title="Bigger commit = better odds" desc="But defenders have the edge — matching the garrison isn't a coin flip." />

        {/* odds table */}
        <div style={{
          background: "rgba(10,14,22,.66)", border: "1px solid #232B3C", borderRadius: 16,
          padding: "22px 26px", marginTop: 8,
        }}>
          <div style={{ fontFamily: INTER, fontWeight: 700, fontSize: 18, color: "#e7edf7", marginBottom: 16 }}>
            🎲 Will it be enough? <span style={{ color: STEEL_NOTE }}>— attacking a 60-Flux isle:</span>
          </div>
          {ODDS.map((o) => <OddsRow key={o.c} {...o} />)}
          <div style={{ fontFamily: INTER, fontSize: 15.5, color: "#8696b3", marginTop: 8, fontStyle: "italic" }}>
            The Herald shows your exact chance before you commit.
          </div>
        </div>

        {/* command */}
        <div style={{ marginTop: 22 }}>
          <div style={{
            fontFamily: "monospace", fontSize: 21, color: CYAN, background: "rgba(63,184,206,.09)",
            borderLeft: `3px solid ${CYAN}`, padding: "13px 16px", borderRadius: 6,
          }}>attack tile 5 with 120 flux</div>
          <div style={{ fontFamily: INTER, fontSize: 16, color: "#8696b3", marginTop: 10 }}>
            @holdfast_gmbot · /wallet shows your Flux · /map shows every isle's garrison & number
          </div>
        </div>

        <div style={{ flex: 1 }} />
        {/* footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #232B3C", paddingTop: 20 }}>
          <div style={{ fontFamily: CINZEL, fontWeight: 700, fontSize: 19, color: "#AEF2FF", letterSpacing: 1 }}>holdfast.foundation ⚓</div>
          <div style={{ ...GOLD_TEXT, fontSize: 19 }}>GM proposes, chain disposes.</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const STEEL_NOTE = "#8696b3";
