# Deploy AIX on Labs Playdev

Create a new app with these settings:

| Setting | Value |
| --- | --- |
| App name | `aix` |
| Docker image | `skos/dind:nodejs` (Playdev's offered Node.js image) |
| Repository URL | `https://github.com/sarafov/AIX.git` |
| Work directory | `AIX` |
| Startup command | `sh deploy/playdev-start.sh` |
| CPU | 2 cores |
| Memory | 4096 MB (build and runtime share this limit) |
| First exposed port | 3000, label `aix` |
| Additional exposed ports | None |
| Environment variables | None required |

The startup script provisions Python 3.12 with the official uv distribution
when necessary, installs locked dependencies, and builds Next.js for production.
It uses the persistent data directory beside the cloned repository (the current
image uses `/home/pwduser/data`) to reuse downloaded dependencies and the
production build on subsequent starts. The first start can take several minutes.
The image must include Node.js 20 or newer, npm, Git, tar, and curl or wget.

Only the dashboard's port 3000 is public. Python listens on `127.0.0.1:8000` and
the dashboard proxies `/api/py/*` to it. Both processes stop together if one
exits. The optional build setting `AIX_PYTHON_API_ORIGIN` leaves Vercel routing
unchanged when absent. Do not configure it in the existing Vercel project.

Model credentials are still supplied through the dashboard per session. Do not
add personal talent workbooks, project documents, or API keys to the repository.
Verify a demo estimation and an SLA document export after the app becomes ready.
