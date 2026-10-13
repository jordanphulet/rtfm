import type { Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { CachePolicy, OriginRequestPolicy, ResponseHeadersPolicy } from "aws-cdk-lib/aws-cloudfront";
import type { CloudFormationStackArtifact } from "aws-cdk-lib/cx-api";
import { describe, expect, it } from "vitest";
import { APP_STACK, WEB_FUNCTION } from "./app-stack.ts";
import { createApp } from "./app.ts";
import { APP_DOMAIN, EDGE_CERTIFICATE_STACK } from "./edge-certificate-stack.ts";
import {
  EDGE_STACK,
  EDGE_WEB_FUNCTION,
  HOST_CHECK_CODE,
  HOST_CHECK_FUNCTION,
  ORIGIN_ACCESS_CONTROL,
} from "./edge-stack.ts";
import { ACCOUNT, EDGE_STACKS, PROJECT_TAG, webFunctionArn } from "./rtfm.ts";
import { INLINE_TEMPLATE_BUDGET, resourcesOf } from "./testing.ts";

const app = createApp();
const assembly = app.synth();
const edgeStack = app.node.findChild(EDGE_STACK) as Stack;
const template = Template.fromStack(edgeStack);
const resources = resourcesOf(edgeStack);

const ofType = (type: string) => Object.values(resources).filter((resource) => resource.Type === type);
const logicalIdOf = (type: string) => Object.keys(resources).find((id) => resources[id].Type === type)!;
const [distributionConfig] = ofType("AWS::CloudFront::Distribution").map(
  ({ Properties }) => Properties.DistributionConfig as Record<string, unknown>,
);
const behaviors = [
  distributionConfig.DefaultCacheBehavior,
  ...(distributionConfig.CacheBehaviors as object[]),
] as Record<string, unknown>[];
const behaviorFor = (pathPattern: string) => behaviors.find((behavior) => behavior.PathPattern === pathPattern)!;

/** CloudFormation matches a parameter's `AllowedPattern` against the whole value. */
const allows = (parameter: string, value: string) =>
  new RegExp(`^(?:${template.toJSON().Parameters[parameter].AllowedPattern})$`).test(value);

/** CloudFront's own resources take no `project` tag in CloudFormation, nor do DNS records or Lambda's resource policies. */
const UNTAGGABLE = [
  "AWS::CloudFront::OriginAccessControl",
  "AWS::Route53::RecordSet",
  "AWS::Lambda::ResourcePolicy",
];

describe("every edge stack", () => {
  const edgeArtifacts = assembly.stacks.filter((stack) => stack.stackName.startsWith(EDGE_STACKS));

  it("is RtfmEdgeCertificate or RtfmEdge", () => {
    expect(edgeArtifacts.map((stack) => stack.stackName).sort()).toEqual([EDGE_STACK, EDGE_CERTIFICATE_STACK]);
  });

  it("is deployed with the user's own sign-in and an inline template, never through the bootstrap", () => {
    for (const artifact of edgeArtifacts as CloudFormationStackArtifact[]) {
      expect(artifact.assumeRoleArn, artifact.stackName).toBeUndefined();
      expect(artifact.cloudFormationExecutionRoleArn, artifact.stackName).toBeUndefined();
      expect(artifact.stackTemplateAssetObjectUrl, artifact.stackName).toBeUndefined();
      expect(JSON.stringify(artifact.template, null, 1).length, artifact.stackName).toBeLessThan(INLINE_TEMPLATE_BUDGET);
    }
  });

  it("carries no asset and no custom resource, which would go through the staging bucket rtfm-deploy writes", () => {
    for (const artifact of edgeArtifacts) {
      expect(artifact.assets, artifact.stackName).toEqual([]);
      expect(artifact.dependencies.map((dependency) => dependency.id), artifact.stackName).toEqual([]);
      const types = Object.values(artifact.template.Resources as Record<string, { Type: string }>).map(({ Type }) => Type);
      for (const type of types) {
        expect(type.startsWith("Custom::") || type === "AWS::CloudFormation::CustomResource", type).toBe(false);
        expect(type, artifact.stackName).not.toBe("AWS::Lambda::Function");
      }
    }
  });

  it("tags every resource CloudFormation can tag, for the budget", () => {
    for (const stackName of [EDGE_CERTIFICATE_STACK, EDGE_STACK]) {
      const taggable = Object.values(resourcesOf(app.node.findChild(stackName) as Stack)).filter(
        ({ Type }) => !UNTAGGABLE.includes(Type),
      );
      for (const { Type, Properties } of taggable) {
        expect(Properties.Tags, Type).toEqual([{ Key: PROJECT_TAG.key, Value: PROJECT_TAG.value }]);
      }
    }
  });
});

describe("the RtfmEdge stack", () => {
  it("takes the certificate's ARN, the zone's ID and the Web Function's domain", () => {
    template.hasParameter("HostedZoneId", { Type: "AWS::Route53::HostedZone::Id" });
    expect(allows("CertificateArn", `arn:aws:acm:us-east-1:${ACCOUNT}:certificate/0a1b2c3d-4e5f-6789-abcd-ef0123456789`)).toBe(true);
    expect(allows("CertificateArn", `arn:aws:acm:us-west-2:${ACCOUNT}:certificate/0a1b2c3d`)).toBe(false);
    expect(allows("EndpointDomain", "kgx5pn1ptcdvg5fz.z9t.lambda-web.us-west-2.on.aws")).toBe(true);
    expect(allows("EndpointDomain", "kgx5pn1ptcdvg5fz.lambda-web.global.on.aws")).toBe(false);
    expect(allows("EndpointDomain", APP_DOMAIN)).toBe(false);
  });

  it("names the Web Function RtfmApp holds", () => {
    expect(EDGE_WEB_FUNCTION).toBe(WEB_FUNCTION);
    expect(assembly.getStackByName(APP_STACK).template.Outputs).toHaveProperty("EndpointDomain");
  });

  it("gives the distribution's own domain as its output, for the smoke check", () => {
    template.hasOutput("DistributionDomain", {
      Value: { "Fn::GetAtt": [logicalIdOf("AWS::CloudFront::Distribution"), "DomainName"] },
    });
  });
});

describe("the distribution", () => {
  it("answers at the app's domain with its certificate, over HTTP/2, in price class 100", () => {
    expect(distributionConfig).toMatchObject({
      Enabled: true,
      Aliases: [APP_DOMAIN],
      ViewerCertificate: { AcmCertificateArn: { Ref: "CertificateArn" }, SslSupportMethod: "sni-only" },
      HttpVersion: "http2",
      PriceClass: "PriceClass_100",
    });
  });

  it("signs every request to the Web Function's endpoint, tries it once, and waits 60s between packets", () => {
    expect(distributionConfig.Origins).toEqual([
      {
        Id: "web-function",
        DomainName: { Ref: "EndpointDomain" },
        OriginAccessControlId: { "Fn::GetAtt": [logicalIdOf("AWS::CloudFront::OriginAccessControl"), "Id"] },
        ConnectionAttempts: 1,
        CustomOriginConfig: { OriginProtocolPolicy: "https-only", OriginSSLProtocols: ["TLSv1.2"], OriginReadTimeout: 60 },
      },
    ]);
    template.hasResourceProperties("AWS::CloudFront::OriginAccessControl", {
      OriginAccessControlConfig: {
        Name: ORIGIN_ACCESS_CONTROL,
        OriginAccessControlOriginType: "lambda",
        SigningBehavior: "always-amz-auth",
        SigningProtocol: "sigv4",
      },
    });
  });

  it("never caches the API, and passes it every method and every viewer header but Host", () => {
    expect(behaviorFor("/api/*")).toMatchObject({
      AllowedMethods: ["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "POST", "DELETE"],
      CachePolicyId: CachePolicy.CACHING_DISABLED.cachePolicyId,
      OriginRequestPolicyId: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER.originRequestPolicyId,
    });
  });

  it("caches the app's hashed files as the server says, and fetches every page again", () => {
    expect(behaviorFor("/assets/*")).toMatchObject({
      AllowedMethods: ["GET", "HEAD"],
      CachePolicyId: CachePolicy.CACHING_OPTIMIZED.cachePolicyId,
    });
    expect(distributionConfig.DefaultCacheBehavior).toMatchObject({
      AllowedMethods: ["GET", "HEAD"],
      CachePolicyId: CachePolicy.CACHING_DISABLED.cachePolicyId,
    });
    for (const behavior of behaviors) expect(behavior.ViewerProtocolPolicy).toBe("redirect-to-https");
  });

  it("adds AWS's managed security headers, HSTS among them, to every response", () => {
    const securityHeaders = ResponseHeadersPolicy.SECURITY_HEADERS.responseHeadersPolicyId;
    expect(securityHeaders).toBe("67f7725c-6f97-4210-82d7-5512b31e9d03");
    for (const behavior of behaviors) expect(behavior.ResponseHeadersPolicyId).toBe(securityHeaders);
  });

  it("checks the Host of every request, on every path", () => {
    const hostCheck = { "Fn::GetAtt": [logicalIdOf("AWS::CloudFront::Function"), "FunctionARN"] };
    for (const behavior of behaviors) {
      expect(behavior.FunctionAssociations).toEqual([{ EventType: "viewer-request", FunctionARN: hostCheck }]);
    }
    template.hasResourceProperties("AWS::CloudFront::Function", {
      Name: HOST_CHECK_FUNCTION,
      AutoPublish: true,
      FunctionCode: HOST_CHECK_CODE,
      FunctionConfig: { Runtime: "cloudfront-js-2.0" },
    });
  });
});

describe("the host check", () => {
  const handler = new Function(`${HOST_CHECK_CODE}; return handler;`)() as (event: object) => unknown;
  const requestWithHost = (host?: string) => ({ uri: "/", headers: host === undefined ? {} : { host: { value: host } } });
  const refused = { statusCode: 403, statusDescription: "Forbidden" };

  it("passes a request for the app's domain on to the origin", () => {
    for (const host of [APP_DOMAIN, APP_DOMAIN.toUpperCase()]) {
      const request = requestWithHost(host);
      expect(handler({ request }), host).toBe(request);
    }
  });

  it("refuses CloudFront's own domain for the distribution, and any other Host", () => {
    for (const host of ["d111111abcdef8.cloudfront.net", "kgx5pn1ptcdvg5fz.z9t.lambda-web.us-west-2.on.aws", `${APP_DOMAIN}.example.com`]) {
      expect(handler({ request: requestWithHost(host) }), host).toEqual(refused);
    }
    expect(handler({ request: requestWithHost() })).toEqual(refused);
  });
});

describe("the alias records", () => {
  it("point the app's domain at the distribution, over IPv4 and IPv6", () => {
    expect(distributionConfig.IPV6Enabled).toBe(true);
    const records = ofType("AWS::Route53::RecordSet").map(({ Properties }) => Properties);
    expect(records).toEqual(
      ["A", "AAAA"].map((Type) => ({
        HostedZoneId: { Ref: "HostedZoneId" },
        Name: APP_DOMAIN,
        Type,
        AliasTarget: {
          DNSName: { "Fn::GetAtt": [logicalIdOf("AWS::CloudFront::Distribution"), "DomainName"] },
          HostedZoneId: "Z2FDTNDATAQYW2",
        },
      })),
    );
  });
});

describe("the Web Function's resource policy", () => {
  it("lets only this distribution invoke the Web Function's endpoints", () => {
    template.resourceCountIs("AWS::Lambda::ResourcePolicy", 1);
    template.hasResourceProperties("AWS::Lambda::ResourcePolicy", {
      ResourceArn: webFunctionArn(WEB_FUNCTION),
      PolicyDocument: {
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "OnlyRtfmEdgeDistribution",
            Effect: "Allow",
            Principal: { Service: "cloudfront.amazonaws.com" },
            Action: "lambda:InvokeWebFunctionEndpoint",
            Resource: `${webFunctionArn(WEB_FUNCTION)}/endpoint/*`,
            Condition: {
              StringEquals: {
                "aws:SourceArn": {
                  "Fn::Join": [
                    "",
                    [`arn:aws:cloudfront::${ACCOUNT}:distribution/`, { "Fn::GetAtt": [logicalIdOf("AWS::CloudFront::Distribution"), "Id"] }],
                  ],
                },
              },
            },
          },
        ],
      },
    });
  });
});
