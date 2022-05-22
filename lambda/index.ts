import { Handler } from 'aws-lambda';
import { DynamoDB, SSM } from 'aws-sdk';

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
    const ssm = new SSM();
    const params = {
        Name: '/shinkansen-ice/twitter',
        WithDecryption: true,
    };
    const token = await ssm.getParameter(params).promise();
    const bearerToken = token.Parameter.Value;
    console.log('token: ' + bearerToken);

    // ツイート検索
    const needle = require('needle');
    const endpointUrl = "https://api.twitter.com/2/tweets/search/recent";
    async function getRequest() {
        const params = {
            'query': '#シンカンセンスゴクカタイアイス -is:retweet has:media',
            'tweet.fields': 'author_id'
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

    (async () => {
        try {
            // ツイート検索実行
            const response = await getRequest();
            console.dir(response, {
                depth: null
            });
            // 結果がある場合
            if (response.data[0]) {
                // ツイートIDを保存
                const putParam = {
                    TableName: tableName,
                    Item: {
                        type: "previousLoadPosition",
                        value: response.data[0],
                    },
                };
                db.put(putParam).promise();
            }
            return JSON.stringify({
                data: console.dir(response.data, { depth: null })
            });

        } catch (e) {
            console.log(e);
            process.exit(-1);
        }
        process.exit();
    })();





}

