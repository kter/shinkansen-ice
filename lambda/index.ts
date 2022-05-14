import axios from 'axios';
import { Handler } from 'aws-lambda';

type EmptyHandler = Handler<void, string>;

export const handler: EmptyHandler = async function () {
    const response = await axios.get('https://amazon.co.jp/');
    return JSON.stringify({
        message: `status code: ${response.status}`
    });
}

