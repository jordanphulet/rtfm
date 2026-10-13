import { CfnOutput, CfnParameter, LegacyStackSynthesizer, Stack, Validations } from "aws-cdk-lib";
import {
  CachePolicy,
  CfnDistribution,
  CfnFunction,
  CfnOriginAccessControl,
  OriginRequestPolicy,
  ResponseHeadersPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { CfnResourcePolicy } from "aws-cdk-lib/aws-lambda";
import { CfnRecordSet } from "aws-cdk-lib/aws-route53";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import type { Construct } from "constructs";
import { APP_DOMAIN, CERTIFICATE_REGION } from "./edge-certificate-stack.ts";
import { ACCOUNT, EDGE_STACKS, REGION, webFunctionArn } from "./rtfm.ts";

export const EDGE_STACK = EDGE_STACKS;
/** The Web Function `RtfmApp` holds, whose name never changes; a test keeps the two the same. */
export const EDGE_WEB_FUNCTION = "rtfm-app";
export const ORIGIN_ACCESS_CONTROL = "rtfm-app";
export const HOST_CHECK_FUNCTION = "rtfm-app-host-check";
/** Between packets as well as before the first; the server's event streams send a heartbeat every 15s. */
const ORIGIN_READ_TIMEOUT_SECONDS = 60;

/**
 * The viewer-request function on every path: it refuses any `Host` but the app's domain, so the
 * distribution's own `*.cloudfront.net` domain is refused. The server can't do this itself, since
 * CloudFront sends it the endpoint's domain as the `Host`.
 */
export const HOST_CHECK_CODE = `function handler(event) {
  var host = event.request.headers.host;
  if (host && host.value.toLowerCase() === "${APP_DOMAIN}") return event.request;
  return { statusCode: 403, statusDescription: "Forbidden" };
}
`;

const ORIGIN_ID = "web-function";
const ALL_METHODS = ["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "POST", "DELETE"];
const READ_METHODS = ["GET", "HEAD"];

/**
 * The app at `https://rtfm.moonfetus.com`, which the user deploys with their own sign-in: a
 * CloudFront distribution in front of the Web Function `rtfm-app`, the domain's alias records,
 * and the Web Function's resource policy, which lets only this distribution invoke it.
 */
export class RtfmEdgeStack extends Stack {
  constructor(scope: Construct) {
    super(scope, EDGE_STACK, {
      env: { account: ACCOUNT, region: REGION },
      synthesizer: new LegacyStackSynthesizer(),
      description: "RTFM's CloudFront distribution, DNS records and Web Function resource policy: deployed by the user",
    });
    const certificateArn = new CfnParameter(this, "CertificateArn", {
      type: "String",
      allowedPattern: `arn:aws:acm:${CERTIFICATE_REGION}:${ACCOUNT}:certificate/[0-9a-f-]+`,
      description: "RtfmEdgeCertificate's output CertificateArn",
    });
    const hostedZoneId = new CfnParameter(this, "HostedZoneId", {
      type: "AWS::Route53::HostedZone::Id",
      description: "The ID of the Route 53 public zone moonfetus.com, such as Z111111QQQQQQQ",
    });
    const endpointDomain = new CfnParameter(this, "EndpointDomain", {
      type: "String",
      allowedPattern: `[a-z0-9-]+(\\.[a-z0-9-]+)*\\.lambda-web\\.${REGION}\\.on\\.aws`,
      description: "RtfmApp's output EndpointDomain",
    });

    const distribution = this.distribution(certificateArn.valueAsString, endpointDomain.valueAsString);
    for (const type of ["A", "AAAA"]) {
      new CfnRecordSet(this, `AliasRecord${type}`, {
        hostedZoneId: hostedZoneId.valueAsString,
        name: APP_DOMAIN,
        type,
        aliasTarget: { dnsName: distribution.attrDomainName, hostedZoneId: CloudFrontTarget.CLOUDFRONT_ZONE_ID },
      });
    }
    this.letOnlyThisDistributionInvoke(distribution);
    new CfnOutput(this, "DistributionDomain", { value: distribution.attrDomainName });
  }

  /**
   * The API is never cached and gets every viewer header but `Host`; the app's hashed files are
   * cached as the server says, and every page is fetched again, so a deploy shows at once. Every
   * response carries AWS's managed security headers, HSTS among them. One connection attempt,
   * since CloudFront would otherwise retry a `GET` stream that times out and pay for a second run.
   */
  private distribution(certificateArn: string, endpointDomain: string): CfnDistribution {
    const originAccessControl = new CfnOriginAccessControl(this, "OriginAccessControl", {
      originAccessControlConfig: {
        name: ORIGIN_ACCESS_CONTROL,
        originAccessControlOriginType: "lambda",
        signingBehavior: "always-amz-auth",
        signingProtocol: "sigv4",
      },
    });
    const hostCheck = new CfnFunction(this, "HostCheck", {
      name: HOST_CHECK_FUNCTION,
      autoPublish: true,
      functionConfig: { comment: `Refuses any Host but ${APP_DOMAIN}`, runtime: "cloudfront-js-2.0" },
      functionCode: HOST_CHECK_CODE,
    });
    const behavior = {
      targetOriginId: ORIGIN_ID,
      viewerProtocolPolicy: "redirect-to-https",
      responseHeadersPolicyId: ResponseHeadersPolicy.SECURITY_HEADERS.responseHeadersPolicyId,
      functionAssociations: [{ eventType: "viewer-request", functionArn: hostCheck.attrFunctionArn }],
    };
    return new CfnDistribution(this, "Distribution", {
      distributionConfig: {
        enabled: true,
        comment: `RTFM at ${APP_DOMAIN}`,
        aliases: [APP_DOMAIN],
        viewerCertificate: { acmCertificateArn: certificateArn, sslSupportMethod: "sni-only", minimumProtocolVersion: "TLSv1.2_2021" },
        httpVersion: "http2",
        ipv6Enabled: true,
        priceClass: "PriceClass_100",
        origins: [
          {
            id: ORIGIN_ID,
            domainName: endpointDomain,
            originAccessControlId: originAccessControl.attrId,
            connectionAttempts: 1,
            customOriginConfig: {
              originProtocolPolicy: "https-only",
              originSslProtocols: ["TLSv1.2"],
              originReadTimeout: ORIGIN_READ_TIMEOUT_SECONDS,
            },
          },
        ],
        defaultCacheBehavior: {
          ...behavior,
          allowedMethods: READ_METHODS,
          cachePolicyId: CachePolicy.CACHING_DISABLED.cachePolicyId,
        },
        cacheBehaviors: [
          {
            ...behavior,
            pathPattern: "/api/*",
            allowedMethods: ALL_METHODS,
            cachePolicyId: CachePolicy.CACHING_DISABLED.cachePolicyId,
            originRequestPolicyId: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER.originRequestPolicyId,
          },
          {
            ...behavior,
            pathPattern: "/assets/*",
            allowedMethods: READ_METHODS,
            cachePolicyId: CachePolicy.CACHING_OPTIMIZED.cachePolicyId,
            compress: true,
          },
        ],
      },
    });
  }

  /** CloudFront signs as its service principal; `aws:SourceArn` keeps every other distribution out. */
  private letOnlyThisDistributionInvoke(distribution: CfnDistribution): void {
    const webFunction = webFunctionArn(EDGE_WEB_FUNCTION);
    const resourcePolicy = new CfnResourcePolicy(this, "WebFunctionResourcePolicy", {
      resourceArn: webFunction,
      policyDocument: {
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "OnlyRtfmEdgeDistribution",
            Effect: "Allow",
            Principal: { Service: "cloudfront.amazonaws.com" },
            Action: "lambda:InvokeWebFunctionEndpoint",
            Resource: `${webFunction}/endpoint/*`,
            Condition: {
              StringEquals: { "aws:SourceArn": `arn:aws:cloudfront::${ACCOUNT}:distribution/${distribution.attrId}` },
            },
          },
        ],
      },
    });
    for (const id of ["CloudFormation-Validate::F3017", "CloudFormation-Validate::F3031"]) {
      Validations.of(resourcePolicy).acknowledge({
        id,
        reason: "The CDK's bundled schema predates Web Functions; the live schema accepts web-function/ ARNs",
      });
    }
  }
}
