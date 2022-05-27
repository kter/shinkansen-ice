import { ClientAttributes } from 'aws-cdk-lib/aws-cognito';
import { Handler } from 'aws-lambda';
import { DynamoDB, SSM } from 'aws-sdk';
import { access } from 'fs';
// import { TwitterApi } from 'twitter-api-v2';
const twitter = require('twitter');

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
    const appKey = await ssm.getParameter(appKeyParams).promise();
    const appKeyVal = appKey.Parameter.Value;
    console.log('app key: ' + appKeyVal);
    // APP SECRET
    const appSecretParams = {
        Name: '/shinkansen-ice/app-secret',
        WithDecryption: true,
    };
    const appSecretVal = await ssm.getParameter(appSecretParams).promise();
    const appSecret = appSecretVal.Parameter.Value;
    console.log('app secret: ' + appSecret);
    // ACCES TOKEN
    const accessTokenParams = {
        Name: '/shinkansen-ice/access-token',
        WithDecryption: true,
    };
    const accessTokenVal = await ssm.getParameter(accessTokenParams).promise();
    const accessToken = accessTokenVal.Parameter.Value;
    console.log('access token: ' + accessToken);
    // ACCESS SECRET
    const accessSecretParams = {
        Name: '/shinkansen-ice/access-secret',
        WithDecryption: true,
    };
    const accessSecretVal = await ssm.getParameter(accessSecretParams).promise();
    const accessSecret = accessSecretVal.Parameter.Value;
    console.log('access secret: ' + accessSecret);
    // CLIENT ID
    const clientIdParam = {
        Name: '/shinkansen-ice/client-id',
        WithDecryption: true,
    };
    const clientIdVal = await ssm.getParameter(clientIdParam).promise();
    const clientId = clientIdVal.Parameter.Value;
    console.log('client id: ' + clientId);
    // CLIENT SECRET
    const clientSecretParam = {
        Name: '/shinkansen-ice/client-secret',
        WithDecryption: true,
    };
    const clientSecretVal = await ssm.getParameter(clientSecretParam).promise();
    const clientSecret = clientSecretVal.Parameter.Value;
    console.log('clietn secret: ' + clientSecret);

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
    let promises = [];
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
            // DEBUG
            // db.put(putParam).promise();
            console.log('[DEBUG]' + 'saved previous tweet id: ' + response.data[0].id);

            // リツイート処理
            // bearer tokenはリツイートできない
            // const twitterClient = new TwitterApi(bearerToken);
            // const twitterClient = new TwitterApi({
            //     appKey: appKey,
            //     appSecret: appSecret,
            //     accessToken: accessToken,
            //     accessSecret: accessSecret,
            // });
            // const twitterClient = new TwitterApi({
            //     clientId: clientId,
            //     clientSecret: clientSecret,
            // });
            // const rwClient = twitterClient.readWrite;
            const client = new twitter({
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
                console.log('(test) retweet: ' + response.data[i].id);
                // await rwClient.v2.retweet("843652192934350848", response.data[i].id);
                // await rwClient.v1.post(`statuses/retweet/${response.data[i].id}.json`); 
                promises.push(client.post('statuses/retweet/' + response.data[i].id, {}));
            }
        } else {
            console.log('[DEBUG]' + 'search data retrieved. but not new tweet');
        }
    } else {
        console.log('[DEBUG]' + 'no search data retrieved');
    }
    Promise.all(promises)
    .then(function (results) {
        console.dir(results);
    });
    return JSON.stringify({
        status: 'success'
    });
}

