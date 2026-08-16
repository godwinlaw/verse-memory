# READ ME: Standards & Principles

## Cloud Native

![](https://static.slab.com/prod/uploads/qist5ogo/posts/images/cAZggPtuOC0s572YxgoB6p7z.png?jwt=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJodHRwczovL3NsYWJzdGF0aWMuY29tIiwiZXhwIjoxNzg3OTYxNTA1LCJpYXQiOjE3ODY3NTE5MDUsImlzcyI6Imh0dHBzOi8vYXBwLnNsYWIuY29tIiwianRpIjoiMzM1dDJwMWg4OTk4bms1ZDExOTMzOG0xIiwibmJmIjoxNzg2NzUxOTA1LCJwYXRoIjoicHJvZC9hc3NldHMvcWlzdDVvZ28vcG9zdC8wdW50Z3NhYSJ9.JKhP9BN-EdwMYLN5ALtXC1ywhBmLOTdS56Lx8UpTP74q-cRxPYRitMZ3uW-avf-1-K171KgjDmg1eFT2W2D-waUfSZflHdkvsbLm39Rvmwf09harr2tULWfSVw13k30ataswtvAm1fF551IJZPkIqkpc8t5Jt2_dMmFoxHBdVWucAoHwKpz8sunC9WJA7d636YxP58ETnBOIJ9Fl1CUE9hWy9FrC7BSHf2kYPlgmVOYv7wiOkqUa80XN0_3pfszRFD_JPCJbKlIi4wmaBZ_u4wu8Ky4CVXnmjm7ddSoXq8swtSjPwvcrH7GlDDskelO3s722L6vWS0jSlYaakSkF1g)

Aim to follow best practices for modern, cloud-native engineering. Many of these are drawn from the [12-factor](https://12factor.net) principles.

### Container-based Architecture

![](https://static.slab.com/prod/uploads/qist5ogo/posts/images/EFeJBhs6CND_-orVUuEThxlt.svg?jwt=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJodHRwczovL3NsYWJzdGF0aWMuY29tIiwiZXhwIjoxNzg3OTYxNTA1LCJpYXQiOjE3ODY3NTE5MDUsImlzcyI6Imh0dHBzOi8vYXBwLnNsYWIuY29tIiwianRpIjoiMzM1dDJwMWg4OTk4bms1ZDExOTMzOG0xIiwibmJmIjoxNzg2NzUxOTA1LCJwYXRoIjoicHJvZC9hc3NldHMvcWlzdDVvZ28vcG9zdC8wdW50Z3NhYSJ9.JKhP9BN-EdwMYLN5ALtXC1ywhBmLOTdS56Lx8UpTP74q-cRxPYRitMZ3uW-avf-1-K171KgjDmg1eFT2W2D-waUfSZflHdkvsbLm39Rvmwf09harr2tULWfSVw13k30ataswtvAm1fF551IJZPkIqkpc8t5Jt2_dMmFoxHBdVWucAoHwKpz8sunC9WJA7d636YxP58ETnBOIJ9Fl1CUE9hWy9FrC7BSHf2kYPlgmVOYv7wiOkqUa80XN0_3pfszRFD_JPCJbKlIi4wmaBZ_u4wu8Ky4CVXnmjm7ddSoXq8swtSjPwvcrH7GlDDskelO3s722L6vWS0jSlYaakSkF1g)

Application architecture should be [container](https://www.docker.com/resources/what-container) (or [serverless](https://aws.amazon.com/serverless), where appropriate)-based, following modern design patterns:

- Stateless containers
- Disposability / scalability of containers
- Configuration from environment

### CI / CD

![](https://static.slab.com/prod/uploads/qist5ogo/posts/images/FvplOW60geZeIuebJFaa8won.png?jwt=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJodHRwczovL3NsYWJzdGF0aWMuY29tIiwiZXhwIjoxNzg3OTYxNTA1LCJpYXQiOjE3ODY3NTE5MDUsImlzcyI6Imh0dHBzOi8vYXBwLnNsYWIuY29tIiwianRpIjoiMzM1dDJwMWg4OTk4bms1ZDExOTMzOG0xIiwibmJmIjoxNzg2NzUxOTA1LCJwYXRoIjoicHJvZC9hc3NldHMvcWlzdDVvZ28vcG9zdC8wdW50Z3NhYSJ9.JKhP9BN-EdwMYLN5ALtXC1ywhBmLOTdS56Lx8UpTP74q-cRxPYRitMZ3uW-avf-1-K171KgjDmg1eFT2W2D-waUfSZflHdkvsbLm39Rvmwf09harr2tULWfSVw13k30ataswtvAm1fF551IJZPkIqkpc8t5Jt2_dMmFoxHBdVWucAoHwKpz8sunC9WJA7d636YxP58ETnBOIJ9Fl1CUE9hWy9FrC7BSHf2kYPlgmVOYv7wiOkqUa80XN0_3pfszRFD_JPCJbKlIi4wmaBZ_u4wu8Ky4CVXnmjm7ddSoXq8swtSjPwvcrH7GlDDskelO3s722L6vWS0jSlYaakSkF1g)

Build, test, release, deploy should all be handled by automated [continuous integration](https://aws.amazon.com/devops/continuous-integration) and continuous deployment.

No one should be manually building / uploading artifacts / running commands over SSH for purposes of deployment.

### Infrastructure / Configuration as Code

![](https://static.slab.com/prod/uploads/qist5ogo/posts/images/1nxRNs_M4NaQCsZpzGR1Ji8s.svg?jwt=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJodHRwczovL3NsYWJzdGF0aWMuY29tIiwiZXhwIjoxNzg3OTYxNTA1LCJpYXQiOjE3ODY3NTE5MDUsImlzcyI6Imh0dHBzOi8vYXBwLnNsYWIuY29tIiwianRpIjoiMzM1dDJwMWg4OTk4bms1ZDExOTMzOG0xIiwibmJmIjoxNzg2NzUxOTA1LCJwYXRoIjoicHJvZC9hc3NldHMvcWlzdDVvZ28vcG9zdC8wdW50Z3NhYSJ9.JKhP9BN-EdwMYLN5ALtXC1ywhBmLOTdS56Lx8UpTP74q-cRxPYRitMZ3uW-avf-1-K171KgjDmg1eFT2W2D-waUfSZflHdkvsbLm39Rvmwf09harr2tULWfSVw13k30ataswtvAm1fF551IJZPkIqkpc8t5Jt2_dMmFoxHBdVWucAoHwKpz8sunC9WJA7d636YxP58ETnBOIJ9Fl1CUE9hWy9FrC7BSHf2kYPlgmVOYv7wiOkqUa80XN0_3pfszRFD_JPCJbKlIi4wmaBZ_u4wu8Ky4CVXnmjm7ddSoXq8swtSjPwvcrH7GlDDskelO3s722L6vWS0jSlYaakSkF1g)

All infrastructure and configuration should be codified declaratively in [GitHub](https://github.com) repositories within the [GracepointMinistries](https://github.com/GracepointMinistries) organization and managed by an IaC solution like [Terraform](https://www.terraform.io) or [CloudFormation](https://aws.amazon.com/cloudformation) as part of CI / CD.

⚠️ THIS IS NOT OPTIONAL! It is not acceptable to manually create / manipulate resources in the AWS console, except in cases of bootstrapping.

![Don't be this guy.](https://static.slab.com/prod/uploads/qist5ogo/posts/images/cGBPcisjho7Gf3F4oTLaaBTN.png?jwt=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJodHRwczovL3NsYWJzdGF0aWMuY29tIiwiZXhwIjoxNzg3OTYxNTA1LCJpYXQiOjE3ODY3NTE5MDUsImlzcyI6Imh0dHBzOi8vYXBwLnNsYWIuY29tIiwianRpIjoiMzM1dDJwMWg4OTk4bms1ZDExOTMzOG0xIiwibmJmIjoxNzg2NzUxOTA1LCJwYXRoIjoicHJvZC9hc3NldHMvcWlzdDVvZ28vcG9zdC8wdW50Z3NhYSJ9.JKhP9BN-EdwMYLN5ALtXC1ywhBmLOTdS56Lx8UpTP74q-cRxPYRitMZ3uW-avf-1-K171KgjDmg1eFT2W2D-waUfSZflHdkvsbLm39Rvmwf09harr2tULWfSVw13k30ataswtvAm1fF551IJZPkIqkpc8t5Jt2_dMmFoxHBdVWucAoHwKpz8sunC9WJA7d636YxP58ETnBOIJ9Fl1CUE9hWy9FrC7BSHf2kYPlgmVOYv7wiOkqUa80XN0_3pfszRFD_JPCJbKlIi4wmaBZ_u4wu8Ky4CVXnmjm7ddSoXq8swtSjPwvcrH7GlDDskelO3s722L6vWS0jSlYaakSkF1g)

### Other Software Design / Architecture Best Practices

![](https://static.slab.com/prod/uploads/qist5ogo/posts/images/kgi5dtY3Hiaw65I64M3xC0af.svg?jwt=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJodHRwczovL3NsYWJzdGF0aWMuY29tIiwiZXhwIjoxNzg3OTYxNTA1LCJpYXQiOjE3ODY3NTE5MDUsImlzcyI6Imh0dHBzOi8vYXBwLnNsYWIuY29tIiwianRpIjoiMzM1dDJwMWg4OTk4bms1ZDExOTMzOG0xIiwibmJmIjoxNzg2NzUxOTA1LCJwYXRoIjoicHJvZC9hc3NldHMvcWlzdDVvZ28vcG9zdC8wdW50Z3NhYSJ9.JKhP9BN-EdwMYLN5ALtXC1ywhBmLOTdS56Lx8UpTP74q-cRxPYRitMZ3uW-avf-1-K171KgjDmg1eFT2W2D-waUfSZflHdkvsbLm39Rvmwf09harr2tULWfSVw13k30ataswtvAm1fF551IJZPkIqkpc8t5Jt2_dMmFoxHBdVWucAoHwKpz8sunC9WJA7d636YxP58ETnBOIJ9Fl1CUE9hWy9FrC7BSHf2kYPlgmVOYv7wiOkqUa80XN0_3pfszRFD_JPCJbKlIi4wmaBZ_u4wu8Ky4CVXnmjm7ddSoXq8swtSjPwvcrH7GlDDskelO3s722L6vWS0jSlYaakSkF1g)

(Not strictly required, but highly recommended)

- [Microservice](https://aws.amazon.com/microservices)-based architecture: avoid monolithic architectures (looking at you, [Rails](https://rubyonrails.org)) in favor of microservices
  - E.g., replace a monolithic MVC framework (e.g., [Django](https://www.djangoproject.com), [Rails](https://rubyonrails.org))-based app with a [three-tier](https://en.wikipedia.org/wiki/Multitier_architecture#Three-tier_architecture) architecture:
    - (1) persistence tier (e.g., [Amazon DynamoDB](https://aws.amazon.com/dynamodb) / [RDS](https://aws.amazon.com/rds))
    - (2) application tier (e.g., REST API service in [Go](https://golang.org) / [Node.js](https://nodejs.org) / [Java](https://openjdk.java.net))
    - (3) client tier (e.g., [React](https://reactjs.org) app)

## Standardization, Discoverability, Documentation (be others-centered)

![](https://static.slab.com/prod/uploads/qist5ogo/posts/images/CcgUOxal47GvAwiy-cjfLokY.svg?jwt=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJodHRwczovL3NsYWJzdGF0aWMuY29tIiwiZXhwIjoxNzg3OTYxNTA1LCJpYXQiOjE3ODY3NTE5MDUsImlzcyI6Imh0dHBzOi8vYXBwLnNsYWIuY29tIiwianRpIjoiMzM1dDJwMWg4OTk4bms1ZDExOTMzOG0xIiwibmJmIjoxNzg2NzUxOTA1LCJwYXRoIjoicHJvZC9hc3NldHMvcWlzdDVvZ28vcG9zdC8wdW50Z3NhYSJ9.JKhP9BN-EdwMYLN5ALtXC1ywhBmLOTdS56Lx8UpTP74q-cRxPYRitMZ3uW-avf-1-K171KgjDmg1eFT2W2D-waUfSZflHdkvsbLm39Rvmwf09harr2tULWfSVw13k30ataswtvAm1fF551IJZPkIqkpc8t5Jt2_dMmFoxHBdVWucAoHwKpz8sunC9WJA7d636YxP58ETnBOIJ9Fl1CUE9hWy9FrC7BSHf2kYPlgmVOYv7wiOkqUa80XN0_3pfszRFD_JPCJbKlIi4wmaBZ_u4wu8Ky4CVXnmjm7ddSoXq8swtSjPwvcrH7GlDDskelO3s722L6vWS0jSlYaakSkF1g)

For consistency and discoverability, we want one standard way of doing things, one standard place to put things, and standard practices RE: documentation, testing, etc.

Unless adequate warrant exists for deviating, everything should be stored / hosted in our:

- [GracepointMinistries](https://github.com/GracepointMinistries) GitHub organization
- Gracepoint [AWS](https://aws.amazon.com), [GCP](https://cloud.google.com), [Azure](https://azure.microsoft.com) accounts

and accompanied by adequate documentation.

Storing / hosting things in non-discoverable locations (e.g., a personal GitHub / Dropbox / Heroku account) may be easy and cheap (often free) up front, but we pay a cost long term: you end up with [tribal knowledge](https://en.wikipedia.org/wiki/Tribal_knowledge), which makes it difficult to onboard new engineers, and frustrates outsiders who need to ask around and track down who's responsible for a particular project, and the project becomes increasingly reliant on its subject matter experts for maintenance / development.

Standardizing and organizing helps us reduce the [bus factor](http://en.wikipedia.org/wiki/Bus_factor), increases developer productivity and project sustainability, and it's very others-centered.

## Simplicity & Cost

![](https://static.slab.com/prod/uploads/qist5ogo/posts/images/taZV4RAQMMiDnXh3XZ1omjW7.svg?jwt=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJodHRwczovL3NsYWJzdGF0aWMuY29tIiwiZXhwIjoxNzg3OTYxNTA1LCJpYXQiOjE3ODY3NTE5MDUsImlzcyI6Imh0dHBzOi8vYXBwLnNsYWIuY29tIiwianRpIjoiMzM1dDJwMWg4OTk4bms1ZDExOTMzOG0xIiwibmJmIjoxNzg2NzUxOTA1LCJwYXRoIjoicHJvZC9hc3NldHMvcWlzdDVvZ28vcG9zdC8wdW50Z3NhYSJ9.JKhP9BN-EdwMYLN5ALtXC1ywhBmLOTdS56Lx8UpTP74q-cRxPYRitMZ3uW-avf-1-K171KgjDmg1eFT2W2D-waUfSZflHdkvsbLm39Rvmwf09harr2tULWfSVw13k30ataswtvAm1fF551IJZPkIqkpc8t5Jt2_dMmFoxHBdVWucAoHwKpz8sunC9WJA7d636YxP58ETnBOIJ9Fl1CUE9hWy9FrC7BSHf2kYPlgmVOYv7wiOkqUa80XN0_3pfszRFD_JPCJbKlIi4wmaBZ_u4wu8Ky4CVXnmjm7ddSoXq8swtSjPwvcrH7GlDDskelO3s722L6vWS0jSlYaakSkF1g)

We don't have the budget of a tech company, so need to optimize costs where possible. That usually will involve making some trade offs, discussed below.

# Technology Choices

## Source Control: Git, GitHub

![](https://static.slab.com/prod/uploads/qist5ogo/posts/images/Ajq-gwCNU0ve3s3CAbJQay6e.png?jwt=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJodHRwczovL3NsYWJzdGF0aWMuY29tIiwiZXhwIjoxNzg3OTYxNTA1LCJpYXQiOjE3ODY3NTE5MDUsImlzcyI6Imh0dHBzOi8vYXBwLnNsYWIuY29tIiwianRpIjoiMzM1dDJwMWg4OTk4bms1ZDExOTMzOG0xIiwibmJmIjoxNzg2NzUxOTA1LCJwYXRoIjoicHJvZC9hc3NldHMvcWlzdDVvZ28vcG9zdC8wdW50Z3NhYSJ9.JKhP9BN-EdwMYLN5ALtXC1ywhBmLOTdS56Lx8UpTP74q-cRxPYRitMZ3uW-avf-1-K171KgjDmg1eFT2W2D-waUfSZflHdkvsbLm39Rvmwf09harr2tULWfSVw13k30ataswtvAm1fF551IJZPkIqkpc8t5Jt2_dMmFoxHBdVWucAoHwKpz8sunC9WJA7d636YxP58ETnBOIJ9Fl1CUE9hWy9FrC7BSHf2kYPlgmVOYv7wiOkqUa80XN0_3pfszRFD_JPCJbKlIi4wmaBZ_u4wu8Ky4CVXnmjm7ddSoXq8swtSjPwvcrH7GlDDskelO3s722L6vWS0jSlYaakSkF1g)

All our source code is stored in GitHub, in the [GracepointMinistries](https://github.com/GracepointMinistries) organization.

## CI / CD: Drone

![](https://static.slab.com/prod/uploads/qist5ogo/posts/images/IZITiHOnfx4qns31ycxDH5Yg.png?jwt=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJodHRwczovL3NsYWJzdGF0aWMuY29tIiwiZXhwIjoxNzg3OTYxNTA1LCJpYXQiOjE3ODY3NTE5MDUsImlzcyI6Imh0dHBzOi8vYXBwLnNsYWIuY29tIiwianRpIjoiMzM1dDJwMWg4OTk4bms1ZDExOTMzOG0xIiwibmJmIjoxNzg2NzUxOTA1LCJwYXRoIjoicHJvZC9hc3NldHMvcWlzdDVvZ28vcG9zdC8wdW50Z3NhYSJ9.JKhP9BN-EdwMYLN5ALtXC1ywhBmLOTdS56Lx8UpTP74q-cRxPYRitMZ3uW-avf-1-K171KgjDmg1eFT2W2D-waUfSZflHdkvsbLm39Rvmwf09harr2tULWfSVw13k30ataswtvAm1fF551IJZPkIqkpc8t5Jt2_dMmFoxHBdVWucAoHwKpz8sunC9WJA7d636YxP58ETnBOIJ9Fl1CUE9hWy9FrC7BSHf2kYPlgmVOYv7wiOkqUa80XN0_3pfszRFD_JPCJbKlIi4wmaBZ_u4wu8Ky4CVXnmjm7ddSoXq8swtSjPwvcrH7GlDDskelO3s722L6vWS0jSlYaakSkF1g)

Our GitHub organization is follows a legacy billing plan (because of cost 🙃), so private repositories do not have access to [GitHub Actions](https://github.com/features/actions).

For CI / CD, we self-host [Drone](https://drone.io), a free, lightweight, container-native CI platform with declarative, YAML syntax for pipeline specification.

Drone is available at [https://build.gracepointonline.org](https://build.gracepointonline.org/), and access is federated by GitHub RBAC.

We have an old [Jenkins](https://www.jenkins.io) instance serving projects set up before Drone, but for new projects, please don't use it.

## Cloud Platform: AWS

![](https://static.slab.com/prod/uploads/qist5ogo/posts/images/_I0d44lc3hg7oPyziLaSogti.png?jwt=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJodHRwczovL3NsYWJzdGF0aWMuY29tIiwiZXhwIjoxNzg3OTYxNTA1LCJpYXQiOjE3ODY3NTE5MDUsImlzcyI6Imh0dHBzOi8vYXBwLnNsYWIuY29tIiwianRpIjoiMzM1dDJwMWg4OTk4bms1ZDExOTMzOG0xIiwibmJmIjoxNzg2NzUxOTA1LCJwYXRoIjoicHJvZC9hc3NldHMvcWlzdDVvZ28vcG9zdC8wdW50Z3NhYSJ9.JKhP9BN-EdwMYLN5ALtXC1ywhBmLOTdS56Lx8UpTP74q-cRxPYRitMZ3uW-avf-1-K171KgjDmg1eFT2W2D-waUfSZflHdkvsbLm39Rvmwf09harr2tULWfSVw13k30ataswtvAm1fF551IJZPkIqkpc8t5Jt2_dMmFoxHBdVWucAoHwKpz8sunC9WJA7d636YxP58ETnBOIJ9Fl1CUE9hWy9FrC7BSHf2kYPlgmVOYv7wiOkqUa80XN0_3pfszRFD_JPCJbKlIi4wmaBZ_u4wu8Ky4CVXnmjm7ddSoXq8swtSjPwvcrH7GlDDskelO3s722L6vWS0jSlYaakSkF1g)

Not much to be said here: AWS pretty much leads the pack in terms cloud providers.

Console access to our GP AWS account is [federated](https://aws.amazon.com/identity/federation) by GSuite.

## Container Technology: Docker

![](https://static.slab.com/prod/uploads/qist5ogo/posts/images/yFxYiRUx1AtRyAydv7mcYxKM.png?jwt=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJodHRwczovL3NsYWJzdGF0aWMuY29tIiwiZXhwIjoxNzg3OTYxNTA1LCJpYXQiOjE3ODY3NTE5MDUsImlzcyI6Imh0dHBzOi8vYXBwLnNsYWIuY29tIiwianRpIjoiMzM1dDJwMWg4OTk4bms1ZDExOTMzOG0xIiwibmJmIjoxNzg2NzUxOTA1LCJwYXRoIjoicHJvZC9hc3NldHMvcWlzdDVvZ28vcG9zdC8wdW50Z3NhYSJ9.JKhP9BN-EdwMYLN5ALtXC1ywhBmLOTdS56Lx8UpTP74q-cRxPYRitMZ3uW-avf-1-K171KgjDmg1eFT2W2D-waUfSZflHdkvsbLm39Rvmwf09harr2tULWfSVw13k30ataswtvAm1fF551IJZPkIqkpc8t5Jt2_dMmFoxHBdVWucAoHwKpz8sunC9WJA7d636YxP58ETnBOIJ9Fl1CUE9hWy9FrC7BSHf2kYPlgmVOYv7wiOkqUa80XN0_3pfszRFD_JPCJbKlIi4wmaBZ_u4wu8Ky4CVXnmjm7ddSoXq8swtSjPwvcrH7GlDDskelO3s722L6vWS0jSlYaakSkF1g)

We use [Docker](https://www.docker.com) as our image format and container runtime because of its ubiquity and ease of use.

Though [Amazon ECS](https://aws.amazon.com/ecs), [EKS](https://aws.amazon.com/eks), and [ECR](https://aws.amazon.com/ecr) support any [OCI](https://opencontainers.org)-compatible image format and container runtime, we've gone with Docker.

## Container Orchestration: Amazon ECS

![](https://static.slab.com/prod/uploads/qist5ogo/posts/images/mrmnox7KrRMCTb62iy6t0Uzo.png?jwt=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJodHRwczovL3NsYWJzdGF0aWMuY29tIiwiZXhwIjoxNzg3OTYxNTA1LCJpYXQiOjE3ODY3NTE5MDUsImlzcyI6Imh0dHBzOi8vYXBwLnNsYWIuY29tIiwianRpIjoiMzM1dDJwMWg4OTk4bms1ZDExOTMzOG0xIiwibmJmIjoxNzg2NzUxOTA1LCJwYXRoIjoicHJvZC9hc3NldHMvcWlzdDVvZ28vcG9zdC8wdW50Z3NhYSJ9.JKhP9BN-EdwMYLN5ALtXC1ywhBmLOTdS56Lx8UpTP74q-cRxPYRitMZ3uW-avf-1-K171KgjDmg1eFT2W2D-waUfSZflHdkvsbLm39Rvmwf09harr2tULWfSVw13k30ataswtvAm1fF551IJZPkIqkpc8t5Jt2_dMmFoxHBdVWucAoHwKpz8sunC9WJA7d636YxP58ETnBOIJ9Fl1CUE9hWy9FrC7BSHf2kYPlgmVOYv7wiOkqUa80XN0_3pfszRFD_JPCJbKlIi4wmaBZ_u4wu8Ky4CVXnmjm7ddSoXq8swtSjPwvcrH7GlDDskelO3s722L6vWS0jSlYaakSkF1g)

[Amazon ECS](https://aws.amazon.com/ecs) for simplicity, flexibility, and cost.

We have a few stateful workloads ([Jenkins](https://build-poc.gracepointonline.org), [Discourse](https://vine.gracepointonline.org)), so our ECS cluster is backed by [Amazon EC2](https://aws.amazon.com/ec2) instances.

With the introduction of [AWS EFS](https://aws.amazon.com/efs)-integration for [AWS Fargate](https://aws.amazon.com/fargate), we may look into migrating our compute over from EC2.

At this time we're not using[ EKS](https://aws.amazon.com/eks) for cost reasons ($144/month for a managed control plane before considering compute costs).

## IaC: Terraform

![](https://static.slab.com/prod/uploads/qist5ogo/posts/images/XUae37QvfiP87vWhiS9ehGzK.png?jwt=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJodHRwczovL3NsYWJzdGF0aWMuY29tIiwiZXhwIjoxNzg3OTYxNTA1LCJpYXQiOjE3ODY3NTE5MDUsImlzcyI6Imh0dHBzOi8vYXBwLnNsYWIuY29tIiwianRpIjoiMzM1dDJwMWg4OTk4bms1ZDExOTMzOG0xIiwibmJmIjoxNzg2NzUxOTA1LCJwYXRoIjoicHJvZC9hc3NldHMvcWlzdDVvZ28vcG9zdC8wdW50Z3NhYSJ9.JKhP9BN-EdwMYLN5ALtXC1ywhBmLOTdS56Lx8UpTP74q-cRxPYRitMZ3uW-avf-1-K171KgjDmg1eFT2W2D-waUfSZflHdkvsbLm39Rvmwf09harr2tULWfSVw13k30ataswtvAm1fF551IJZPkIqkpc8t5Jt2_dMmFoxHBdVWucAoHwKpz8sunC9WJA7d636YxP58ETnBOIJ9Fl1CUE9hWy9FrC7BSHf2kYPlgmVOYv7wiOkqUa80XN0_3pfszRFD_JPCJbKlIi4wmaBZ_u4wu8Ky4CVXnmjm7ddSoXq8swtSjPwvcrH7GlDDskelO3s722L6vWS0jSlYaakSkF1g)

We run [Terraform](https://www.terraform.io) from directly within Drone for provisioning cloud infrastructure.

State files are stored in [Amazon S3](https://aws.amazon.com/s3).

## Secrets: SOPS

![](https://static.slab.com/prod/uploads/qist5ogo/posts/images/JCQ4l0W2hMJj9tNkDgzXu59x.svg?jwt=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJodHRwczovL3NsYWJzdGF0aWMuY29tIiwiZXhwIjoxNzg3OTYxNTA1LCJpYXQiOjE3ODY3NTE5MDUsImlzcyI6Imh0dHBzOi8vYXBwLnNsYWIuY29tIiwianRpIjoiMzM1dDJwMWg4OTk4bms1ZDExOTMzOG0xIiwibmJmIjoxNzg2NzUxOTA1LCJwYXRoIjoicHJvZC9hc3NldHMvcWlzdDVvZ28vcG9zdC8wdW50Z3NhYSJ9.JKhP9BN-EdwMYLN5ALtXC1ywhBmLOTdS56Lx8UpTP74q-cRxPYRitMZ3uW-avf-1-K171KgjDmg1eFT2W2D-waUfSZflHdkvsbLm39Rvmwf09harr2tULWfSVw13k30ataswtvAm1fF551IJZPkIqkpc8t5Jt2_dMmFoxHBdVWucAoHwKpz8sunC9WJA7d636YxP58ETnBOIJ9Fl1CUE9hWy9FrC7BSHf2kYPlgmVOYv7wiOkqUa80XN0_3pfszRFD_JPCJbKlIi4wmaBZ_u4wu8Ky4CVXnmjm7ddSoXq8swtSjPwvcrH7GlDDskelO3s722L6vWS0jSlYaakSkF1g)

CI / deployment secrets (e.g., sensitive Terraform variables) are stored directly in repo with [Mozilla SOPS](https://github.com/mozilla/sops), which encrypts secrets using [AWS KMS](https://aws.amazon.com/kms).

At present, this is a lot simpler / cheaper than something like [HashiCorp Vault](https://www.hashicorp.com/products/vault).

# Base Infrastructure

![](https://static.slab.com/prod/uploads/qist5ogo/posts/images/JUAaX-60MELaO4XkXYtUJIqv.svg?jwt=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJodHRwczovL3NsYWJzdGF0aWMuY29tIiwiZXhwIjoxNzg3OTYxNTA1LCJpYXQiOjE3ODY3NTE5MDUsImlzcyI6Imh0dHBzOi8vYXBwLnNsYWIuY29tIiwianRpIjoiMzM1dDJwMWg4OTk4bms1ZDExOTMzOG0xIiwibmJmIjoxNzg2NzUxOTA1LCJwYXRoIjoicHJvZC9hc3NldHMvcWlzdDVvZ28vcG9zdC8wdW50Z3NhYSJ9.JKhP9BN-EdwMYLN5ALtXC1ywhBmLOTdS56Lx8UpTP74q-cRxPYRitMZ3uW-avf-1-K171KgjDmg1eFT2W2D-waUfSZflHdkvsbLm39Rvmwf09harr2tULWfSVw13k30ataswtvAm1fF551IJZPkIqkpc8t5Jt2_dMmFoxHBdVWucAoHwKpz8sunC9WJA7d636YxP58ETnBOIJ9Fl1CUE9hWy9FrC7BSHf2kYPlgmVOYv7wiOkqUa80XN0_3pfszRFD_JPCJbKlIi4wmaBZ_u4wu8Ky4CVXnmjm7ddSoXq8swtSjPwvcrH7GlDDskelO3s722L6vWS0jSlYaakSkF1g)

A base layer has been set up with Terraform, upon which further deployments may be layered. On application with Terraform, this base layer outputs state which is later referenced by app / service layers through the use of [Terraform modules](https://www.terraform.io/docs/modules/index.html).

The architecture of this base layer is described herein.

## Repo

![](https://static.slab.com/prod/uploads/qist5ogo/posts/images/SW9O9_bdwXUvba1XJpTMJviP.png?jwt=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJodHRwczovL3NsYWJzdGF0aWMuY29tIiwiZXhwIjoxNzg3OTYxNTA1LCJpYXQiOjE3ODY3NTE5MDUsImlzcyI6Imh0dHBzOi8vYXBwLnNsYWIuY29tIiwianRpIjoiMzM1dDJwMWg4OTk4bms1ZDExOTMzOG0xIiwibmJmIjoxNzg2NzUxOTA1LCJwYXRoIjoicHJvZC9hc3NldHMvcWlzdDVvZ28vcG9zdC8wdW50Z3NhYSJ9.JKhP9BN-EdwMYLN5ALtXC1ywhBmLOTdS56Lx8UpTP74q-cRxPYRitMZ3uW-avf-1-K171KgjDmg1eFT2W2D-waUfSZflHdkvsbLm39Rvmwf09harr2tULWfSVw13k30ataswtvAm1fF551IJZPkIqkpc8t5Jt2_dMmFoxHBdVWucAoHwKpz8sunC9WJA7d636YxP58ETnBOIJ9Fl1CUE9hWy9FrC7BSHf2kYPlgmVOYv7wiOkqUa80XN0_3pfszRFD_JPCJbKlIi4wmaBZ_u4wu8Ky4CVXnmjm7ddSoXq8swtSjPwvcrH7GlDDskelO3s722L6vWS0jSlYaakSkF1g)

[https://github.com/GracepointMinistries/apps-infrastructure](https://github.com/GracepointMinistries/apps-infrastructure)

## High Level Diagram

![double click to zoom in](https://static.slab.com/prod/uploads/qist5ogo/posts/images/dzJ0_ojE-CZiT58Pheuln80l.png?jwt=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJodHRwczovL3NsYWJzdGF0aWMuY29tIiwiZXhwIjoxNzg3OTYxNTA1LCJpYXQiOjE3ODY3NTE5MDUsImlzcyI6Imh0dHBzOi8vYXBwLnNsYWIuY29tIiwianRpIjoiMzM1dDJwMWg4OTk4bms1ZDExOTMzOG0xIiwibmJmIjoxNzg2NzUxOTA1LCJwYXRoIjoicHJvZC9hc3NldHMvcWlzdDVvZ28vcG9zdC8wdW50Z3NhYSJ9.JKhP9BN-EdwMYLN5ALtXC1ywhBmLOTdS56Lx8UpTP74q-cRxPYRitMZ3uW-avf-1-K171KgjDmg1eFT2W2D-waUfSZflHdkvsbLm39Rvmwf09harr2tULWfSVw13k30ataswtvAm1fF551IJZPkIqkpc8t5Jt2_dMmFoxHBdVWucAoHwKpz8sunC9WJA7d636YxP58ETnBOIJ9Fl1CUE9hWy9FrC7BSHf2kYPlgmVOYv7wiOkqUa80XN0_3pfszRFD_JPCJbKlIi4wmaBZ_u4wu8Ky4CVXnmjm7ddSoXq8swtSjPwvcrH7GlDDskelO3s722L6vWS0jSlYaakSkF1g)

## On Regions / Availability Zones

![](https://static.slab.com/prod/uploads/qist5ogo/posts/images/pIcDmBeSY99kfOdhvPrgF0bd.svg?jwt=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJodHRwczovL3NsYWJzdGF0aWMuY29tIiwiZXhwIjoxNzg3OTYxNTA1LCJpYXQiOjE3ODY3NTE5MDUsImlzcyI6Imh0dHBzOi8vYXBwLnNsYWIuY29tIiwianRpIjoiMzM1dDJwMWg4OTk4bms1ZDExOTMzOG0xIiwibmJmIjoxNzg2NzUxOTA1LCJwYXRoIjoicHJvZC9hc3NldHMvcWlzdDVvZ28vcG9zdC8wdW50Z3NhYSJ9.JKhP9BN-EdwMYLN5ALtXC1ywhBmLOTdS56Lx8UpTP74q-cRxPYRitMZ3uW-avf-1-K171KgjDmg1eFT2W2D-waUfSZflHdkvsbLm39Rvmwf09harr2tULWfSVw13k30ataswtvAm1fF551IJZPkIqkpc8t5Jt2_dMmFoxHBdVWucAoHwKpz8sunC9WJA7d636YxP58ETnBOIJ9Fl1CUE9hWy9FrC7BSHf2kYPlgmVOYv7wiOkqUa80XN0_3pfszRFD_JPCJbKlIi4wmaBZ_u4wu8Ky4CVXnmjm7ddSoXq8swtSjPwvcrH7GlDDskelO3s722L6vWS0jSlYaakSkF1g)

Most of our resources are located in one [region](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-regions-availability-zones.html) for cost / standardization reasons, and [us-east-1](https://console.aws.amazon.com/console/home?region=us-east-1) is most feature complete in AWS' offerings, so everything lives there.

## VPC / Network

![](https://static.slab.com/prod/uploads/qist5ogo/posts/images/0bjrVhqK4D1QcJLUeWthwFfi.png?jwt=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJodHRwczovL3NsYWJzdGF0aWMuY29tIiwiZXhwIjoxNzg3OTYxNTA1LCJpYXQiOjE3ODY3NTE5MDUsImlzcyI6Imh0dHBzOi8vYXBwLnNsYWIuY29tIiwianRpIjoiMzM1dDJwMWg4OTk4bms1ZDExOTMzOG0xIiwibmJmIjoxNzg2NzUxOTA1LCJwYXRoIjoicHJvZC9hc3NldHMvcWlzdDVvZ28vcG9zdC8wdW50Z3NhYSJ9.JKhP9BN-EdwMYLN5ALtXC1ywhBmLOTdS56Lx8UpTP74q-cRxPYRitMZ3uW-avf-1-K171KgjDmg1eFT2W2D-waUfSZflHdkvsbLm39Rvmwf09harr2tULWfSVw13k30ataswtvAm1fF551IJZPkIqkpc8t5Jt2_dMmFoxHBdVWucAoHwKpz8sunC9WJA7d636YxP58ETnBOIJ9Fl1CUE9hWy9FrC7BSHf2kYPlgmVOYv7wiOkqUa80XN0_3pfszRFD_JPCJbKlIi4wmaBZ_u4wu8Ky4CVXnmjm7ddSoXq8swtSjPwvcrH7GlDDskelO3s722L6vWS0jSlYaakSkF1g)

### Subnets

All of our networked resources (e.g., [Amazon EC2](https://aws.amazon.com/ec2), [RDS](https://aws.amazon.com/rds), [ElastiCache](https://aws.amazon.com/elasticache)) reside in a few public subnets due to the cost involved in running a [NAT gateway](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html).

[Security groups](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_SecurityGroups.html) with proper ingress and egress rules must be used correctly to secure our VPC.

### Security Groups

We utilize a relatively simple security group model, with two main security groups:

| Security Group                                                                                                            | For                                                                                                                               | Ingress / Egress                                                                          |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [`apps`](https://console.aws.amazon.com/ec2/v2/home?region=us-east-1#SecurityGroup:groupId=sg-048bedcd626a5730a)          | application hosts                                                                                                                 | Permits SSH access on port 22 to the entire internet (see below for security explanation) |
| [`apps-internal`](https://console.aws.amazon.com/ec2/v2/home?region=us-east-1#SecurityGroup:groupId=sg-09656f13e2f885361) | internal communication between hosts, RDS, ElastiCache, etc., and connecting internet-facing load balancers to internal resources | Permits TCP traffic on all ports to other members of apps-internal                        |
| [`apps-ingress`](https://console.aws.amazon.com/ec2/v2/home?region=us-east-1#SecurityGroup:groupId=sg-0fa2cc3d55c2dc991)  | internet-facing resources                                                                                                         | Permits all traffic on HTTP/S ports                                                       |

Obviously, this could be improved and further secured, which is something we may do in the future.

### SSH Access

SSH public keys are pulled from the GitHub profiles of members of the [GracepointMinistries/infras](https://github.com/orgs/GracepointMinistries/teams/infras) team and baked into the AMI at build time.

Apps host instances are open to SSH traffic from the internet, which at the moment strikes an appropriate balance between cost, simplicity, and mitigating risk.

More robust / secure solutions (like proper network segregation on private subnets with NAT gateways to public facing load balancers, [bastion hosts](https://aws.amazon.com/blogs/security/how-to-record-ssh-sessions-established-through-a-bastion-host), and [certificate-based SSH auth](https://engineering.fb.com/security/scalable-and-secure-access-with-ssh)) present complexity and cost issues.

[Netflix's BLESS](https://github.com/Netflix/bless) service (or similar solutions other tech companies use) for running a certificate authority to sign and issue short-lived SSH certificates on-demand is cool, but requires a lot of complexity, including managing PKI and running a separate control plane AWS account to host the service.

### Load Balancing

A single [application load balancer](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/introduction.html) `apps-alb` serves internet requests and forwards them based on subdomain rules to the correct [target group](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-target-groups.html), which then forwards requests to the correct ECS service.

Each service gets a target group and [ALB listener rule](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-listeners.html).

The base ALB also redirects HTTP traffic to HTTPS, and uses a `*.gracepointonline` TLS certificate provided by [Amazon Certificate Manager](https://aws.amazon.com/certificate-manager) for TLS. TLS is not typically end-to-end, but terminates at the load balancer. This is for cost / simplicity reasons: developers may write services that interact over HTTP, and trust the load balancer to handle TLS.

The base ALB also comes with [Amazon Cognito](https://aws.amazon.com/cognito)-based authentication capabilities for gpmail authentication.

## Compute

![](https://static.slab.com/prod/uploads/qist5ogo/posts/images/dWc7vaV8hgjokKOk_Adu2mM4.png?jwt=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJodHRwczovL3NsYWJzdGF0aWMuY29tIiwiZXhwIjoxNzg3OTYxNTA1LCJpYXQiOjE3ODY3NTE5MDUsImlzcyI6Imh0dHBzOi8vYXBwLnNsYWIuY29tIiwianRpIjoiMzM1dDJwMWg4OTk4bms1ZDExOTMzOG0xIiwibmJmIjoxNzg2NzUxOTA1LCJwYXRoIjoicHJvZC9hc3NldHMvcWlzdDVvZ28vcG9zdC8wdW50Z3NhYSJ9.JKhP9BN-EdwMYLN5ALtXC1ywhBmLOTdS56Lx8UpTP74q-cRxPYRitMZ3uW-avf-1-K171KgjDmg1eFT2W2D-waUfSZflHdkvsbLm39Rvmwf09harr2tULWfSVw13k30ataswtvAm1fF551IJZPkIqkpc8t5Jt2_dMmFoxHBdVWucAoHwKpz8sunC9WJA7d636YxP58ETnBOIJ9Fl1CUE9hWy9FrC7BSHf2kYPlgmVOYv7wiOkqUa80XN0_3pfszRFD_JPCJbKlIi4wmaBZ_u4wu8Ky4CVXnmjm7ddSoXq8swtSjPwvcrH7GlDDskelO3s722L6vWS0jSlYaakSkF1g)

### ECS

A single [Amazon ECS](https://aws.amazon.com/ecs) cluster named `apps` hosts all our apps (including Drone).

Deployments create / update an ECS task for each service / app with a desired replica count of `1` and a max count of 200% for simple blue-green deployments.

### EC2

The ECS cluster runs on a single [Amazon EC2](https://aws.amazon.com/ec2) instance (no [autoscaling group](https://docs.aws.amazon.com/autoscaling/ec2/userguide/AutoScalingGroup.html)—again, cost). The [r5a.large](https://aws.amazon.com/ec2/instance-types/r5) size was selected for cost / performance.

The instance runs a custom [ECS-optimized](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-optimized_AMI.html) [Amazon Linux 2](https://aws.amazon.com/amazon-linux-2) [AMI](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/AMIs.html) built with [Packer](https://www.packer.io) (see below).

### Serverless Workloads

TODO

## Persistence

### S3

TODO

### RDS

TODO

## Identity and Access Management

### Federated IAM Roles for Developers

TODO

### Amazon Cognito for gpmail SSO

TODO

# Apps

TODO
