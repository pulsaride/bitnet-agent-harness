# Security Policy

## Experimental status

BitNet Agent Harness is early-stage experimental software. It is not a sandbox and must not be treated as production-ready security infrastructure. Model outputs, repository content, skill instructions, and tool responses are untrusted inputs.

## Supported versions

Only the current default branch and the latest release, once releases exist, receive security fixes. Historical experiments and generated artifacts are not supported deployments.

## Reporting a vulnerability

Do not publish exploit code, credentials, private repository data, or detailed reproduction steps in a public issue before maintainers can assess the report.

1. Use GitHub's private vulnerability reporting for [pulsaride/bitnet-agent-harness](https://github.com/pulsaride/bitnet-agent-harness/security/advisories/new).
2. Include the affected version or commit, impact, prerequisites, and a minimal reproduction when safe to share.
3. If private vulnerability reporting is unavailable, open a public issue with only a high-level description and request a private contact channel; do not include exploit details.

For reports affecting a third-party dependency, model, or Microsoft BitNet, report to that project's security channel as well.

## Response expectations

Maintainers will acknowledge reports as soon as practical, assess impact and scope, and coordinate a fix and disclosure. No response-time guarantee is promised for this experimental project.

## Security-sensitive changes

Changes involving policy enforcement, workspace access, path resolution, process execution, model endpoints, credentials, extensions, or model-generated edits require focused negative tests and reviewer attention. Secrets must be supplied through protected environment or secret-management mechanisms, never committed to the repository.
