import { Composition } from "remotion";
import { Launch } from "./Launch";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Launch"
      component={Launch}
      durationInFrames={480}
      fps={30}
      width={1080}
      height={1080}
    />
  );
};
