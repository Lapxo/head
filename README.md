# head

[![npm](https://img.shields.io/npm/v/@lapxo/head)](https://www.npmjs.com/package/@lapxo/head) [![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Turn API documents and MCP connections into your own MCP extension. Keep who answered, what was read, and what you allowed.

Head starts empty. You choose the sources; the recipient uses their own credentials. Sharing public descriptions does not transfer your permissions, signing keys, tokens or API responses.

```text
API documents + MCP endpoints → Head → your custom .mcpb
                                      → recipient approves and signs in
```

1. Connect the sources you want and approve each connection.
2. Ask questions or use permitted operations, with receipts.
3. Ask Head to package the connected place using `do` with `action: "share"`. Give the recipient the resulting `.mcpb`.

[Export a connected place](#export-a-connected-place) · [Try a local example](docs/first-minute.md) · [Understand the boundaries](SECURITY.md)

head is an MCP server. Give it an API document, approve the connection, and ask a question. It reads operations the document declares, returns typed fields when a schema is available, and keeps signed receipts of its reads. Without a usable schema, the answer is named as untyped.

```text
You: Connect this API as forecast.
     [give its OpenAPI document; approve the connection]
You: What is the forecast in Lima?

forecast: temperature 21, sky clear
receipt: sha256:…
```

This is an illustrative fixture, not a live forecast. [Run the local example](docs/first-minute.md) without an account or a real secret.

## Start

For an assistant that starts MCP servers by command:

```sh
npx -y @lapxo/head@0.2.3 run
```

The pin above names this release; the executable examples in this tree use the checkout. A client can also open a desktop extension from [releases](https://github.com/Lapxo/head/releases); check the artifact digests supplied with the release. Starting head alone prints help; `head run` starts the MCP server.

The desktop target is macOS 13.5 or later. Head does not bundle Node. The extension uses the client runtime; when that runtime is Electron, Head relaunches once using an installed Node 22.18 or later so its signer and child processes work. Without a compatible installed Node, its three tools explain what is missing with `head/runtime-node-required`; no place, keychain or connection is opened. The command-line installation also requires Node 22.18 or later. Linux and Windows remain open as P1 and P2 in the [compatibility record](docs/compatibility.md), alongside independent real-client and Intel execution acceptance. Unattended cloud execution is unsupported. A successful mock or CI job does not establish working system-keychain and browser integration.

## What you do

- **Connect** a document, optionally with an overlay. head pins the compiled description by digest. With no place yet, the first approved connection creates `~/place`.
- **Ask** for one operation or compare the same question across sources. Receipts keep the source and time. A missing answer stays owed; an empty answer is not a missing answer.
- **Act** within the place's permissions and consent rules. A suggested next step is not authorization. Writes do not become allowed because a model asked for them.
- **Share and inspect** public material. A reference identifies content; a separate holder location says where to obtain it. Inspection checks the selected contract and grants nothing. [Try sharing and verification](docs/sharing.md).

Your place keeps its declarations as text. `birth.bound` separates your local declarations from head's profile. Keep it private unless you have reviewed what you are sharing: it is not the portable public `birth.topos` artifact.

## Two names are not two independent sources

If `mirror` shares `forecast`'s declared lineage, agreement is shown as `●○`. Both sources and their receipts remain visible. `●●` does not prove independence; it only reports what the declared lineage and source identity establish. Disagreement keeps each source's value instead of choosing a winner.

[Run the lineage example](docs/lineage.md), including withdrawal of the lineage declaration without erasing earlier receipts.

## Boundaries you can check

Signing keys stay behind a short-lived signer port in the supported flow. Tokens go to the declared transport, not into model arguments. A compromised process running as your user is outside that code boundary: it can invoke the keychain itself.

A digest is not network permission or proof that an answer is true. Received bytes install no authority. Configuration preflight does not replace API permission, access or secret-consent checks. See the [threat model and reporting policy](SECURITY.md), and [connect an API](docs/connect-any-api.md) for access options.

The three public MCP tools are `ask`, `connect` and `do`. Examples reuse the existing client and fixtures; they add no provider-specific behavior to head.

### Export a connected place

Head's base extension contains no connected sources. Sharing a place never silently creates an empty extension. Provide explicit public package identity, revision, title, description and author; Head selects all currently connected sources and their declared operations when `sources` is omitted:

```json
{"action":"share","place":"/your/place","to":"/your/shared/team.mcpb","args":{"id":"team","revision":"1.0.0","title":"Team sources","description":"Selected public documents","author":{"name":"Your public name"}}}
```

An explicit `sources` selection narrows that snapshot. Source and operation budgets still apply; nothing is silently truncated. Missing public package metadata produces `bundle/metadata-required`. The metadata grants no authority. The recipient accepts the named package, chooses an origin where needed, and supplies their own credentials. Export only documents and overlays you intend to make public.

Repeat exports preserve member paths and content under identical inputs. The standard MCPB packager includes ZIP timestamps; identical container bytes across different times are not promised. Each release approval identifies one exact archive.

Access credentials are bound to the authenticated place, origin and declared access context. Receipt rejection returns no usable attachment. An interrupted or unrecorded attempt is not automatically retried: inspect it first, then explicitly request `access` with `args: {"retry":true}` if appropriate. Existing signing keys are never migrated. A compatible legacy home namespace requires explicit local approval after its public keys match the authenticated home.
