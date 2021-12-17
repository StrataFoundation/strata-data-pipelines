import AWS from "aws-sdk";

const S3_ENDPOINT = process.env["S3_ENDPOINT"]
const awsConfig: any = {
  region: process.env["S3_REGION"] || "us-east-2",
  accessKeyId: process.env["S3_ACCESS_KEY_ID"],
  secretAccessKey: process.env["S3_SECRET_ACCESS_KEY"],
  s3ForcePathStyle: !!S3_ENDPOINT, // needed with minio?
  signatureVersion: 'v4'
}
console.log(awsConfig);
if (S3_ENDPOINT) {
  awsConfig.endpoint = S3_ENDPOINT;
}
AWS.config.update(awsConfig);
export const s3 = new AWS.S3()
