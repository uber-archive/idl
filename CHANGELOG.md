
# (unreleased)

- No changes yet.


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
