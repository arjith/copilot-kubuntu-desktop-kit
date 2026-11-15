# Security and privacy

Desktop automation can observe and change real applications. This kit is not a
sandbox and cannot guarantee redaction of screenshots or accessibility text.
Local stdio transport does not mean model context stays on the local machine.

Keep host tool approvals enabled. The user must approve portal access and
complete authentication, uploads and consequential actions directly.
Do not run competing desktop controllers.

For private-data exposure, unintended actions or an unsafe installer behavior,
use the repository's private vulnerability reporting when available.
Do not publish secrets, private screenshots or raw logs. For a defect in the
desktop backend itself, follow
[its security policy](https://github.com/agent-sh/computer-use-linux/blob/main/SECURITY.md).

Only the current reviewed kit release is maintained. A pinned dependency is
not permanently secure; updates require renewed review and verification.
