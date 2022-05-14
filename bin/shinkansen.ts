#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ShinkansenStack } from '../lib/shinkansen-stack';

const app = new cdk.App();
new ShinkansenStack(app, 'ShinkansenStack');
