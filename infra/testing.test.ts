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

  it("matches StringLike case-sensitively, its * as any characters, # included, and its ? as one, as IAM does", () => {
    const like = (pattern: string): Statement => ({
      Effect: "Allow",
      Action: "dynamodb:Query",
      Resource: "*",
      Condition: { "ForAllValues:StringLike": { "dynamodb:LeadingKeys": [pattern] } },
    });
    const leadingKeys = (keys: string[]) => ({ "dynamodb:LeadingKeys": keys });
    const query = (pattern: string, keys: string[]) => decide([like(pattern)], "dynamodb:Query", "x", leadingKeys(keys));
    expect(query("L#*#LIBRARY", ["L#acme#LIBRARY"])).toBe("allow");
    expect(query("L#*#LIBRARY", ["L##LIBRARY"])).toBe("allow");
    expect(query("L#*#LIBRARY", ["L#acme#MANUAL#a-manual#LIBRARY"])).toBe("allow");
    expect(query("L#*#LIBRARY", ["l#acme#library"])).toBe("no allow");
    expect(query("L#*#LIBRARY", ["L#acme#LIBRARY#x"])).toBe("no allow");
    expect(query("L#*#LIBRARY", ["L#acme#SEEDED"])).toBe("no allow");
    expect(query("L#*#LIBRARY", ["LIBRARY"])).toBe("no allow");
    expect(query("L#*#LIBRARY", ["L#acme#LIBRARY", "LIBRARY"])).toBe("no allow");
    expect(query("L#?#LIBRARY", ["L#a#LIBRARY"])).toBe("allow");
    expect(query("L#?#LIBRARY", ["L#ab#LIBRARY"])).toBe("no allow");
  });

  it("holds ForAllValues:StringNotLike when no value matches, or none is given, as IAM does", () => {
    const notDeeper: Statement = {
      Effect: "Allow",
      Action: "dynamodb:Query",
      Resource: "*",
      Condition: { "ForAllValues:StringNotLike": { "dynamodb:LeadingKeys": ["L#*#*#*"] } },
    };
    const query = (keys: string[]) => decide([notDeeper], "dynamodb:Query", "x", { "dynamodb:LeadingKeys": keys });
    expect(query(["L#acme#LIBRARY"])).toBe("allow");
    expect(query(["L#acme#LIBRARY", "LINK"])).toBe("allow");
    expect(query(["L#acme#MANUAL#x"])).toBe("no allow");
    expect(query(["L#acme#LIBRARY", "L#acme#MANUAL#x#LIBRARY"])).toBe("no allow");
    expect(query([])).toBe("allow");
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

  it("holds ForAnyValue when at least one value matches, and never when none is given, as IAM does", () => {
    const statements: Statement[] = [
      { Effect: "Allow", Action: "dynamodb:PutItem", Resource: "*" },
      {
        Effect: "Deny",
        Action: "dynamodb:PutItem",
        Resource: "*",
        Condition: { "ForAnyValue:StringEquals": { "dynamodb:LeadingKeys": ["PASSCODE"] } },
      },
    ];
    const leadingKeys = (keys: string[]) => ({ "dynamodb:LeadingKeys": keys });
    expect(decide(statements, "dynamodb:PutItem", "x", leadingKeys(["PASSCODE"]))).toBe("deny");
    expect(decide(statements, "dynamodb:PutItem", "x", leadingKeys(["LIBRARY", "PASSCODE"]))).toBe("deny");
    expect(decide(statements, "dynamodb:PutItem", "x", leadingKeys(["LIBRARY"]))).toBe("allow");
    expect(decide(statements, "dynamodb:PutItem", "x", leadingKeys([]))).toBe("allow");
    expect(decide(statements, "dynamodb:PutItem", "x")).toBe("allow");
  });

  it("refuses a multivalued key under an operator without ForAllValues or ForAnyValue", () => {
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
