import { Handler } from 'aws-lambda';
import { DynamoDB, SSM } from 'aws-sdk';

type EmptyHandler = Handler<void, string>;

export const handler: EmptyHandler = async function () {

    const db = new DynamoDB.DocumentClient();
    const tableName = process.env.TABLE_NAME;
    const param = {
        TableName: tableName,
        Item: {
            type: "previousLoadPosition",
            value: "aaa",
        },
    };
    db.put(param, function (err: any, data: any) {
        if (err) {
            console.log(err);
        } else {
            db.scan({ TableName: tableName }, function (err: { code: any; }, data: any) {
                if (err) {
                    console.log("error", err.code);
                } else {
                    console.log("Table Items: ", data);
                }
            });
        }
    });

    const ssm = new SSM();
    const params = {
        Name: '/shinkansen-ice/twitter',
        WithDecryption: true,
    };
    console.log('------------1');
    const token = await ssm.getParameter(params).promise();
    console.log('------------2');
    console.log(token.Parameter.Value);


    // Search for Tweets within the past seven days
    // https://developer.twitter.com/en/docs/twitter-api/tweets/search/quick-start/recent-search

    const needle = require('needle');

    const endpointUrl = "https://api.twitter.com/2/tweets/search/recent";

    async function getRequest() {

        // Edit query parameters below
        // specify a search query, and any additional fields that are required
        // by default, only the Tweet ID and text fields are returned
        const params = {
            'query': '#シンカンセンスゴクカタイアイス -is:retweet has:media',
            'tweet.fields': 'author_id'
        }

        const res = await needle('get', endpointUrl, params, {
            headers: {
                "User-Agent": "v2RecentSearchJS",
                "authorization": `Bearer ${token.Parameter.Value}`
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
            // Make request
            const response = await getRequest();
            console.dir(response, {
                depth: null
            });
            return JSON.stringify({
                data: console.dir(response, { depth: null })
            });

        } catch (e) {
            console.log(e);
            process.exit(-1);
        }
        process.exit();
    })();





}

