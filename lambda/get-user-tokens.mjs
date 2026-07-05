// One-off helper: obtain OAuth 1.0a access token/secret for a specific X account
// (e.g. @sskabot) and write them directly to SSM. Tokens are never printed.
//
//   STEP 1:  AWS_PROFILE=default node get-user-tokens.mjs
//            -> prints an authorize URL. Open it WHILE LOGGED IN AS @sskabot.
//   STEP 2:  AWS_PROFILE=default node get-user-tokens.mjs <oauth_verifier>
//            -> exchanges + writes /shinkansen-ice/access-token and access-secret to SSM.
import { TwitterApi } from 'twitter-api-v2';
import { SSMClient, GetParametersCommand, PutParameterCommand } from '@aws-sdk/client-ssm';
import fs from 'node:fs';

const REGION = 'ap-northeast-1';
const TARGET = 'sskabot'; // must match the authorizing account
const STATE = '/tmp/sska_oauth_state.json';
const ssm = new SSMClient({ region: REGION });

async function getConsumer() {
  const out = await ssm.send(
    new GetParametersCommand({
      Names: ['/shinkansen-ice/app-key', '/shinkansen-ice/app-secret'],
      WithDecryption: true,
    }),
  );
  const m = Object.fromEntries(out.Parameters.map((p) => [p.Name, p.Value]));
  return { appKey: m['/shinkansen-ice/app-key'], appSecret: m['/shinkansen-ice/app-secret'] };
}

const verifier = process.argv[2];
const { appKey, appSecret } = await getConsumer();

if (!verifier) {
  const callback = process.env.CALLBACK || 'https://localhost/';
  const client = new TwitterApi({ appKey, appSecret });
  const link = await client.generateAuthLink(callback);
  fs.writeFileSync(STATE, JSON.stringify({ t: link.oauth_token, s: link.oauth_token_secret }));
  console.log('\n=== STEP 1 ===');
  console.log(`Open this URL WHILE LOGGED IN AS @${TARGET}, then click Authorize app:\n`);
  console.log('  ' + link.url + '\n');
  console.log('You will be redirected to  https://localhost/?...&oauth_verifier=XXXXX');
  console.log('(the page will fail to load — that is fine). Copy the oauth_verifier value');
  console.log('from the address bar, then run STEP 2:\n');
  console.log('  AWS_PROFILE=default node get-user-tokens.mjs <oauth_verifier>\n');
} else {
  const st = JSON.parse(fs.readFileSync(STATE, 'utf8'));
  const tmp = new TwitterApi({ appKey, appSecret, accessToken: st.t, accessSecret: st.s });
  const { accessToken, accessSecret, screenName } = await tmp.login(verifier);
  if (screenName.toLowerCase() !== TARGET.toLowerCase()) {
    console.error(`\nABORT: authorized as @${screenName}, not @${TARGET}. Re-run STEP 1 and log in as @${TARGET}.\n`);
    process.exit(1);
  }
  await ssm.send(
    new PutParameterCommand({ Name: '/shinkansen-ice/access-token', Value: accessToken, Type: 'SecureString', Overwrite: true }),
  );
  await ssm.send(
    new PutParameterCommand({ Name: '/shinkansen-ice/access-secret', Value: accessSecret, Type: 'SecureString', Overwrite: true }),
  );
  try { fs.unlinkSync(STATE); } catch { /* ignore */ }
  console.log(`\n✅ Success — @${screenName} access token & secret written to SSM (values not shown).\n`);
}
