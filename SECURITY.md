# Security

Report vulnerabilities privately to hello@lapxo.com.
Do not open public issues for security reports.

We acknowledge reports within 7 days. There is no bug bounty
and no reward of any kind; we will credit you in the fix if you want.

In scope: Head, Bound, Topos, Obligations, and the published wire.
Out of scope: the model you connect, third-party APIs you connect
to, and anything running outside the loopback doors.

Head's signing keys are read only by its signer, a short process
started each time a key is made, checked or used: it hands back a
public half or signatures, never the key. The long process that
talks to the model and opens doors is refused a signing key by name.
The signer and Head run as the same user, so this boundary is in
Head's code, not in the operating system: a compromised process
can call the keychain itself.

A report is useful if it shows one of these:
- an agent obtaining or using a key it was not granted
- a line landing without an admitted key
- a refusal record that can be edited or removed through a door
- a door accepting a non-loopback bind, foreign Host, or any Origin
