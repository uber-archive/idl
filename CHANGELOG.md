
# (unreleased)

- Remove dependency on a pty. We no longer need to scan the pty output
  for authentication warnings. The pty module does not support Node.js versions
  we still use, dating back to 0.10.

# v3.1.11 (2018-01-25)

- Fixes fetch and update in the absence of version tags. Both of these commands
  now update the snapshot of the idl registry to reflect the current master
  commit. It is no longer possible to fetch and receive a stale version of a
  service's IDL directory, since we fetch based on the current version instead
  of the version at the time of the last update.
- Fixes idl for Mac OS X High Sierra. This OS update breaks the pty.js library
  idl uses to hide git command output from the user while still being able to
  monitor the terminal output for PAM authentication prompts. Replacing this
  with node-pty, which is still maintained, addresses the problem.


# v3.1.10 (2017-11-29)

- Addresses a bug in collecting includes from multiple IDL files in the same
  directory. (@josiabgrace)
- Threads --git-debug flag, so we can see git log output when debugging. (@pvonr)


# v3.1.9 (2017-09-28)

- Fixes a bug where IDL would fail to update the cache repository. (@dnathe4th)
- Fixes a bug in displaying time since last IDL package sync. (@pvonr)
- Stops pushing timestamp tags.


# v3.1.8 (2017-07-24)

- Uses shallow clone and fetch to expedite all IDL commands that interact with
  their IDL registry. (@kriskowal)


# un-numbered release on master

- Filters yab files from IDL lists. (@prashantv)


# v3.1.7

- Fixes a bug when an IDL depends on another IDL that is not in the root of the
  dependency's repository path. (@ankits)


# v3.1.6


# v3.1.5

- Bug fix to address issues with EMFILE errors
  (back-off on depletion of file descriptors).
