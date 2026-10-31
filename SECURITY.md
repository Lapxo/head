# Security

Report vulnerabilities privately to hello@lapxo.com. Do not open public issues for security reports.

Reports are reviewed on a best-effort basis. We do not guarantee a response or remediation deadline. There is no bug bounty or reward. With your consent, we may credit a report in a published fix.

## What is trusted

The owner chooses the place, its admitted keys and permissions, the installed instrument, the source descriptions and the transport policy. The operating system, keychain and code running with the user's privileges are part of the trusted computing base. The model, remote source content, received packages and suggested actions are not authority. The MCP client is trusted to display consent requests and report the person's response accurately; a compromised or auto-approving client can misrepresent that response, and head cannot prove a person clicked yes.

A source document describes an operation. Its accuracy and the source's data remain the provider's responsibility. A misclassified read can have server-side effects; head does not prove the provider's implementation. A signature proves the statement checked under its admitted key and context; it does not prove that an API answer is true.

## Signing and access secrets

Signing keys are handled by the short-lived signer. Its supported interface returns public keys or signatures, and the long process refuses a signing key requested by name. API credentials are different: the access and transport adapters must handle them to authenticate the request to the declared provider. Supported paths keep them out of model arguments, normal answers, command arguments and ordinary receipts.

This is a code boundary, not OS isolation. The signer and head run as the same user. A compromised same-user process can invoke the keychain, replace code or read data that user can access. This release does not claim protection from it, nor guaranteed secret removal from arbitrary malicious source bodies, crash dumps or external programs. Do not put secrets in API descriptions or model messages.

## Network and doors

A digest is not network permission. Retrieval still requires the receiver's origin and transport policy. The declared host checks destinations and redirect policy; a matching hash does not authorize a private-network request, a downgrade or forwarding credentials to another origin.

The network doors bind to loopback and validate their Host and Origin boundaries. Loopback alone is not authentication. A client can suggest an action, but the place's permissions and consent rules still apply. Cancellation and request scratch cleanup have their existing bounds; they do not make an arbitrary process safe to run.

## Configuration is not general execution authority

The native authority preflight checks exact configuration records and their admission context. It authenticates the selected place, instrument, key, records, epoch and explicit clock. A card is an observation of that context, not permission to sign or land a changed future action. The actual act independently checks current authority.

API execution, aggregates, access negotiation, secret consent and personal-attestation admission are not all covered by that preflight. Their existing domain checks remain. An old card can become stale after any Root epoch change even when a particular key's eligibility remains unchanged. A local coverage declaration is not revocation of the original Root anchor.

## Sharing and lineage

A content reference, source package and portable public birth declaration are different objects. Inspection does not connect a source, import grants or install an owner. A holder address is not authenticated sender identity. Hash equality establishes the named bytes only under the selected contract.

Source descriptions can themselves contain sensitive information. Review them before sharing. The selected portable birth profile excludes authority material; it does not make every file in a place public. Keep the local birth journal, credentials, keychain, admission history and derived stores out of a shared package.

Lineage marks report declared relationships and recognized source identity. They do not establish statistical independence, a confidence score or a count of independent causes. Withdrawing a declaration changes the current view; it does not erase earlier receipts.

## Supported environment and useful reports

macOS desktop is the supported environment. Linux and Windows remain open as P1 and P2 in the [compatibility record](docs/compatibility.md). Other platform adapters and tests are not evidence of a real secret service, browser flow or unattended deployment. Multiple local processes do not establish distributed coordination over a shared object store.

Useful reports include a reproducible action that obtains a key without coverage, lands without an admitted signer, bypasses a door or network policy, changes a refusal through a supported door, or treats received bytes or a stale card as permission. Include the version, expected boundary and a minimal reproducer. Redact credentials and personal paths; never send a signing key.

The model's behavior, third-party API correctness and programs outside the supported boundaries are not security guarantees of head. A vulnerability in how head handles those inputs is still relevant. Related algebra, contract and instrument bugs can be reported through the same private channel.
