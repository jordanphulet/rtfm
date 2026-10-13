import { CfnOutput, CfnParameter, LegacyStackSynthesizer, Stack } from "aws-cdk-lib";
import { CfnCertificate } from "aws-cdk-lib/aws-certificatemanager";
import type { Construct } from "constructs";
import { ACCOUNT, EDGE_STACKS } from "./rtfm.ts";

export const EDGE_CERTIFICATE_STACK = `${EDGE_STACKS}Certificate`;
/** Where the app answers, in the Route 53 public zone `moonfetus.com`. */
export const APP_DOMAIN = "rtfm.moonfetus.com";
/** CloudFront takes its certificates from us-east-1 only. */
export const CERTIFICATE_REGION = "us-east-1";

/**
 * The certificate for the app's domain, which the user deploys with their own sign-in. With the
 * zone's ID, CloudFormation writes the validation record into the zone itself, and the stack
 * completes once ACM has issued the certificate.
 */
export class RtfmEdgeCertificateStack extends Stack {
  constructor(scope: Construct) {
    super(scope, EDGE_CERTIFICATE_STACK, {
      env: { account: ACCOUNT, region: CERTIFICATE_REGION },
      synthesizer: new LegacyStackSynthesizer(),
      description: "RTFM's certificate for its domain, in us-east-1 for CloudFront: deployed by the user",
    });
    const hostedZoneId = new CfnParameter(this, "HostedZoneId", {
      type: "AWS::Route53::HostedZone::Id",
      description: "The ID of the Route 53 public zone moonfetus.com, such as Z111111QQQQQQQ",
    });
    const certificate = new CfnCertificate(this, "Certificate", {
      domainName: APP_DOMAIN,
      validationMethod: "DNS",
      domainValidationOptions: [{ domainName: APP_DOMAIN, hostedZoneId: hostedZoneId.valueAsString }],
    });
    new CfnOutput(this, "CertificateArn", { value: certificate.ref });
  }
}
