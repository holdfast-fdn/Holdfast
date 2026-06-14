import { Composition } from "remotion";
import { Launch } from "./Launch";
import { HoldLaunch } from "./HoldLaunch";
import { RoadmapCard } from "./RoadmapCard";
import { HowToPlay } from "./HowToPlay";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Launch"
        component={Launch}
        durationInFrames={480}
        fps={30}
        width={1080}
        height={1080}
      />
      <Composition
        id="HoldLaunch"
        component={HoldLaunch}
        durationInFrames={490}
        fps={30}
        width={1080}
        height={1080}
      />
      <Composition
        id="Roadmap"
        component={RoadmapCard}
        durationInFrames={1}
        fps={30}
        width={1080}
        height={1350}
      />
      <Composition
        id="HowToPlay"
        component={HowToPlay}
        durationInFrames={1}
        fps={30}
        width={1600}
        height={900}
      />
    </>
  );
};
