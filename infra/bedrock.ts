import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { ACCOUNT } from "./rtfm.ts";

/** Any region: a `global.` profile's foundation-model ARN has none. */
export const CLAUDE_MODELS = [
  `arn:aws:bedrock:*:${ACCOUNT}:inference-profile/*anthropic.claude-*`,
  "arn:aws:bedrock:*::foundation-model/anthropic.claude-*",
];
export const MANTLE_PROJECT = `arn:aws:bedrock-mantle:*:${ACCOUNT}:project/default`;

export function claudeStatements(): PolicyStatement[] {
  return [
    new PolicyStatement({
      sid: "Mantle",
      actions: ["bedrock-mantle:CreateInference", "bedrock-mantle:ListModels"],
      resources: [MANTLE_PROJECT],
    }),
    new PolicyStatement({
      sid: "InvokeClaude",
      actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
      resources: CLAUDE_MODELS,
    }),
  ];
}

/** A model's first call subscribes the account to it through AWS Marketplace. */
export function bedrockPolicyStatements(): PolicyStatement[] {
  return [
    ...claudeStatements(),
    new PolicyStatement({
      sid: "SubscribeToModels",
      actions: ["aws-marketplace:ViewSubscriptions", "aws-marketplace:Subscribe"],
      resources: ["*"],
    }),
  ];
}
