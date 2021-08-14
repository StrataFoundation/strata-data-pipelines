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