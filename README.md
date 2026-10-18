# head

An API already says what it offers, where it is reached and how access to it is proven. head reads that document once, compiles it into lines its place pins by digest, and from then on answers by those lines: which operation reads, what it asks, what it answered. It names no kind of source and no client: what it reads is said by the worlds it adopts, and what it asks through is what the client declares. [Connect any API](docs/connect-any-api.md) shows each level of access.

A person does three things. **Found a place**: a folder whose lock is the place, its root key kept in the keychain; the first source connected with no place founds `~/place` on the same yes. **Connect a source**: hand head an API document, and an overlay beside it when it says too little; it is compiled once, pinned, and every offer is listed with its class. **Ask**: read an operation. head obtains access the first time, as the document declares it, calls only what reads, types the answer and lands a receipt.

Access comes at three levels, and the place says which. **None**: the document states that a read needs nothing, or says nothing about access at all; then head tries the read once with nothing attached, and keeps what it saw as a receipt. **A declared flow**: the document, or its overlay, declares how access is obtained, as an Arazzo profile: a form, a one-time code, a choice, a provider's page. head runs it once per issuer and keeps only the token, in the keychain. **A secret entered by hand**: a key or a password, only where the place's root allows it, entered on head's own one-time page and never through the model.

What head never does. It never guesses how access is proven: when a document does not state it, only a read is tried, with nothing attached, and nothing else is called. It never calls an operation that is not a read without the person's yes, nor past what the place allows; a place that would stand on another's lock as its parent is refused by name, since composing two places' policies is bound's. It never lets a secret reach the model, a file, an answer or an argument. And it never raises a ceiling to make room: what outgrows one is split by responsibility.

## Install

- **As an extension:** download `head-<version>-<digest>.mcpb` from the [latest release](https://github.com/Lapxo/head/releases/latest) and open it. Its digest is in the release notes.
- **By command:** `npx -y @lapxo/head@0.1.4`, for an assistant that starts its servers by command.

head runs on macOS for now. Its keys live in your keychain, never in a file.

## The first minute

head connects nothing when it is installed, and names no provider: what it reads is the API you hand it.

1. Ask your assistant something. With no place yet, head says so, and asks for the address of the document of an API that answers it.
2. Give that address and say yes once. head founds your place in `~/place`, connects the API from its document, pinned by the digest of what it read, and lets head read it for the next 90 days.
3. Your assistant asks again by itself, and the answer comes back typed, with the source it came from and a receipt signed by head's key.
