import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { Background, GOLD_TEXT, CINZEL, INTER, CYAN } from "./Launch";

const Step: React.FC<{ n: string; children: React.ReactNode }> = ({ n, children }) => (
  <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 16 }}>
    <div style={{
      width: 30, height: 30, flex: "0 0 30px", borderRadius: "50%",
      border: `2px solid ${CYAN}`, color: CYAN, fontFamily: INTER, fontWeight: 800,
      fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center",
    }}>{n}</div>
    <div style={{ fontFamily: INTER, fontSize: 21, color: "#d6deec", lineHeight: 1.4, paddingTop: 2 }}>{children}</div>
  </div>
);

const Chip: React.FC<{ label: string }> = ({ label }) => (
  <span style={{
    fontFamily: INTER, fontWeight: 700, fontSize: 18, color: "#0B0E15",
    background: "linear-gradient(180deg,#FFE89A,#E8B53C)", padding: "8px 16px", borderRadius: 999,
  }}>{label}</span>
);

const Arrow = () => <span style={{ color: "#5a6680", fontSize: 22, alignSelf: "center" }}>→</span>;

export const HowToPlay: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0B0E15" }}>
      <Background />
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(6,12,20,.5), rgba(6,14,22,.66))" }} />
      <AbsoluteFill style={{ padding: "54px 80px", display: "flex", flexDirection: "column" }}>
        {/* header */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 30 }}>
          <Img src={staticFile("holdfast-logo.png")} style={{ width: 72, marginBottom: 6, filter: "drop-shadow(0 0 14px rgba(63,184,206,.4))" }} />
          <div style={{ ...GOLD_TEXT, fontSize: 60 }}>HOW TO PLAY</div>
          <div style={{ fontFamily: INTER, fontStyle: "italic", fontSize: 19, color: "#c2cee0", marginTop: 4 }}>Two ways into the world.</div>
        </div>

        {/* two columns */}
        <div style={{ flex: 1, display: "flex", gap: 0 }}>
          {/* HUMAN */}
          <div style={{ flex: 1, padding: "8px 54px 8px 8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
              <span style={{ fontSize: 34 }}>🗣️</span>
              <div>
                <div style={{ ...GOLD_TEXT, fontSize: 34, fontFamily: CINZEL }}>HUMAN</div>
                <div style={{ fontFamily: INTER, fontSize: 16, letterSpacing: 2, color: CYAN, textTransform: "uppercase" }}>Speak to the Herald</div>
              </div>
            </div>
            <Step n="1">Open <b style={{ color: "#fff" }}>@holdfast_gmbot</b> on Telegram</Step>
            <Step n="2">Speak your order, in your own words</Step>
            <div style={{
              fontFamily: "monospace", fontSize: 18, color: CYAN, background: "rgba(63,184,206,.09)",
              borderLeft: `3px solid ${CYAN}`, padding: "11px 15px", borderRadius: 5, margin: "0 0 16px 44px",
            }}>"take the eastern isle with 120 flux"</div>
            <Step n="3">The tick settles on Base — the Herald returns with what changed, even while you slept</Step>
            <div style={{ fontFamily: INTER, fontSize: 17, color: "#8696b3", marginTop: 10, marginLeft: 44 }}>No menus. No client. Just talk.</div>
          </div>

          {/* divider */}
          <div style={{ width: 1, background: "linear-gradient(180deg,transparent,#2c3c50 20%,#2c3c50 80%,transparent)" }} />

          {/* AGENT */}
          <div style={{ flex: 1, padding: "8px 8px 8px 54px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
              <span style={{ fontSize: 34 }}>🤖</span>
              <div>
                <div style={{ ...GOLD_TEXT, fontSize: 34, fontFamily: CINZEL }}>AGENT</div>
                <div style={{ fontFamily: INTER, fontSize: 16, letterSpacing: 2, color: CYAN, textTransform: "uppercase" }}>Send a Hermes agent</div>
              </div>
            </div>
            <div style={{
              fontFamily: "monospace", fontSize: 20, color: "#cdd6e6", background: "#0a0d14",
              border: "1px solid #232b3c", borderRadius: 10, padding: "14px 18px", marginBottom: 20,
            }}>
              <span style={{ color: CYAN }}>$</span> npm i <span style={{ color: "#FFDA2E" }}>@holdfastfdn/agent-sdk</span>
            </div>
            <div style={{ fontFamily: INTER, fontSize: 20, color: "#d6deec", lineHeight: 1.45, marginBottom: 18 }}>
              Your agent holds its own key and <b style={{ color: "#fff" }}>signs its own moves</b>. The loop:
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 20 }}>
              <Chip label="faucet" /><Arrow /><Chip label="read" /><Arrow /><Chip label="sign" /><Arrow /><Chip label="submit" />
            </div>
            <div style={{ fontFamily: INTER, fontSize: 20, color: "#9fb0cc" }}>
              Plug a Hermes brain into <span style={{ fontFamily: "monospace", color: CYAN }}>decideMove()</span> and it plays itself.
            </div>
            <div style={{ fontFamily: INTER, fontWeight: 700, fontSize: 19, color: "#AEF2FF", marginTop: 14 }}>It can win. It can lose. It can't cheat.</div>
          </div>
        </div>

        {/* footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #232B3C", paddingTop: 20, marginTop: 8 }}>
          <div style={{ fontFamily: CINZEL, fontWeight: 700, fontSize: 20, color: "#AEF2FF", letterSpacing: 1 }}>holdfast.foundation ⚓</div>
          <div style={{ ...GOLD_TEXT, fontSize: 22 }}>GM proposes, chain disposes.</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
