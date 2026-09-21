import * as cdk from 'aws-cdk-lib';
import { Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as path from 'node:path';
import { Construct } from 'constructs';

export class BugDropCloudStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    const reports = new dynamodb.Table(this, 'Reports', {
      partitionKey: { name: 'workspaceId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'reportId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: RemovalPolicy.RETAIN
    });
    reports.addGlobalSecondaryIndex({
      indexName: 'byProjectAndCreatedAt',
      partitionKey: { name: 'projectId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL
    });
    reports.addGlobalSecondaryIndex({
      indexName: 'byRetentionExpiry',
      partitionKey: { name: 'retentionBucket', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'expiresAt', type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.KEYS_ONLY
    });

    const projects = new dynamodb.Table(this, 'Projects', {
      partitionKey: { name: 'projectKey', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: RemovalPolicy.RETAIN
    });

    const evidence = new s3.Bucket(this, 'Evidence', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
      cors: [{ allowedMethods: [s3.HttpMethods.PUT], allowedOrigins: ['*'], allowedHeaders: ['content-type'], maxAge: 300 }],
      lifecycleRules: [{ noncurrentVersionExpiration: Duration.days(30), abortIncompleteMultipartUploadAfter: Duration.days(1) }]
    });

    const users = new cognito.UserPool(this, 'Users', {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      standardAttributes: { email: { required: true, mutable: false } },
      customAttributes: { workspace_id: new cognito.StringAttribute({ mutable: false }) },
      passwordPolicy: { minLength: 14, requireDigits: true, requireLowercase: true, requireUppercase: true, requireSymbols: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.RETAIN
    });
    const dashboardBucket = new s3.Bucket(this, 'Dashboard', { blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, encryption: s3.BucketEncryption.S3_MANAGED, enforceSSL: true, removalPolicy: RemovalPolicy.RETAIN });
    const dashboardDomain = 'app.reproly.aimoxyz.xyz';
    const dashboardCertificate = acm.Certificate.fromCertificateArn(this, 'ReprolyDashboardCertificate', 'arn:aws:acm:us-east-1:112859066975:certificate/b466042b-6f21-4042-b5d3-0623c75fc279');
    const dashboard = new cloudfront.Distribution(this, 'DashboardDistribution', {
      domainNames: [dashboardDomain],
      certificate: dashboardCertificate,
      defaultBehavior: { origin: origins.S3BucketOrigin.withOriginAccessControl(dashboardBucket), viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS },
      defaultRootObject: 'index.html',
      errorResponses: [{ httpStatus: 403, responsePagePath: '/index.html', responseHttpStatus: 200 }]
    });
    const dashboardUrl = `https://${dashboardDomain}`;
    // Cognito permits exactly one managed hosted-UI domain per user pool. Keep this
    // legacy hostname until the user pool is deliberately migrated in a maintenance
    // window; the customer-facing dashboard itself is fully on app.reproly.
    const cognitoDomain = users.addDomain('DashboardDomain', { cognitoDomain: { domainPrefix: `bugdrop-${this.account}-${this.region}` } });
    const cognitoBaseUrl = cognitoDomain.baseUrl();
    const webClient = users.addClient('DashboardClient', {
      oAuth: { flows: { authorizationCodeGrant: true }, scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE], callbackUrls: [dashboardUrl], logoutUrls: [dashboardUrl] },
      preventUserExistenceErrors: true,
      generateSecret: false
    });

    const apiLogs = new logs.LogGroup(this, 'ApiLogs', { retention: logs.RetentionDays.ONE_MONTH, removalPolicy: RemovalPolicy.RETAIN });
    const api = new apigateway.RestApi(this, 'Api', {
      restApiName: 'Reproly Cloud API',
      deployOptions: { stageName: 'v1', loggingLevel: apigateway.MethodLoggingLevel.ERROR, dataTraceEnabled: false, tracingEnabled: true, accessLogDestination: new apigateway.LogGroupLogDestination(apiLogs), accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields() },
      cloudWatchRole: true,
      endpointConfiguration: { types: [apigateway.EndpointType.REGIONAL] }
    });
    new s3deploy.BucketDeployment(this, 'DeployDashboard', { sources: [s3deploy.Source.asset(path.join(__dirname, '../../dashboard')), s3deploy.Source.data('config.js', `window.REPROLY_CONFIG=${JSON.stringify({ dashboardUrl, apiUrl: api.url, clientId: webClient.userPoolClientId, cognitoDomain: cognitoBaseUrl })};`)], destinationBucket: dashboardBucket, distribution: dashboard, distributionPaths: ['/*'] });

    const apiFunctionLogs = new logs.LogGroup(this, 'ApiFunctionLogs', { retention: logs.RetentionDays.ONE_MONTH, removalPolicy: RemovalPolicy.RETAIN });
    const apiHandler = new lambda.Function(this, 'ApiHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'api.handler',
      code: lambda.Code.fromAsset('functions'),
      timeout: Duration.seconds(10),
      memorySize: 256,
      tracing: lambda.Tracing.ACTIVE,
      environment: { REPORTS_TABLE: reports.tableName, PROJECTS_TABLE: projects.tableName, EVIDENCE_BUCKET: evidence.bucketName },
      logGroup: apiFunctionLogs
    });
    reports.grantReadWriteData(apiHandler);
    projects.grantReadData(apiHandler);
    evidence.grantReadWrite(apiHandler);

    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'DashboardAuthorizer', { cognitoUserPools: [users] });
    const reportsResource = api.root.addResource('reports');
    reportsResource.addMethod('GET', new apigateway.LambdaIntegration(apiHandler), { authorizationType: apigateway.AuthorizationType.COGNITO, authorizer });
    reportsResource.addMethod('POST', new apigateway.LambdaIntegration(apiHandler), { authorizationType: apigateway.AuthorizationType.COGNITO, authorizer });
    addCorsOptions(reportsResource, 'GET,POST,OPTIONS');
    const reportResource = reportsResource.addResource('{reportId}');
    reportResource.addMethod('GET', new apigateway.LambdaIntegration(apiHandler), { authorizationType: apigateway.AuthorizationType.COGNITO, authorizer });
    addCorsOptions(reportResource, 'GET,OPTIONS');

    const intake = api.root.addResource('intake').addResource('sessions');
    intake.addMethod('POST', new apigateway.LambdaIntegration(apiHandler), { authorizationType: apigateway.AuthorizationType.NONE, apiKeyRequired: false });
    intake.addMethod('OPTIONS', new apigateway.MockIntegration({
      integrationResponses: [{ statusCode: '204', responseParameters: { 'method.response.header.Access-Control-Allow-Origin': "'*'", 'method.response.header.Access-Control-Allow-Methods': "'POST,OPTIONS'", 'method.response.header.Access-Control-Allow-Headers': "'content-type'" } }],
      requestTemplates: { 'application/json': '{"statusCode": 204}' }
    }), { methodResponses: [{ statusCode: '204', responseParameters: { 'method.response.header.Access-Control-Allow-Origin': true, 'method.response.header.Access-Control-Allow-Methods': true, 'method.response.header.Access-Control-Allow-Headers': true } }] });
    const intakeReport = api.root.getResource('intake')!.addResource('reports').addResource('{reportId}').addResource('finalize');
    intakeReport.addMethod('POST', new apigateway.LambdaIntegration(apiHandler), { authorizationType: apigateway.AuthorizationType.NONE });
    intakeReport.addMethod('OPTIONS', new apigateway.MockIntegration({ integrationResponses: [{ statusCode: '204', responseParameters: { 'method.response.header.Access-Control-Allow-Origin': "'*'", 'method.response.header.Access-Control-Allow-Methods': "'POST,OPTIONS'", 'method.response.header.Access-Control-Allow-Headers': "'content-type'" } }], requestTemplates: { 'application/json': '{"statusCode": 204}' } }), { methodResponses: [{ statusCode: '204', responseParameters: { 'method.response.header.Access-Control-Allow-Origin': true, 'method.response.header.Access-Control-Allow-Methods': true, 'method.response.header.Access-Control-Allow-Headers': true } }] });

    const webAcl = new wafv2.CfnWebACL(this, 'ApiWebAcl', {
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: 'bugdrop-api', sampledRequestsEnabled: true },
      rules: [
        { name: 'AWSCommonRules', priority: 0, overrideAction: { none: {} }, statement: { managedRuleGroupStatement: { vendorName: 'AWS', name: 'AWSManagedRulesCommonRuleSet' } }, visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: 'common-rules', sampledRequestsEnabled: true } },
        { name: 'IntakeRateLimit', priority: 1, action: { block: {} }, statement: { rateBasedStatement: { aggregateKeyType: 'IP', limit: 300 } }, visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: 'intake-rate-limit', sampledRequestsEnabled: true } }
      ]
    });
    new wafv2.CfnWebACLAssociation(this, 'ApiWebAclAssociation', { webAclArn: webAcl.attrArn, resourceArn: `arn:aws:apigateway:${this.region}::/restapis/${api.restApiId}/stages/${api.deploymentStage.stageName}` });

    apiHandler.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:Query'],
      resources: [reports.tableArn, `${reports.tableArn}/index/*`]
    }));

    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url });
    new cdk.CfnOutput(this, 'UserPoolId', { value: users.userPoolId });
    new cdk.CfnOutput(this, 'DashboardClientId', { value: webClient.userPoolClientId });
    new cdk.CfnOutput(this, 'EvidenceBucketName', { value: evidence.bucketName });
    new cdk.CfnOutput(this, 'DashboardUrl', { value: dashboardUrl });
    new cdk.CfnOutput(this, 'CognitoHostedUiUrl', { value: `${cognitoBaseUrl}/login` });
  }
}

function addCorsOptions(resource: apigateway.IResource, methods: string) {
  resource.addMethod('OPTIONS', new apigateway.MockIntegration({
    integrationResponses: [{ statusCode: '204', responseParameters: { 'method.response.header.Access-Control-Allow-Origin': "'*'", 'method.response.header.Access-Control-Allow-Methods': `'${methods}'`, 'method.response.header.Access-Control-Allow-Headers': "'authorization,content-type'" } }],
    requestTemplates: { 'application/json': '{"statusCode": 204}' }
  }), { methodResponses: [{ statusCode: '204', responseParameters: { 'method.response.header.Access-Control-Allow-Origin': true, 'method.response.header.Access-Control-Allow-Methods': true, 'method.response.header.Access-Control-Allow-Headers': true } }] });
}
