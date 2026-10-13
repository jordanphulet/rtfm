import { RemovalPolicy, Stack } from "aws-cdk-lib";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { Bucket } from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";
import { ACCOUNT, REGION } from "./rtfm.ts";

export const APP_STACK = "RtfmApp";
export const APP_LOG_GROUP = "/rtfm/app";
/** Bucket names are global, so the account and region keep it RTFM's own. */
export const APP_BUCKET = `rtfm-app-${ACCOUNT}-${REGION}`;

/**
 * RTFM's app, deployed through the bootstrap with `npm run cdk -- deploy`. Every resource is named
 * explicitly for RTFM, since the boundary refuses a name CloudFormation makes up.
 */
export class RtfmAppStack extends Stack {
  constructor(scope: Construct) {
    super(scope, APP_STACK, {
      env: { account: ACCOUNT, region: REGION },
      description: "RTFM's app: deployed with npm run cdk -- deploy",
    });
    new LogGroup(this, "AppLogs", {
      logGroupName: APP_LOG_GROUP,
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    // Unset `blockPublicAccess` keeps S3's default, which blocks public access; setting it, even to
    // BLOCK_ALL, calls PutBucketPublicAccessBlock, which the boundary refuses.
    new Bucket(this, "AppBucket", {
      bucketName: APP_BUCKET,
      removalPolicy: RemovalPolicy.RETAIN,
    });
  }
}
