# Compatibility

The desktop target for 0.2.3 remains macOS 13.5 or later. Node is not included in the package. A normal Node client runs Head directly. Under Electron, Head relaunches once with an installed Node >=22.18, inherited stdio, a sanitized environment and forwarded termination signals. If none is available, `runtime/node-required` refuses before key lookup or founding. There is no download or automatic installation.

The command-line package and the desktop extension use the same algebra, signing protocol, permission checks and source ports. A client name does not select a security policy. A runtime version alone does not establish that the client permits child processes.

## Open platform work

| Issue | Platform | Required before support |
| --- | --- | --- |
| P1 | Linux | A signing-store adapter that distinguishes missing from failed lookup and guarantees create-if-absent; real Secret Service, browser and installed-runtime acceptance |
| P2 | Windows | A signing-store adapter with those same guarantees; real Credential Manager, browser and installed-runtime acceptance |

The existing adapters can still be checked as command interfaces. Their presence does not advertise support, and credential update is never a substitute for exclusive signing-key creation. An unsupported environment refuses before key lookup or founding a place.

Real-client, system-keychain and independent Intel execution acceptance remain pending. Neither a simulated Electron process nor CI establishes those integrations.
