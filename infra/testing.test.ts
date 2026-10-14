import { describe, expect, it } from "vitest";
import { type Statement, decide } from "./testing.ts";

describe("decide, the tests' policy evaluator", () => {
  it("lets an explicit deny win over an allow", () => {
    const statements: Statement[] = [
      { Effect: "Allow", Action: "s3:*", Resource: "arn:aws:s3:::rtfm-*/*" },
      { Effect: "Deny", NotAction: "s3:GetObject", Resource: "arn:aws:s3:::rtfm-site/*" },
    ];
    expect(decide(statements, "s3:GetObject", "arn:aws:s3:::rtfm-site/a")).toBe("allow");
    expect(decide(statements, "s3:PutObject", "arn:aws:s3:::rtfm-site/a")).toBe("deny");
    expect(decide(statements, "s3:PutObject", "arn:aws:s3:::work/a")).toBe("no allow");
  });

  it("matches String conditions exactly and Arn conditions with wildcards, as IAM does", () => {
    const statements: Statement[] = [
      { Effect: "Allow", Action: "*", Resource: "*", Condition: { StringEquals: { "aws:userid": "rtfm-*" } } },
      {
        Effect: "Allow",
        Action: "*",
        Resource: "*",
        Condition: { ArnEquals: { "aws:PrincipalArn": "arn:aws:iam::*:role/rtfm-*" } },
      },
    ];
    expect(decide(statements, "s3:GetObject", "x", { "aws:userid": "rtfm-agent" })).toBe("no allow");
    expect(decide(statements, "s3:GetObject", "x", { "aws:userid": "rtfm-*" })).toBe("allow");
    expect(decide(statements, "s3:GetObject", "x", { "aws:PrincipalArn": "arn:aws:iam::1:role/rtfm-read" })).toBe(
      "allow",
    );
  });

  it("reads wildcards in Like operators, and lets a negated operator hold when its key is missing", () => {
    const statements: Statement[] = [
      { Effect: "Allow", Action: "*", Resource: "*" },
      {
        Effect: "Deny",
        Action: "*",
        Resource: "*",
        Condition: { StringNotLike: { "lambda:Principal": "*.amazonaws.com" } },
      },
    ];
    expect(decide(statements, "lambda:AddPermission", "x", { "lambda:Principal": "s3.amazonaws.com" })).toBe("allow");
    expect(decide(statements, "lambda:AddPermission", "x", { "lambda:Principal": "*" })).toBe("deny");
    expect(decide(statements, "lambda:AddPermission", "x")).toBe("deny");
  });

  it("holds ForAllValues when every value matches, or none is given, unless Null requires one, as IAM does", () => {
    const forAllValues: Statement = {
      Effect: "Allow",
      Action: "dynamodb:GetItem",
      Resource: "*",
      Condition: { "ForAllValues:StringEquals": { "dynamodb:LeadingKeys": ["KILL_SWITCH"] } },
    };
    const leadingKeys = (keys: string[]) => ({ "dynamodb:LeadingKeys": keys });
    expect(decide([forAllValues], "dynamodb:GetItem", "x", leadingKeys(["KILL_SWITCH"]))).toBe("allow");
    expect(decide([forAllValues], "dynamodb:GetItem", "x", leadingKeys(["KILL_SWITCH", "TOTAL"]))).toBe("no allow");
    expect(decide([forAllValues], "dynamodb:GetItem", "x", leadingKeys([]))).toBe("allow");
    expect(decide([forAllValues], "dynamodb:GetItem", "x")).toBe("allow");

    const withNull: Statement = {
      ...forAllValues,
      Condition: { ...forAllValues.Condition, Null: { "dynamodb:LeadingKeys": "false" } },
    };
    expect(decide([withNull], "dynamodb:GetItem", "x", leadingKeys(["KILL_SWITCH"]))).toBe("allow");
    expect(decide([withNull], "dynamodb:GetItem", "x", leadingKeys([]))).toBe("no allow");
    expect(decide([withNull], "dynamodb:GetItem", "x")).toBe("no allow");
  });

  it("refuses a multivalued key under an operator without ForAllValues", () => {
    const statement: Statement = {
      Effect: "Allow",
      Action: "*",
      Resource: "*",
      Condition: { StringEquals: { "dynamodb:LeadingKeys": "KILL_SWITCH" } },
    };
    expect(() => decide([statement], "dynamodb:GetItem", "x", { "dynamodb:LeadingKeys": ["KILL_SWITCH"] })).toThrow(
      /ForAllValues/,
    );
  });

  it("refuses to guess at NotResource or an operator it doesn't know", () => {
    const notResource = { Effect: "Deny", Action: "*", NotResource: "arn:aws:s3:::rtfm-*" } as unknown as Statement;
    expect(() => decide([notResource], "s3:GetObject", "arn:aws:s3:::work/a")).toThrow(/NotResource/);
    const ipCondition: Statement = { Effect: "Allow", Action: "*", Resource: "*", Condition: { IpAddress: { x: "1" } } };
    expect(() => decide([ipCondition], "s3:GetObject", "x")).toThrow(/IpAddress/);
  });
});
