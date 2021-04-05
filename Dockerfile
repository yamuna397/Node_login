FROM node:12.19.0
RUN mkdir -p /usr/src/app
ADD .yarn_cache /usr/local/share/.cache/yarn/v1/
ADD ./package.json ./yarn.* /tmp/
RUN cd /tmp && yarn
RUN cd /usr/src/app && ln -s /tmp/node_modules 
ADD . /usr/src/app/
EXPOSE 9000
WORKDIR /usr/src/app