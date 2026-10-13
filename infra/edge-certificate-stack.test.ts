import type { Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import type { CloudFormationStackArtifact } from "aws-cdk-lib/cx-api";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { APP_DOMAIN, EDGE_CERTIFICATE_STACK } from "./edge-certificate-stack.ts";
import {
  ACCESS_STACK,
  ACCOUNT,
  AGENT_USER,
  BOOTSTRAP_ROLES,
  DEPLOY_ROLE,
  LOCAL_USER,
  PROJECT_TAG,
  READ_ROLE,
  TOOLKIT_STACK,
} from "./rtfm.ts";
import { reachOf, resourcesOf } from "./testing.ts";

const app = createApp();
const template = Template.fromStack(app.node.findChild(EDGE_CERTIFICATE_STACK) as Stack);
const toolkitResources = resourcesOf(app.node.findChild(TOOLKIT_STACK) as Stack);
const accessResources = resourcesOf(app.node.findChild(ACCESS_STACK) as Stack);

/** Every identity RTFM makes: the bootstrap's roles, and `RtfmAccess`'s users and roles. */
const identities = [
  ...Object.values(BOOTSTRAP_ROLES).map((name) => ({ name, can: reachOf(toolkitResources, "AWS::IAM::Role", name) })),
  ...[READ_ROLE, DEPLOY_ROLE].map((name) => ({ name, can: reachOf(accessResources, "AWS::IAM::Role", name) })),
  ...[LOCAL_USER, AGENT_USER].map((name) => ({ name, can: reachOf(accessResources, "AWS::IAM::User", name) })),
];
const STACK_CHANGES = [
  "cloudformation:CreateStack",
  "cloudformation:UpdateStack",
  "cloudformation:DeleteStack",
  "cloudformation:CreateChangeSet",
  "cloudformation:ExecuteChangeSet",
  "cloudformation:SetStackPolicy",
  "cloudformation:UpdateTerminationProtection",
];

describe("the RtfmEdgeCertificate stack", () => {
  it("is in us-east-1, where CloudFront takes its certificates from", () => {
    const artifact = app.synth().getStackByName(EDGE_CERTIFICATE_STACK) as CloudFormationStackArtifact;
    expect(artifact.environment.region).toBe("us-east-1");
  });

  it("asks ACM for the app's domain, validated by a record CloudFormation writes into the zone given", () => {
    template.hasParameter("HostedZoneId", { Type: "AWS::Route53::HostedZone::Id" });
    template.resourceCountIs("AWS::CertificateManager::Certificate", 1);
    template.hasResourceProperties("AWS::CertificateManager::Certificate", {
      DomainName: APP_DOMAIN,
      ValidationMethod: "DNS",
      DomainValidationOptions: [{ DomainName: APP_DOMAIN, HostedZoneId: { Ref: "HostedZoneId" } }],
      Tags: [{ Key: PROJECT_TAG.key, Value: PROJECT_TAG.value }],
    });
  });

  it("can't be changed by anything of RTFM's, nor can any other stack in us-east-1", () => {
    for (const stack of [EDGE_CERTIFICATE_STACK, "RtfmApp", "RtfmProbe"]) {
      const stackArn = `arn:aws:cloudformation:us-east-1:${ACCOUNT}:stack/${stack}/0a1b2c`;
      for (const { name, can } of identities) {
        for (const action of STACK_CHANGES) expect(can(action, stackArn), `${name} ${action} ${stack}`).toBe(false);
      }
    }
    const certificateStack = `arn:aws:cloudformation:us-east-1:${ACCOUNT}:stack/${EDGE_CERTIFICATE_STACK}/0a1b2c`;
    const canRead = reachOf(accessResources, "AWS::IAM::Role", READ_ROLE);
    expect(canRead("cloudformation:DescribeStacks", certificateStack)).toBe(true);
    const canDeploy = reachOf(toolkitResources, "AWS::IAM::Role", BOOTSTRAP_ROLES.deploy);
    expect(canDeploy("cloudformation:CreateChangeSet", `arn:aws:cloudformation:us-west-2:${ACCOUNT}:stack/RtfmApp/0a1b2c`)).toBe(true);
  });

  it("gives the certificate's ARN as its output, for RtfmEdge", () => {
    const [certificate] = Object.keys(template.findResources("AWS::CertificateManager::Certificate"));
    template.hasOutput("CertificateArn", { Value: { Ref: certificate } });
  });
});
