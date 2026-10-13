import type { Stack } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { APP_BUCKET, APP_LOG_GROUP, APP_STACK } from "./app-stack.ts";
import { createApp } from "./app.ts";
import { BOOTSTRAP_ROLES, PROJECT_TAG, TOOLKIT_STACK, logGroupArn } from "./rtfm.ts";
import { reachOf, resourcesOf } from "./testing.ts";

const app = createApp();
const appStack = app.node.findChild(APP_STACK) as Stack;
const template = Template.fromStack(appStack);
const resources = resourcesOf(appStack);
const canExecute = reachOf(
  resourcesOf(app.node.findChild(TOOLKIT_STACK) as Stack),
  "AWS::IAM::Role",
  BOOTSTRAP_ROLES.execution,
);

describe("the RtfmApp stack", () => {
  it("names every resource for RTFM, so the execution role may create it", () => {
    const named = Object.values(resources).map(({ Properties }) => Properties.LogGroupName ?? Properties.BucketName);
    expect(named).toEqual([APP_LOG_GROUP, APP_BUCKET]);
    expect(canExecute("logs:CreateLogGroup", logGroupArn(APP_LOG_GROUP))).toBe(true);
    expect(canExecute("s3:CreateBucket", `arn:aws:s3:::${APP_BUCKET}`)).toBe(true);
  });

  it("leaves the bucket's Block Public Access to S3's default, which the boundary keeps", () => {
    template.hasResourceProperties("AWS::S3::Bucket", { PublicAccessBlockConfiguration: Match.absent() });
    expect(canExecute("s3:PutBucketPublicAccessBlock", `arn:aws:s3:::${APP_BUCKET}`)).toBe(false);
  });

  it("keeps the bucket when it leaves the stack, since it may hold data", () => {
    template.hasResource("AWS::S3::Bucket", { DeletionPolicy: "Retain", UpdateReplacePolicy: "Retain" });
  });

  it("tags every resource for the budget", () => {
    for (const { Properties } of Object.values(resources)) {
      expect(Properties.Tags).toEqual([{ Key: PROJECT_TAG.key, Value: PROJECT_TAG.value }]);
    }
  });
});
