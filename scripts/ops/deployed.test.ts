import { describe, expect, it } from "vitest";
import * as appStack from "../../infra/app-stack.ts";
import * as edgeCertificateStack from "../../infra/edge-certificate-stack.ts";
import * as edgeStack from "../../infra/edge-stack.ts";
import * as deployed from "./deployed.ts";

describe("the deployed resources the ops tools read", () => {
  it("are named as infra/ names them", () => {
    expect({ ...deployed }).toEqual({
      APP_STACK: appStack.APP_STACK,
      EDGE_STACK: edgeStack.EDGE_STACK,
      EDGE_CERTIFICATE_STACK: edgeCertificateStack.EDGE_CERTIFICATE_STACK,
      CERTIFICATE_REGION: edgeCertificateStack.CERTIFICATE_REGION,
      WEB_FUNCTION: appStack.WEB_FUNCTION,
      WEB_FUNCTION_ENDPOINT: appStack.WEB_FUNCTION_ENDPOINT,
      APP_LOG_GROUP: appStack.APP_LOG_GROUP,
      APP_ORIGIN: `https://${edgeCertificateStack.APP_DOMAIN}`,
    });
  });
});
