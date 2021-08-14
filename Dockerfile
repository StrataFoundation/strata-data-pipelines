FROM node:14
ARG NPM_TOKEN  

WORKDIR /usr/src/app

COPY package.json ./
COPY yarn.lock ./

COPY .npmrc .npmrc  
RUN yarn install
RUN rm -f .npmrc

COPY . .

RUN yarn run build

CMD ["node dist/"]
