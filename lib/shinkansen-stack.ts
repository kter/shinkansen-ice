import * as events from 'aws-cdk-lib/aws-events';
import * as nodeLambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { aws_dynamodb, Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';

const PARAM_NAMES = [
  '/shinkansen-ice/twitter',
  '/shinkansen-ice/app-key',
  '/shinkansen-ice/app-secret',
  '/shinkansen-ice/access-token',
  '/shinkansen-ice/access-secret',
];

export class ShinkansenStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const logTable = new Table(this, 'logTable', {
      partitionKey: { name: 'type', type: aws_dynamodb.AttributeType.STRING },
      removalPolicy: RemovalPolicy.DESTROY,
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    const logGroup = new LogGroup(this, 'NodeLambdaLogGroup', {
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const handler = new nodeLambda.NodejsFunction(this, 'NodeLambda', {
      entry: path.join(__dirname, '../lambda/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_20_X,
      memorySize: 128,
      timeout: Duration.seconds(15),
      depsLockFilePath: path.join(__dirname, '../lambda/package-lock.json'),
      logGroup,
      environment: {
        TABLE_NAME: logTable.tableName,
      },
      bundling: {
        // @aws-sdk/* is provided by the Node 20 runtime — keep it out of the bundle.
        externalModules: ['@aws-sdk/*'],
      },
    });

    logTable.grantReadWriteData(handler);

    // grantRead adds ssm:GetParameter(s) + kms:Decrypt for each SecureString param.
    PARAM_NAMES.forEach((name, i) => {
      ssm.StringParameter.fromSecureStringParameterAttributes(this, `param${i}`, {
        parameterName: name,
      }).grantRead(handler);
    });

    // Was rate(1 minute); an ice-cream retweet bot does not need minute-level latency.
    new events.Rule(this, 'lambdaRule', {
      schedule: events.Schedule.rate(Duration.minutes(15)),
      targets: [new targets.LambdaFunction(handler, { retryAttempts: 2 })],
    });
  }
}
