# Azure → RDS MySQL move: scripts

These scripts carry out `plans/aws-rds-migration.md`. They run on the Lightsail
box from `~/rds-migration/`, which is outside the repo so a deploy can't touch
them. Copy them there with `scp`. Every script reads Azure's settings from
`.env.production` (saved to `azure.env` before the switch) and RDS's settings
from `rds.env`.

Before touching a database, every script checks that the host really is the
server it should be (`*.mysql.database.azure.com` or `*.rds.amazonaws.com`).
Other guards:
- Azure is only ever read. The one exception is `copy.sh --reverse` (rollback
  R3), which asks you to type a confirmation first.
- Once production runs on RDS, `copy.sh` refuses to overwrite RDS.

| Step | Command | What it proves / does |
|---|---|---|
| S3 | `./backup-azure.sh pre_move` | Full Azure dump in `backups/`, with a `.sha256` file. Only reads Azure. |
| B2 | create `rds.env` (see `rds.env.example`) | The app password is generated on the box |
| B3 | `./setup-db.sh` | Creates the `serveloco` database and the `villkro_app` user. Asks for the master password at a hidden prompt. |
| B4 | `./check.sh` | TLS, grants, and every setting the app depends on, Azure vs RDS |
| C1 | `./copy.sh --dump backups/pre_move_*.sql.gz` | Loads the S3 backup into RDS, which also proves the backup restores |
| C2 | `./compare.sh --dump backups/pre_move_*.sql.gz` | RDS is identical to the backup: settings, orphans, data fingerprint |
| C3 | `./app-check.sh` | The app's own code reads the same results from both servers |
| C4/C5 | `./app-check.sh --rds-extra` | Writes work, and 30 pool connections open at once (RDS only) |
| C6 | `./migrate-test.sh` | `migrate.js` runs on RDS as the app user. Run it after C2 and C3. |
| C7 | `./deploy-dump-test.sh` | `deploy.yml`'s exact backup command works on RDS |
| D1 | `./precheck.sh` | No active orders, env settings OK, RDS reachable. Prints the UTC time. |
| D3 | `./connections.sh azure` | After the API stops, nothing from the app is left on Azure |
| D4 | `./copy.sh` | Final Azure dump (kept forever), loaded into RDS |
| D5 | `./compare.sh --live` | Azure (frozen) and RDS are identical: row counts too |
| D6 | `./app-check.sh` | Same as C3, at the frozen moment |
| D7 | `./switch-env.sh` | Changes only the `rds.env` settings in `.env.production`, after backing it up |
| D10 | `./connections.sh rds` then `./connections.sh azure` | The app is on RDS, and gone from Azure |
| Day +1 | `./compare.sh --dump backups/copy_azure_*.sql.gz --target azure` | Nothing wrote to Azure after the freeze |
| R1/R2 | `./rollback-env.sh`, then `docker compose -f docker-compose.prod.yml up -d api` | Puts the Azure settings back |
| R3 | `./copy.sh --reverse`, `./compare.sh --live`, `./rollback-env.sh` | RDS → Azure, carrying the orders placed on RDS |

A comparison exits 0 only when everything matches. When the data differs,
`compare.sh` names the tables and keeps both dumps in `backups/mismatch_*`.

## Rehearsing the scripts on a laptop

Set `MIG_TEST_MODE=1` to run everything against two local `mysqld` processes:
- "azure" on `127.0.0.1:3307`
- "rds" on `127.0.0.1:3308`

Test mode uses the local `mysql`/`mysqldump` binaries and `node` (with
`API_DIR` pointing at `apps/api`) in place of Docker. It only loosens the host
check to those two loopback ports, so it can never reach a real server. Also
set `REPO_DIR` to a folder holding a fake `apps/api/.env.production` that
points at 3307.
