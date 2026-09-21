# BugDrop Cloud

The initial Cloud pilot is an AWS CDK application for `eu-central-1`. It creates a private evidence bucket, encrypted DynamoDB tables, Cognito authentication, a REST API, a Lambda report API, API access logs, X-Ray tracing, and WAF managed/rate-limit rules.

## Deploy

```sh
cd cloud
npm install
cd functions && npm install && cd ..
npm run build
npm run synth
npm run deploy
```

## Client intake contract

The browser/mobile SDK first asks for a short-lived upload URL:

```http
POST /v1/intake/sessions
content-type: application/json

{ "projectKey": "bdp_pk_…" }
```

The public project key is not a credential. A project record must be activated server-side before this endpoint issues a five-minute, single-object S3 upload URL. The Intake route is WAF rate-limited. Evidence never becomes public.

## Before inviting a pilot team

1. Create the team member in Cognito and set their immutable `custom:workspace_id` attribute.
2. Add the project's public key, `workspaceId`, `projectId`, status, and allowed origins to the Projects table.
3. Build the dashboard and project-admin API; it must only permit actions inside the caller's workspace.
4. Add the evidence processor before enabling real users. It must validate the uploaded report schema and size, redact content again on the server, write report metadata, and remove invalid or expired uploads.

The currently deployed intake endpoint rejects requests without a correctly-shaped project key. Do not treat it as a finished public ingestion pipeline until the processor and origin allowlist are complete.
