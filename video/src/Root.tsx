import { Composition } from "remotion";
import { Launch } from "./Launch";
import { HoldLaunch } from "./HoldLaunch";

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
    </>
  );
};
