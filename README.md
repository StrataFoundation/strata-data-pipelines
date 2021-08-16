# Wumbo Data Pipeline

### npm auth
Login with npm, npm login

Then,

```bash
npm token create --read-only
```

Copy that value as an env var in your bashrc, NPM_TOKEN

### Docker build

Docker build can be done via

```bash
aws ecr get-login-password --region us-east-2 | docker login --username AWS --password-stdin 554418307194.dkr.ecr.us-east-2.amazonaws.com
docker build --build-arg NPM_TOKEN=$NPM_TOKEN .
```

## kSQL Local Development

First, boot up docker compose:

```bash
docker-compose up
```

Then, create the bucket we're going to use in minio by going to localhost:9000. The username and password are both minioadmin.

Create a bucket named `wumbo-solana-blocks`

Next, start up the Process Blocks utility. There should be a vscode task for this.

Next, start up the Event Transform utility. There should be a vscode task for this.

Now, events should be streaming into kafka.

If you're starting fresh, your local kafka wont know anything about the existing dev wumbo instance. You should instead create a new one.

Go to `/wumbo/rust/` and run `./bootstrap.sh`. Copy the created values into globals.tsx and copy paste the WUM mint into the `total_wum_locked_social` and `total_wum_locked_account` queries.

 Let's load the ksql:

```bash
docker exec -it ksqldb-cli ksql http://ksqldb-server:8088
```

Open up queries.sql and copy them into the command line.

You can use kowl at localhost:8080 to see what's going into the topics.