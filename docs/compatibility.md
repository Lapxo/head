# Compatibility

The desktop target for 0.2.3 is macOS 13.5 or later, the minimum encoded in both architecture slices of the selected Node executable. The self-contained extension is intended to carry its own verified Node runtime; a release is supported only after its exact artifact passes installed-consumer acceptance. A mock store or a successful CI job does not establish real system-keychain and browser integration.

The command-line package and the desktop extension use the same algebra, signing protocol, permission checks and source ports. A client name does not select a security policy. A runtime version alone does not establish that the client permits child processes.

## Open platform work

| Issue | Platform | Required before support |
| --- | --- | --- |
| P1 | Linux | A signing-store adapter that distinguishes missing from failed lookup and guarantees create-if-absent; real Secret Service, browser and installed-runtime acceptance |
| P2 | Windows | A signing-store adapter with those same guarantees; real Credential Manager, browser and installed-runtime acceptance |

The existing adapters can still be checked as command interfaces. Their presence does not advertise support, and credential update is never a substitute for exclusive signing-key creation. An unsupported environment refuses before key lookup or founding a place.

Apple Silicon and Intel execution of the universal runtime require separate evidence. A runtime's original signature and both architecture slices can be checked without proving its integration on a second physical machine. Independent physical-machine and real-client acceptance remain separate from those checks.
