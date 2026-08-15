# The Memory Board is a static, no-build client-side app: React/htm are loaded
# from a CDN and the source ships as native ES modules. So the image is just a
# lightweight nginx serving the static tree — no Node build stage required.
FROM nginx:1.27-alpine

# Stateless container, configuration from environment (12-factor). See A2N
# standards: container-based, disposable, deployed to Amazon ECS via CI.
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

WORKDIR /usr/share/nginx/html
COPY index.html ./index.html
COPY src ./src
COPY data ./data

# Ship the example config as the default runtime config so branding/deadline are
# set out of the box. Override by replacing /usr/share/nginx/html/config.js.
COPY config.example.js ./config.js
COPY config.example.js ./config.example.js

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q -O /dev/null http://localhost/ || exit 1
