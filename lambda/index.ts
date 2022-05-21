import axios from 'axios';
import { Handler } from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';

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
    const response = await axios.get('https://amazon.co.jp/');
    return JSON.stringify({
        message: `status code: ${response.status}`
    });
}

