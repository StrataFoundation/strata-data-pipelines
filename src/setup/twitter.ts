import TwitterApi from 'twitter-api-v2';

export const twitterClient = new TwitterApi({
  appKey: process.env.TWITTER_CONSUMER_KEY!,
  appSecret: process.env.TWITTER_CONSUMER_SECRET!,
  accessToken: process.env.TWITTER_ACCESS_TOKEN_KEY!,
  accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET!,
}).readWrite;
