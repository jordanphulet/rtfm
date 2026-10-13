# Running RTFM on Lambda and DynamoDB

Research only, written 2026-10-11 from the design of the local server in `ARCHITECTURE.md`. No AWS
calls were made.

**Status (2026-10-13):** adopted in part, by `research/aws-design.md`. Adopted: DynamoDB for the
manuals, sections and ledger, with the conditional saves, the counter items that make the caps
one atomic step across instances, and a lease per section for one writer across instances.
Not adopted: Lambda with `streamifyResponse` behind a function URL (the server runs unchanged on a
Lambda Web Function, with a function URL through the Lambda Web Adapter as the fallback); one
table per kind of item (two tables, `rtfm-app` and `rtfm-usage`); reserved concurrency as the cap
on calls; and the kill switch in SSM (an item in `rtfm-usage`).

## What the local server already gives

- **Plain handlers.** Route handlers import only `server/api/route.ts`, never `node:http` or the
  Node adapter, so another adapter could serve the same routes.
- **Two narrow storage interfaces.** `ManualStore` and `UsageLedger` (`server/storage/types.ts`)
  are all the server and the gateway see of storage.
- **One client file.** `server/gateway/bedrock-client.ts` is the only file that talks to Bedrock.
- **Jobs.** Planning a manual is already its own `Job` through the same gateway, and creating one
  is `createManual`, which never replaces a manual.

## Lambda

`server/lambda.ts` would wrap the same routes with `awslambda.streamifyResponse`, behind a Function
URL (`InvokeMode: RESPONSE_STREAM`). Lambda may not report a client disconnect, so a call may run
to `max_tokens`. That cost is bounded and recorded.

## DynamoDB

`server/storage/dynamo-*.ts` would implement the same two interfaces.

| Piece | DynamoDB version |
| --- | --- |
| Manual | Table `manuals`, key `manualId`: one item with the TOC and voice. `listManuals` is a `Scan` of the table. |
| Section body | Table `sections`, key `manualId` + `sectionId`. `saveBody` is a `TransactWriteItems`: a `Put` with `attribute_not_exists(body)`, plus a `ConditionCheck` that the manual item exists, so a deleted manual gets no sections. `writtenSectionIds` is a `Query` on the manual's sections with `attribute_exists(body)`, because a lease item may have no body. |
| Creating a manual | A `Put` with `attribute_not_exists(manualId)`, so a manual is never replaced. |
| Deleting a manual | Delete the manual item first, which plays the part of the local store's rename, then `Query` its sections and remove them with `BatchWriteItem`. This isn't atomic, so the order matters: once the manual item is gone, the manual is deleted and no section can be saved into it. |
| Seeding record | One config item holding a string set of seeded ids. `markSeeded` is an `UpdateItem` with `ADD`. |
| Ledger entries | Table `ledger`, key `month` + `reservedAt#callId`, so `entriesForMonth` is one `Query`. |
| Spending totals | Counter items `day#2026-10-11` and `month#2026-10`. Reserving is an `UpdateItem` that adds the worst case on the condition that the total stays under the cap: one atomic step across instances. |
| Kill switch | An SSM parameter or a config item, read before each call. |

The local gateway keeps its totals in one process's memory, so it allows only one server per data
folder. The counter items move the cap check into the database, so any number of instances share
one set of caps.

## Across instances

- **One writer per section:** a lease on the section item (`writer`, `leaseExpiresAt`, taken with
  a conditional update). Joiners on other instances poll partial text that the writer saves about
  once a second. `runs.isWriting` then has to read the manual's section leases, because another
  instance may hold one.
- **Concurrency:** Lambda reserved concurrency caps calls across all instances.

## Everything else

- **Credentials:** an IAM role replaces `.env.local`. Only `bedrock-client.ts` changes.
- **A passphrase**, if the app had one, would have to travel as a cookie or a query parameter,
  because `EventSource` can't send headers.
- **Bedrock Mantle:** moving to the Mantle endpoint (`AnthropicBedrockMantle`) changes only
  `bedrock-client.ts` and the price table.
