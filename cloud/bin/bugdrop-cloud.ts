#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { BugDropCloudStack } from '../lib/bugdrop-cloud-stack.js';

const app = new cdk.App();
new BugDropCloudStack(app, 'BugDropCloud', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'eu-central-1'
  },
  description: 'BugDrop Cloud: private, consented production-debugging context.'
});
