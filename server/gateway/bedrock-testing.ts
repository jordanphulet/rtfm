import type { ServerResponse } from "node:http";
import { EventStreamCodec } from "@smithy/eventstream-codec";

const codec = new EventStreamCodec(
  (bytes) => new TextDecoder().decode(bytes),
  (text) => new TextEncoder().encode(text),
);

function stringHeader(value: string) {
  return { type: "string" as const, value };
}

/** One of the model's events, framed as Bedrock streams it. */
export function chunkFrame(event: object): Uint8Array {
  const bytes = Buffer.from(JSON.stringify(event)).toString("base64");
  return codec.encode({
    headers: {
      ":event-type": stringHeader("chunk"),
      ":content-type": stringHeader("application/json"),
      ":message-type": stringHeader("event"),
    },
    body: new TextEncoder().encode(JSON.stringify({ bytes })),
  });
}

/** An error partway through a stream, framed as Bedrock sends it. */
export function exceptionFrame(exceptionType: string, message: string): Uint8Array {
  return codec.encode({
    headers: {
      ":exception-type": stringHeader(exceptionType),
      ":content-type": stringHeader("application/json"),
      ":message-type": stringHeader("exception"),
    },
    body: new TextEncoder().encode(JSON.stringify({ message })),
  });
}

/** Starts Bedrock's answer to a streamed call, with these events, and leaves it open. */
export function startEventStream(response: ServerResponse, events: object[]) {
  response.writeHead(200, { "content-type": "application/vnd.amazon.eventstream" });
  for (const event of events) response.write(chunkFrame(event));
}

/**
 * What Bedrock answers, with status 403 (its API reference's Common Errors), a request signed with
 * an expired session token, or with keys it doesn't know: the error's name in `x-amzn-errortype`.
 */
export const KEYS_REFUSED_ANSWERS = {
  ExpiredTokenException: "The security token included in the request has expired",
  UnrecognizedClientException: "The X.509 certificate or AWS access key ID you provided doesn't exist in our records.",
};

export function answerKeysRefused(response: ServerResponse, errorName: keyof typeof KEYS_REFUSED_ANSWERS) {
  const errorType = `${errorName}:http://internal.amazon.com/coral/com.amazon.coral.service/`;
  response.writeHead(403, { "content-type": "application/json", "x-amzn-errortype": errorType });
  response.end(JSON.stringify({ message: KEYS_REFUSED_ANSWERS[errorName] }));
}
