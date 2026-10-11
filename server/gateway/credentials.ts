import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { isErrorCode } from "../storage/files.ts";

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

const REQUIRED_NAMES = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"] as const;

export const ENV_LOCAL_FILE = new URL("../../.env.local", import.meta.url);

export class CredentialsMissing extends Error {
  constructor(file: URL, missingNames: readonly string[]) {
    super(`${file.pathname} must set ${missingNames.join(", ")}; the Bedrock writer can't start without them`);
  }
}

export function readAwsCredentials(file: URL = ENV_LOCAL_FILE): AwsCredentials {
  const values = parseEnv(readTextIfExists(file));
  const missingNames = REQUIRED_NAMES.filter((name) => !values[name]?.trim());
  if (missingNames.length > 0) throw new CredentialsMissing(file, missingNames);
  return {
    accessKeyId: values.AWS_ACCESS_KEY_ID!,
    secretAccessKey: values.AWS_SECRET_ACCESS_KEY!,
    region: values.AWS_REGION!,
  };
}

function readTextIfExists(file: URL): string {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    if (isErrorCode(error, "ENOENT")) return "";
    throw error;
  }
}
