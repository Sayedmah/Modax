# File delivery and dedicated sandbox (0.6.4)

The website accepts one UTF-8 `.py` or a source-only ZIP for an explicit `sandbox` task. Imported sources are saved unchanged and available as an owner-only ZIP or individual attachment. A terminal task has a downloadable JSON verification report with actual state/exit code/output. Generated Coder files get the same individual attachments/reports. No email/public sharing link or automatic model call is implied by file delivery.

Execution currently supports Python standard-library `unittest`, not arbitrary shell commands, package installation, JavaScript, browsers, native binaries or internet access. Include `test_*.py` tests. Zero discovered tests exits5; successful early process exit without the runner completion marker exits6. Test output remains untrusted; this is not independent proof that user-authored tests are sufficient or tamper-proof grading. Programs can use ephemeral `/tmp`; output files there are not returned. Source and stdout/report are the delivered artifacts.

## Dedicated host contract

Do not enable Docker access in the public MODAX API or mount a Docker socket there. Use a dedicated disposable VM with no production applications/provider keys/data. Keep the Docker daemon private; prefer an appropriately configured rootless daemon and maintain the host/kernel. Container isolation shares a host kernel and is not a VM security guarantee.

Install the MODAX Python package on that dedicated host, pre-pull the approved image and run a single worker process behind an authenticated HTTPS reverse proxy. Do not expose the worker's loopback listener or Docker API directly. The worker needs only its random shared token and approved image, not any model/GitHub/database credentials.

```
docker pull python@sha256:a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1
export MODAX_TEST_IMAGE=python@sha256:a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1
# Configure MODAX_SANDBOX_TOKEN through operator secret management (at least32characters).
python -m uvicorn modax.sandbox_worker:create_worker --factory --host 127.0.0.1 --port 8777 --workers 1 --limit-concurrency 8
```

This exact official Python image digest was obtained from Docker Hub's registry manifest on2026-10-19. It is an immutable multi-platform reference; CI pre-pulls it and runs actual isolation checks. No mutable image pull is allowed during submitted-code execution. Review/update the digest with CI when applying image security updates.

On MODAX configure server-only `MODAX_SANDBOX_URL=https://<approved-worker-origin>` and the matching `MODAX_SANDBOX_TOKEN`. Existing model/provider/search settings remain untouched. HTTPS is required except explicit loopback development HTTP. These settings never appear in browser capabilities or account export. Connectivity is checked per job; `configured` is not readiness certification.

Requests require explicit execution consent and transmit only bounded source files. The worker admits one active job and10requests/minute/process; body262144bytes,1..32files and120000source bytes. Each child container has network=none, non-root uid65534, read-only root/project mounts, no added capabilities/new privileges,256MiB memory+swap cap,oneCPU,64PIDs,128open files,16MiB noexec/nosuid `/tmp`,no host secret environment/socket,and60second/256KiB output limits. Docker health checks/log driver are disabled for these disposable runs. On timeout/output overflow the container is removed and partial output cannot be success. No source is imported on the worker host. Worker disconnects drain the bounded operation before releasing its slot/deleting staging.

The API's remote transport validates/bounds the result and does not follow redirects or forward user cookies/Authorization. Cancellation drains the transport; it does not remotely interrupt a running container immediately. A disconnected worker finishes under its own runtime deadline. No automatic repair/retry or costly inference occurs in the sandbox workflow.

## Current hosted status and validation

The existing Render Free Python service has no Docker execution worker. Merely deploying this feature does not activate hosted execution. The UI explicitly shows the missing worker; uploaded files remain downloadable and a requested run records BLOCKED instead of running code on the website host. No paid host or unrelated Oracle/Render service is provisioned. An operator-authorized dedicated Docker host must be connected before public-user execution can be enabled.

Local default tests mock transport/runtime contracts only. The separate `Dedicated Docker sandbox verification` workflow runs actual submitted fixture code inside the pinned restricted container, checks non-root/filesystem/network/environment/socket isolation, passes/failures/zero-test/early-exit handling. Main CI covers auth/owner downloads,upload bounds,consent,state/report persistence and real browser UI. See TEST_REPORT.md for actual execution results; do not infer a passing CI run from this document.

Official security references: https://docs.docker.com/engine/security/ , https://docs.docker.com/engine/network/drivers/none/ , https://docs.docker.com/reference/cli/docker/container/run/ .
