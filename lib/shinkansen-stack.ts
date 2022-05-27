import { aws_dynamodb, Duration, Stack, StackProps } from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import * as nodeLambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path'
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import * as cdk from '@aws-cdk/core';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import * as events from "aws-cdk-lib/aws-events";
import * as targets from 'aws-cdk-lib/aws-events-targets';

export class ShinkansenStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const logTable = new Table(this, 'logTable', {
      partitionKey: {
        name: 'type',
        type: aws_dynamodb.AttributeType.STRING
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
    }
    );

    const nodeJsFunctionProps: nodeLambda.NodejsFunctionProps = {
      bundling: {
        externalModules: [
          'aws-sdk', // Use the 'aws-sdk' available in the Lambda runtime
        ],
      },
      memorySize: 1024,
      timeout: Duration.seconds(6),
      depsLockFilePath: path.join(__dirname, '../lambda/package-lock.json'),
      environment: {
        PRIMARY_KEY: 'itemId',
        TABLE_NAME: logTable.tableName,
      },
      runtime: Runtime.NODEJS_14_X,
      handler: 'handler',
    };

    const handler = new nodeLambda.NodejsFunction(this, 'NodeLambda', {
      entry: path.join(__dirname, '../lambda/index.ts'),
      ...nodeJsFunctionProps,
    });

    logTable.grantReadWriteData(handler);

    const twitterToken = ssm.StringParameter.fromSecureStringParameterAttributes(
      this, 'twitterToken', {
      parameterName: '/shinkansen-ice/twitter',
    }
    )
    twitterToken.grantRead(handler)
    const appKey = ssm.StringParameter.fromSecureStringParameterAttributes(
      this, 'appKey', {
      parameterName: '/shinkansen-ice/app-key',
    }
    )
    appKey.grantRead(handler)
    const appSecret = ssm.StringParameter.fromSecureStringParameterAttributes(
      this, 'appSecret', {
      parameterName: '/shinkansen-ice/app-secret',
    }
    )
    appSecret.grantRead(handler)
    const accessToken = ssm.StringParameter.fromSecureStringParameterAttributes(
      this, 'accessToken', {
      parameterName: '/shinkansen-ice/access-token',
    }
    )
    accessToken.grantRead(handler)
    const accessSecret = ssm.StringParameter.fromSecureStringParameterAttributes(
      this, 'accessSecret', {
      parameterName: '/shinkansen-ice/access-secret',
    }
    )
    accessSecret.grantRead(handler)

    new events.Rule(this, "lambdaRule", {
      schedule: events.Schedule.rate(Duration.minutes(1)),
      targets: [new targets.LambdaFunction(handler, {retryAttempts: 3})],
  });
  }
}
