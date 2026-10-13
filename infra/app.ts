import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { App, DefaultStackSynthesizer, Tags } from "aws-cdk-lib";
import { RtfmAccessStack } from "./access-stack.ts";
import { RtfmAppStack } from "./app-stack.ts";
import { RtfmEdgeCertificateStack } from "./edge-certificate-stack.ts";
import { RtfmEdgeStack } from "./edge-stack.ts";
import { PROJECT_TAG, QUALIFIER } from "./rtfm.ts";
import { RtfmToolkitStack } from "./toolkit-stack.ts";

/**
 * RTFM's CDK app: the stacks the user deploys (the bootstrap, RTFM's access, and the two edge
 * stacks), and the app stack, which deploys through RTFM's bootstrap with the `rtfm` qualifier.
 */
export function createApp(): App {
  const app = new App({
    analyticsReporting: false,
    defaultStackSynthesizer: new DefaultStackSynthesizer({ qualifier: QUALIFIER }),
  });
  new RtfmToolkitStack(app);
  new RtfmAccessStack(app);
  new RtfmAppStack(app);
  new RtfmEdgeCertificateStack(app);
  new RtfmEdgeStack(app);
  Tags.of(app).add(PROJECT_TAG.key, PROJECT_TAG.value);
  return app;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createApp().synth();
}
