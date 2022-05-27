import { Handler } from 'aws-lambda';
import { DynamoDB, SSM } from 'aws-sdk';
import Twitter from 'twitter-lite';

type EmptyHandler = Handler<void, string>;

export const handler: EmptyHandler = async function () {

    const db = new DynamoDB.DocumentClient();
    const tableName = process.env.TABLE_NAME;

    // リツイートした最後のツイートIDを取得
    const getParam = {
        TableName: tableName,
        Key: {
            type: "previousLoadPosition",
        },
    };
    const data = await db.get(getParam).promise();
    const previousId = data.Item['value'];
    console.log('previousID: ' + previousId);

    // Twitterのトークンを取得
    // BARER TOKEN
    const ssm = new SSM();
    const barerParams = {
        Name: '/shinkansen-ice/twitter',
        WithDecryption: true,
    };
    const token = await ssm.getParameter(barerParams).promise();
    const bearerToken = token.Parameter.Value;
    console.log('token: ' + bearerToken);
    // APP KEY
    const appKeyParams = {
        Name: '/shinkansen-ice/app-key',
        WithDecryption: true,
    };
    const appKeyVal = await ssm.getParameter(appKeyParams).promise();
    const appKey = appKeyVal.Parameter.Value;
    // APP SECRET
    const appSecretParams = {
        Name: '/shinkansen-ice/app-secret',
        WithDecryption: true,
    };
    const appSecretVal = await ssm.getParameter(appSecretParams).promise();
    const appSecret = appSecretVal.Parameter.Value;
    // ACCES TOKEN
    const accessTokenParams = {
        Name: '/shinkansen-ice/access-token',
        WithDecryption: true,
    };
    const accessTokenVal = await ssm.getParameter(accessTokenParams).promise();
    const accessToken = accessTokenVal.Parameter.Value;
    // ACCESS SECRET
    const accessSecretParams = {
        Name: '/shinkansen-ice/access-secret',
        WithDecryption: true,
    };
    const accessSecretVal = await ssm.getParameter(accessSecretParams).promise();
    const accessSecret = accessSecretVal.Parameter.Value;

    // ツイート検索
    const needle = require('needle');
    const endpointUrl = "https://api.twitter.com/2/tweets/search/recent";
    async function getRequest() {
        const params = {
            'query': '(シンカンセンスゴクカタイアイス OR シンカンセンスゴイカタイアイス OR 新幹線ごく堅いアイス OR 新幹線すごい堅いアイス OR 新幹線すごく固いアイス) -is:retweet has:media',
        }
        const res = await needle('get', endpointUrl, params, {
            headers: {
                "User-Agent": "v2RecentSearchJS",
                "authorization": `Bearer ${bearerToken}`,
                "since_id": previousId,
            }
        })
        if (res.body) {
            return res.body;
        } else {
            throw new Error('Unsuccessful request');
        }
    }

    // ツイート検索実行
    const response = await getRequest();
    console.dir(response, {
        depth: null
    });
    // 結果がある場合
    if (response.data[0]) {
        if (parseInt(response.data[0].id) > parseInt(previousId)) {
            // ツイートIDを保存
            const putParam = {
                TableName: tableName,
                Item: {
                    type: "previousLoadPosition",
                    value: response.data[0].id,
                },
            };
            db.put(putParam).promise();
            console.log('[DEBUG]' + 'saved previous tweet id: ' + response.data[0].id);

            // リツイート処理
            // console.log('app key:' + appKey + ':');
            // console.log('app secret:' + appSecret + ':');
            // console.log('access token:' + accessToken + ':');
            // console.log('access secret:' + accessSecret + ":");
            const client = new Twitter({
                consumer_key: appKey,
                consumer_secret: appSecret,
                access_token_key: accessToken,
                access_token_secret: accessSecret,
              });

            for (let i = 0; i < response.data.length; i++) {
                // もし新しいツイートがなければ終了
                if (parseInt(response.data[i].id) <= parseInt(previousId)) {
                    console.log('[DEBUG]' + 'no newer tweets: ' + response.data[i].id);
                    break;
                }
                console.log('[DEBUG]retweet: ' + response.data[i].id);
                try {
                    let res = await client.post('statuses/retweet/' + response.data[i].id, {
                        id: response.data[i].id
                    });
                    // ... use response here ...
                    console.dir(res);
                } catch (e) {
                    if ('errors' in e) {
                        // Twitter API error
                        if (e.errors[0].code === 88) {
                            // rate limit exceeded
                            console.log("Rate limit will reset on", new Date(e._headers.get("x-rate-limit-reset") * 1000));
                        } else {
                        // some other kind of error, e.g. read-only API trying to POST
                        console.log("API Error: " + JSON.stringify(e));
                        }
                    } else {
                        // non-API error, e.g. network problem or invalid JSON in response
                        console.log("NON-API Error: " + JSON.stringify(e));
                    }
                }
            }
        } else {
            console.log('[DEBUG]' + 'search data retrieved. but not new tweet');
        }
    } else {
        console.log('[DEBUG]' + 'no search data retrieved');
    }
    return JSON.stringify({
        status: 'success'
    });
}

