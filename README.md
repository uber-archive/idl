# idl

[![build status][build-png]][build]
[![Coverage Status][cover-png]][cover]
[![Davis Dependency status][dep-png]][dep]

[![NPM][npm-png]][npm]

A CLI for managing thrift IDL files

## Introduction

`idl` provides a "package manager" for thrift interfaces.
It comes with two CLI commands, `idl-daemon` and `idl`.

## Motivation

 - The source of truth for a service (the Thrift IDL file) should live
    with the service (i.e. the code repository).
    You want the thrift definition to be checked into the repository
 - Every service should keep a copy of the thrift definition for any
    service that it wants to talk too. This definition should be static.
    You do not want it to change at run-time, since that can result in
    mismatched interfaces that cause runtime exceptions and kill a
    process.
 - There should only be one version of the world. Your company runs at
    a single version of each service in production; all the Thrift IDL
    files representing the current version of every service in production
    should ultimately be treated as a single versioned collection. This
    versioned collection is the registry of all service definitions.
 - The one versioned collection should be live. Developers should not
    manually publish new versions; instead we should just take `master`
    containing the most recent Thrift IDL file for every service as the
    source of truth.
 - When service interface definitions are fetched and copied to a
    a project that consumes those services, they should be organized
    such that cross-service include/import statements are possible (i.e.
    the folder structure should support relative filepath import/include
    statements).

## The CLI

The CLI is currently broken down into two commands:
 - `idl` - CLI tool meant for end-users, but the publish command
     can also be run a continuous integration job when interface changes
     land in production (push-based publishing)
 - `idl-daemon` - daemonized process that can be configured to
     poll all service repositories for interface changes (pull-based
     publishing).

### `idl`

As a developer I want to be able to talk to other services;
To do this I need to find their Thrift interface definitions.

The `idl` CLI solves this need.

The `idl` CLI tool has the following sub-commands:
 - `idl list` - List all available services published to the
    registry.
 - `idl fetch <service-name>` - Fetch a particular service's idl
    and copy it to your project in a standard location.
 - `idl update` - Update all previously fetched services to the most
    recent versions. Note: You cannot pick and choose which services to
    update. This is intentional.
 - `idl publish` - Publish the Thrift IDL file for your service
    to the idl registry repository. This command should set up to be
    automatically executed when a change to the service IDL lands on
    `master` or when that change on `master` is deployed to production.

All commands follow the unix standard of being silent if successful. If
you would like more information about what is happening, run the CLI
with the `--verbose` flag.

#### `idl init`

This command will create a starter IDL file at the correct filepath in
a new service. You should use it if you've got a new service and want
to quickly scaffolder a simple thrift IDL file at the path expected
by the `idl publish` command.

Example:

    $ idl init
    $

#### `idl list`

This command will list all available services published to the registry.

Example:

    $ idl list
     - github.com:/foo/bar   2015-09-11T23:07:57.610Z
     - github.com:/foo/baz   2015-09-11T23:07:58.159Z
     - github.com:/qux/quux  2015-09-11T23:07:58.716Z
    $

#### `idl fetch <service-name>`

This command will fetch a particular service's idl file and copy it
to your project in a standard location.

Once you fetch your first service we also write the `./idl/meta.json`
meta file that contains the version of the registry as well as the time
it was last changed.

Note: Fetching a new service will result in an implicit update of any
services that have been fetched. For example, if you fetched service
`foo` a month ago and then fetch service `bar`, `idl` will
first update service foo to the most current version before fetching
`bar`.

This command will also update the ./idl/meta.json file in your
project.

Example:

    $ idl fetch github.com:/foo/bar
    $

#### `idl update`

This command will update all previously fetched services to the most
recent versions. Note: You cannot pick and choose which services to update. This is intentional.

Since the thrift definitions define the interfaces of the services
in production, there is only one version for all files. When you
update anything, you update everything to the current version.

This command will also update the ./idl/meta.json file in your
project.

Example.

    $ idl update
    $

#### `idl publish

This command will publish the Thrift IDL file for your service to the
idl registry repository. This command should set up to be
automatically executed when a change to the service IDL lands on
`master` or when that change on `master` is deployed to production.

Example:

    $ trift-store publish
    $

#### Command line flags

The `idl` CLI takes the following command line flags. The
first flag, `--repository`, is mandatory until this tool has .rc file
support.

 - `--repository=<git url>` - The `idl` command needs to
    know the git URL of the registry to be able to run any of the
    commands above. e.g. `--repository=git@github.com:foo/registry`
 - `--cacheDir=<path to cache dir>` - This is the path to the cache
    directory that `idl` should use. The default value is
    `~/.idl/`
 - `--cwd=<current working directory>` - The path to the current
    working directory in which to execute `idl`
 - `--verbose` - This tool follows the unix philosophy of being
    silent on success. Use this flag if you want to see output of
    what it is doing.
 - `--config=<path to config file>` - The path to a JSON config
    file that specifies any of the above properties.

#### Configuration

Internally `idl` uses [dominictarr/rc][dominictarr/rc] for
options configuration. This module helps with parsing configuration
from arguments specified at the command line, from environment
variables and from `.rc` files. It will probe the following locations:

Given your application name (`appname`), rc will look in all the obvious places for configuration.

  * command line arguments (parsed by [substack/minimist][substack/minimist])
  * environment variables prefixed with `IDL_`
    * or use "\_\_" to indicate nested properties <br/> _(e.g. `IDL_REGISTRY` => `github.com/some-org/some repo`)_
    * keys will automatically be camelCased to match the possible options
    above.
  * if you passed an option `--config file` then from that file
  * a local `.idlrc` or the first found looking in `./ ../ ../../ ../../../` etc.
  * `$HOME/.idlrc`
  * `$HOME/.idl/config`
  * `$HOME/.config/idl
  * `$HOME/.config/idl/config`
  * `/etc/idlrc`
  * `/etc/idl/config`

### The `./idl/` folder

All services and clients will have a `./idl/` folder at the root of
the repo. All thrift IDL files are contained in this folder.

Service authors need to understand how this folder is organized and
should only every edit/modify the thrift IDL files for the service in
question. Client authors should never have to edit/modify files in this
folder and should only use the files contained therein as references
for the interfaces they are consuming.

The idl folder is organized so that every thrift IDL file (for the
service being authored or the services being consumed) is located at a
sub-path that mirrors the git remote `origin` URL of a service.

When you execute `git remote -v` in your service's repository, you will
see output similar to one of the following:

    $ git remote -v
    origin  git@github.com:uber/foo-service.git (fetch)
    origin  git@github.com:uber/foo-service.git (push)

or

    $ git remote -v
    origin  ssh://git@github.com/uber/foo-service.git (fetch)
    origin  ssh://git@github.com/uber/foo-service.git (push)

The idl folder for your service mirrors these two addresses.
Assuming the output above, the idl path for the service
being authoring will be `./idl/github.com/uber/foo-service/`.
This folder will contain the thrift IDL files that will be
published to your idl registry repo when `idl publish`
is executed. The IDL files in this particular sub-folder are to be
manually managed by service authors.

All other folders are contain service defitions for services being
consumed and should not be edited/modified and should only be
consulted as a reference when looking up a type definition for a
service or a function definition for a service being consumed.

For service repositories, where the service is also a client of
other services, the unmanaged definitions for that service and
managed definitions for the services being consumed will live
side by side in sibling directories.

The reason for mixing both managed and unmanaged folders together
is to support relative filepath includes in thrift files.

For example, if the service git@github.com:foo/bar.git references
type definitions from the services git@github.com:foo/baz.git and
git@github.com:qux/quux.git, then you might see the following
folder and file structure:

    $ tree
    .
    └── idl
        ├── github.com
        │   ├── foo
        │   │   ├── bar
        │   │   │   └── bar.thrift
        │   │   └── baz
        │   │       └── baz.thrift
        │   └── qux
        │       └── quux
        │           └── quux.thrift
        └── meta.json

    7 directories, 4 files
    $

... and the `./idl/github.com/foo/bar/bar.thrift` would
contain the following includes in its header section:

    include "../baz/baz.thrift"
    include "../../qux/quux/quux.thrift"

The complexity of how this folder is organized is a necessary
evil to support relative file includes. If, in the future, the
`include` directive supports richer semantics, it may be possible
to simplify this directory, but for now it is what is is.

### `idl-daemon`

The `idl-daemon` will fetch all the remotes and place
their thrift files in the `upstream` repository. You can use
`idl fetch` to fetch from the upstream repository.

The `idl-daemon` is a command that should be run with
cron.

To set up the idl repository you can run the
`idl-daemon`. Run `idl-daemon --config-file={path}`
and it will populate the idl remote repository.

The config file contains the following fields

```json
{
    "upstream": "git+ssh://git@github.com/my-company/idl-registry",
    "repositoryFolder": "/var/lib/my-company/idl/repo",
    "cacheLocation": "/var/lib/my-company/idl/cache",
    "remotes": [{
        "repository": "git+ssh://git@github.com/my-company/user-service",
        "branch": "master"
    }, {
        "repository": "git+ssh://git@github.com/my-company/product-service",
        "branch": "master"
    }]
}
```

## TODO:

This project is not done yet:

 - [ ] Implicit update whenever `idl fetch` is run.
 - [ ] Implement `idl validate` so that service authors can locally
       validate the thrift IDL files for their service before publishing.
 - [ ] Implement `idl init` to automatically create a boilerplate
       thrift IDL file using the git URL of the remote origin.
 - [ ] Implement `idl config get <property>` to get a idl
       configuration property.
 - [ ] Implement `idl config set <property> <value>` to set a
       idl configuration property.
 - [ ] Implement fetching from `remotes` into `upstream`.
 - [ ] Support `main` file in config to indicate service entry point.
 - [ ] Support `branch` in config.
 - [ ] Disable `publish` command using a regex saved in the .rc file.

## Installation

`npm install idl --global`

## Tests

`npm test`

## Contributors

 - Raynos (Jake Verbaten)
 - malandrew (Andrew de Andrade)

## MIT Licensed

  [build-png]: https://secure.travis-ci.org/uber/idl.png
  [build]: https://travis-ci.org/uber/idl
  [cover-png]: https://coveralls.io/repos/uber/idl/badge.png
  [cover]: https://coveralls.io/r/uber/idl
  [dep-png]: https://david-dm.org/uber/idl.png
  [dep]: https://david-dm.org/uber/idl
  [npm-png]: https://nodei.co/npm/idl.png?stars&downloads
  [npm]: https://nodei.co/npm/idl
  [dominictarr/rc]: https://github.com/dominictarr/rc
  [substack/minimist]: https://github.com/substack/minimist
