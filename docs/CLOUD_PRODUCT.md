# BugDrop Cloud product boundary

BugDrop Core is a free, local-first, MIT-licensed capture client. BugDrop Cloud is a separately operated, opt-in service for teams that want to receive reviewed reports and a deliberately limited amount of production debugging context.

## What is sold

Cloud Pro is priced per project and provides a shared report inbox, searchable debug context packs, issue-tracker handoff, configurable redaction, and retention controls. Business adds organization governance such as roles, audit history, SSO, data-processing terms, and data-residency options.

The commercial value is faster triage and resolution. Reporting a bug with Core must remain free.

## Non-negotiable data boundary

Cloud must never provide a developer with unrestricted access to an end user's account or raw application data. Context is useful only when it is bounded and reviewable.

Every uploaded context pack must be:

1. initiated by an explicit user action or a clearly disclosed, workspace-approved support flow;
2. scoped to an allowlist defined by the app team (for example app version, OS, feature flags, correlation ID, and selected log categories);
3. passed through client-side and server-side redaction before persistence;
4. visible to the reporter for review where the flow is user initiated;
5. covered by a workspace retention policy and deleted when that policy expires;
6. access-controlled, auditable, and isolated by workspace.

Credentials, authentication tokens, payment information, request bodies, cookies, unrestricted free text, and arbitrary database records are excluded by default. A correlation ID may let an authorized support system retrieve narrowly scoped data, but BugDrop itself should not become a general-purpose customer-data browser.

## First paid release

The first Cloud release should be intentionally narrow:

- A workspace signs in and obtains a server-issued upload session.
- The client uploads a reviewed, schema-validated report plus explicitly retained evidence.
- The service stores the report under the workspace retention policy and exposes a team inbox.
- A team member can assign, tag, search, and send a validated copy to an issue tracker.
- The report can include a safe context pack from an SDK: app release, platform, device class, correlation ID, opt-in breadcrumbs, and redacted diagnostic logs.

Do not make session replay, arbitrary user profile lookup, automated background uploading, AI root-cause claims, or broad integrations prerequisites for the initial paid release.

## Entitlement model

Entitlements are enforced by the service, never by a client-side feature flag. Meter the things that create operating cost and value: retained reports, retained media/log storage, project workspaces, integrations, and governance features. Do not meter the number of individual end users who submit a report.

See [INTEGRATIONS.md](INTEGRATIONS.md) for the existing client-to-hosted-service trust boundary.
