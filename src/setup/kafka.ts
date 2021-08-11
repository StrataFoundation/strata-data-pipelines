import { Kafka, SASLOptions } from "kafkajs";

const { KAFKA_USERNAME: username, KAFKA_PASSWORD: password } = process.env
const sasl: SASLOptions | undefined = username && password ? { username, password, mechanism: 'plain' } : undefined
const ssl = !!sasl
// This creates a client instance that is configured to connect to the Kafka broker provided by
// the environment variable KAFKA_BOOTSTRAP_SERVER
export const kafka = new Kafka({
  clientId: "kafka-s3-block-uploader",
  brokers: [process.env.KAFKA_BOOTSTRAP_SERVER!],
  ssl,
  sasl
})
