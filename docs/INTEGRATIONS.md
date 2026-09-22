# Integration boundary

Patchmason Core remains local-first and does not authenticate to third-party services. The open-source client produces a reviewed, portable report. A separately operated Patchmason Cloud service can accept that report after explicit user confirmation and deliver it to Jira or another provider.

## Contract

`extension/integrations.js` contains pure, dependency-free formatters. `createHandoff('jira-cloud', report, options)` returns:

- `contractVersion`: the integration contract version.
- `provider`: the selected delivery provider.
- `report`: the allowlisted portable Patchmason report.
- `providerPayload`: the provider-specific request body.

The Jira formatter converts Patchmason sections into Atlassian Document Format (ADF). Captured strings remain ADF text nodes and are never interpreted as document structure. Screenshots remain in the portable report so a trusted backend can decode and upload only the images the reporter retained during review.

## Trust boundary

The browser extension must not collect Jira API tokens, ship an OAuth client secret, or silently upload a report. A production integration should:

1. Ask the reporter to review the capture and explicitly choose **Send to Jira**.
2. Authenticate the user through the hosted service.
3. Use one distributable Jira OAuth 2.0 (3LO) application.
4. Keep refresh tokens encrypted on the server and request the smallest practical scopes.
5. Load projects, issue types, priorities, and create-screen fields from Jira instead of trusting arbitrary client values.
6. Rebuild and validate the Jira payload on the server using the portable report.
7. Upload reviewed screenshots as multipart attachments only after the issue is created.
8. Return the issue key and URL, then delete transient report data according to the workspace retention policy.

Entitlements and paid-plan limits belong on the server. Client-side buttons and feature flags are presentation only and are not an authorization boundary.

## Initial Jira delivery API

The future hosted endpoint should accept the integration contract plus a server-issued workspace session. It should reject unknown contract or report schema versions, oversized images, unsupported media types, and fields not present in Jira create metadata. The response should contain the created issue key and canonical URL, but no OAuth credentials.

Keep the hosted implementation in a separate private repository so the MIT-licensed capture client and the commercial service have an unambiguous boundary.
