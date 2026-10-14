/**
 * The deployed resources the ops tools read, by the names `infra/` gives them. These are written
 * out rather than imported, since `infra/app-stack.ts` and the edge stacks load the CDK;
 * `deployed.test.ts` keeps them the same.
 */
export const APP_STACK = "RtfmApp";
export const EDGE_STACK = "RtfmEdge";
export const EDGE_CERTIFICATE_STACK = "RtfmEdgeCertificate";
export const CERTIFICATE_REGION = "us-east-1";
export const WEB_FUNCTION = "rtfm-app";
export const WEB_FUNCTION_ENDPOINT = "main";
export const APP_LOG_GROUP = "/rtfm/app";
