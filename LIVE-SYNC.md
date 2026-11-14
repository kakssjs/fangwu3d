# Live source synchronization — 2026-11-14

Imported application source and public assets from `/opt/payment-release` on the production server into the existing repository. Includes the map and property location, English translation, boss user management, current project UI, and locally hosted interior images. Existing repository files and landing videos are retained. No dependencies added.

Excluded production databases, uploads, environment files, credentials, generated tests, and Next.js build directories. The GitHub repository is a source snapshot, not a database or deployment backup.

Validation: 11 regression tests passed locally; TypeScript checks passed locally and on the server. Production health and HTTPS home page returned 200. The initial server regression run was killed by the kernel for memory exhaustion; subsequent regression tests ran locally.

Maintenance: cleared approximately 161 MiB of apt package cache. Existing 2 GiB swap retained; changed vm.swappiness from 0 to 10 using `/etc/sysctl.d/90-irenovation-memory.conf`. No production service restart or database change was required. Revert the tuning by removing that file and setting vm.swappiness back to 0. Long-term memory behavior still needs observation.
