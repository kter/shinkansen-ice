// Verify which X account the OAuth 1.0a tokens in SSM authenticate as.
// Does NOT post/retweet anything — only calls v2.me().
import { TwitterApi } from 'twitter-api-v2';
import { SSMClient, GetParametersCommand } from '@aws-sdk/client-ssm';

const ssm = new SSMClient({ region: 'ap-northeast-1' });
const out = await ssm.send(
  new GetParametersCommand({
    Names: [
      '/shinkansen-ice/app-key',
      '/shinkansen-ice/app-secret',
      '/shinkansen-ice/access-token',
      '/shinkansen-ice/access-secret',
    ],
    WithDecryption: true,
  }),
);
const m = Object.fromEntries(out.Parameters.map((p) => [p.Name, p.Value]));
const client = new TwitterApi({
  appKey: m['/shinkansen-ice/app-key'],
  appSecret: m['/shinkansen-ice/app-secret'],
  accessToken: m['/shinkansen-ice/access-token'],
  accessSecret: m['/shinkansen-ice/access-secret'],
});
const me = await client.v2.me();
console.log(`Authenticated as @${me.data.username} (id ${me.data.id})`);
