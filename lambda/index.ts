import { Handler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParametersCommand } from '@aws-sdk/client-ssm';
import { TwitterApi } from 'twitter-api-v2';

const TABLE_NAME = process.env.TABLE_NAME!;
const POSITION_KEY = 'previousLoadPosition';

const SEARCH_QUERY =
  '(シンカンセンスゴクカタイアイス OR シンカンセンスゴイカタイアイス OR 新幹線ごく堅いアイス OR 新幹線すごい堅いアイス OR 新幹線すごく固いアイス) -is:retweet has:media';

const PARAM_NAMES = {
  bearer: '/shinkansen-ice/twitter',
  appKey: '/shinkansen-ice/app-key',
  appSecret: '/shinkansen-ice/app-secret',
  accessToken: '/shinkansen-ice/access-token',
  accessSecret: '/shinkansen-ice/access-secret',
} as const;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ssm = new SSMClient({});

type Creds = {
  bearer: string;
  appKey: string;
  appSecret: string;
  accessToken: string;
  accessSecret: string;
};

// Module-scope caches survive across warm invocations, so the SSM SecureString
// decryption (KMS) runs once per container instead of on every invocation.
let credsPromise: Promise<Creds> | null = null;
function getCreds(): Promise<Creds> {
  if (!credsPromise) {
    credsPromise = (async () => {
      const out = await ssm.send(
        new GetParametersCommand({ Names: Object.values(PARAM_NAMES), WithDecryption: true }),
      );
      const m = new Map((out.Parameters ?? []).map((p) => [p.Name, p.Value] as const));
      const need = (name: string): string => {
        const v = m.get(name);
        if (!v) throw new Error(`missing SSM parameter: ${name}`);
        return v;
      };
      return {
        bearer: need(PARAM_NAMES.bearer),
        appKey: need(PARAM_NAMES.appKey),
        appSecret: need(PARAM_NAMES.appSecret),
        accessToken: need(PARAM_NAMES.accessToken),
        accessSecret: need(PARAM_NAMES.accessSecret),
      };
    })().catch((e) => {
      credsPromise = null; // allow retry on next invocation
      throw e;
    });
  }
  return credsPromise;
}

let selfIdPromise: Promise<string> | null = null;
function getSelfId(client: TwitterApi): Promise<string> {
  if (!selfIdPromise) {
    selfIdPromise = client.v2
      .me()
      .then((r) => r.data.id)
      .catch((e) => {
        selfIdPromise = null;
        throw e;
      });
  }
  return selfIdPromise;
}

function errInfo(e: unknown): unknown {
  const any = e as { data?: unknown; message?: string };
  return any?.data ?? any?.message ?? e;
}

export const handler: Handler<unknown, string> = async () => {
  const creds = await getCreds();

  // Last-seen tweet id (so we only read/retweet what's new).
  const prev = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { type: POSITION_KEY } }));
  const sinceId: string | undefined = prev.Item?.value;

  // Search recent tweets with the app-only bearer token.
  const appClient = new TwitterApi(creds.bearer);
  const searchOpts: Record<string, unknown> = { max_results: 10, sort_order: 'recency' };
  if (sinceId) searchOpts.since_id = sinceId;

  let tweets: { id: string }[];
  try {
    const res = await appClient.v2.search(SEARCH_QUERY, searchOpts);
    tweets = res.tweets ?? [];
  } catch (e) {
    console.error('search failed:', errInfo(e));
    return JSON.stringify({ status: 'search_error' });
  }

  if (tweets.length === 0) {
    console.log('no new tweets');
    return JSON.stringify({ status: 'no_new_tweets' });
  }

  // Retweet with the user context (OAuth 1.0a).
  const userClient = new TwitterApi({
    appKey: creds.appKey,
    appSecret: creds.appSecret,
    accessToken: creds.accessToken,
    accessSecret: creds.accessSecret,
  });

  let selfId: string;
  try {
    selfId = await getSelfId(userClient);
  } catch (e) {
    console.error('failed to resolve self id:', errInfo(e));
    return JSON.stringify({ status: 'auth_error' });
  }

  let newestId = sinceId ?? '0';
  let retweeted = 0;
  for (const t of tweets) {
    if (BigInt(t.id) > BigInt(newestId)) newestId = t.id;
    try {
      await userClient.v2.retweet(selfId, t.id);
      retweeted += 1;
      console.log('retweeted', t.id);
    } catch (e) {
      if ((e as { code?: number }).code === 429) {
        console.warn('rate limited; stopping this run');
        break;
      }
      console.error('retweet failed for', t.id, errInfo(e));
    }
  }

  // Advance the cursor.
  if (newestId !== (sinceId ?? '0')) {
    await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: { type: POSITION_KEY, value: newestId } }));
    console.log('saved newest id', newestId);
  }

  return JSON.stringify({ status: 'ok', found: tweets.length, retweeted });
};
