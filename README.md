# thrift-store

<!--
    [![build status][build-png]][build]
    [![Coverage Status][cover-png]][cover]
    [![Davis Dependency status][dep-png]][dep]
-->

<!-- [![NPM][npm-png]][npm] -->

A CLI for managing thrift IDL files

## Introduction

`thrift-store` provides a "package manager" for thrift interfaces.
It comes with two CLI commands, `thrift-store-daemon` and `thrift-store`.

## Motivation

 - The source of truth for a service should live with the service.
    You want the thrift definition to be checked into the repository
 - Every service needs a copy of the thrift definition for any service
    That it wants to talk too. This definition should be static. You
    do not want it to change at run-time.
 - There should only be one version of the world. Your company runs at
    a single version in production; all the files should ultimately be
    under one version.
 - The one version should be live. Developers should not manually publish
    new versions; instead we should just take `master` as the source of
    truth.

### As a client: `thrift-get`

As a developer I want to be able to talk to other services;
To do this I need to find their Thrift interface definitions.

I can run `thrift-get list` to show all available services
and their IDL files.

If I want to download one of these files I can
`thrift-get fetch {service}` and it will fetch the IDL file into
`./thrift/{service}.thrift`.

Once you fetch your first service we also write the
`./thrift/meta.json` meta file that contains the version of
the file as well as the time it was last changed.

All thrift files are under one version; If you want to update
to the latest version just run `thrift-get update` and it will
update all thrift files to the latest version as well as updating
the `./thrift/meta.json`.

Since the thrift definitions define the interfaces of the services
in production, there is only one version for all files. When you
update anything, you update everything to the current version.

### As a server:

If your developing the backend for a new service you just have
to commit the thrift definition into git; by convention we place
it in `./thrift/service.thrift`.

The `thrift-store-daemon` will fetch it and put it in the repository.

### As an adminstrator: `thrift-store-daemon`

To set up the thrift interface repository you can run the
`thrift-store-daemon`. You just run `thrift-store-daemon --config-file={path}`
and it will populate the thrift remote repository.

The config file contains the following fields

```json
{
    "upstream": "git+ssh://git@github.com/my-company/thrift-files",
    "repositoryFolder": "/var/lib/my-company/thrift-store/repo",
    "cacheLocation": "/var/lib/my-company/thrift-store/cache",
    "remotes": [{
        "repository": "git+ssh://git@github.com/my-company/user-service",
        "branch": "master",
        "thriftFile": "thrift/service.thrift"
    }, {
        "repository": "git+ssh://git@github.com/my-company/product-service",
        "branch": "master",
        "thriftFile": "thrift/service.thrift"
    }]
}
```

The `thrift-store-daemon` will fetch all the remotes and place their thrift
files in the `upstream` repository. You can use `thrift-store install` to
fetch from the upstream repository.

## TODO:

This project is not done yet:

 - [x] Implement `thrift-store` config loader (i.e. load .rc file from ~/)
 - [x] Implement fetching from `remotes` into `upstream`
 - [x] Make `thrift-store` a repeating cron job
 - [x] Support `main` file in config to indicate service entry point.
 - [x] Support `branch` in config.

## Installation

`npm install thrift-store --global`

## Tests

`npm test`

## Contributors

 - Raynos (Jake Verbaten)
 - malandrew (Andrew de Andrade)

## MIT Licensed

  [build-png]: https://secure.travis-ci.org/uber/thrift-store.png
  [build]: https://travis-ci.org/uber/thrift-store
  [cover-png]: https://coveralls.io/repos/uber/thrift-store/badge.png
  [cover]: https://coveralls.io/r/uber/thrift-store
  [dep-png]: https://david-dm.org/uber/thrift-store.png
  [dep]: https://david-dm.org/uber/thrift-store
  [npm-png]: https://nodei.co/npm/thrift-store.png?stars&downloads
  [npm]: https://nodei.co/npm/thrift-store
