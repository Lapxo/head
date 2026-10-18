# Connect any API

head reads an API by the document its provider already publishes, at the address you give it. head names no provider and connects none of its own: what is connected is what you hand it. Here is one way for each level of access, with an API of each kind.

### No access: a document that says nothing about it

Take an API whose document lists its operations and states nothing about access. head does not guess what that means: it tries a read once with nothing attached, and keeps what it saw (`access/<source>/<operation>/observed anonymous`) as a receipt its own key signs. Nothing but a read is ever tried this way.

Connect the document by its address, `https://<provider>/openapi.yaml`, by the site that publishes it, or by a folder holding it, as `forecast`, then read one of its operations. With no place yet, one yes founds your place in `~/place`, connects the document there and lets head read `forecast` for the next 90 days. A document that names several servers asks once which one. The answer comes back typed by what the document declares, one value a line, with a signed receipt of the read (abridged):

```text
answer/<request>/current/temperature   number  …
answer/<request>/current_units/temperature   text    …
read/forecast/<operation>/<request>    digest  sha256:… signed by head
```

An overlay can still say what the provider says on its own site, so the place states it rather than observes it:

```yaml
overlay: 1.0.0
info: { title: the forecast, read without a key, version: '1' }
actions:
  - target: "$.paths['/forecast'].get"
    description: the provider says this read needs no key
    update: { security: [] }
```

Whatever API you connect, its terms are the provider's: read them before you connect it, and say where an answer came from when they ask you to.

### A declared flow: OAuth 2.0

Take an API whose document declares OAuth 2.0 with an authorization code. head compiles it into the two steps it takes, the provider's page with PKCE and then the token exchange, and nobody writes a line of it. What it needs is yours: the client id of an app you registered with the provider, signed into the place as `keys/access/<source>/<flow> client <id>`. Until then head says so and calls nothing.

### A secret entered by hand

When a document declares a bearer token or an API key and no way to obtain one, the key is a secret input. head asks for it on its own one-time page, never through the model, and only when the place's root allows a secret with `access/secret-inputs`. It is kept in the keychain, never in a file.

### When the document says too little

A login of its own (an email, a one-time code, a choice of account) is written once as an `x-access` flow, an Arazzo profile in an overlay, and every API of the same issuer refers to it with one `$ref`. The profile and its vectors are on topos-openapi's own page, `docs/x-access.md` in `@lapxo/topos-openapi`. Every API connected this way is read the same way afterwards: one access per issuer, each answer typed and kept.
