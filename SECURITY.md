# Security policy

## Supported versions

Only the latest release receives fixes. Upgrade before reporting an issue.

| Version | Supported |
|---|---|
| Latest 3.x release | Yes |
| Anything earlier | No |

## Reporting a vulnerability

Report vulnerabilities privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Do not open a public issue, pull request or discussion.

Include:

- The affected version, agent, skill or hook
- What an attacker could do, and the steps to reproduce it
- Any prompt, file or project content needed to trigger it

You will get an acknowledgement within 5 business days and an assessment within 10 business days. Fixes are released as a new version, and the release notes credit the reporter unless they ask otherwise.

## Scope

In scope:

- Agent or skill instructions that lead the team to write insecure code, leak secrets, or act without the approvals the lifecycle requires
- Hooks that can be bypassed, or that block or alter work they should not touch
- Scripts in this repository

Out of scope:

- Vulnerabilities in Claude Code itself; report those to Anthropic
- Vulnerabilities in applications built with the plugin; report those to the application's owner
