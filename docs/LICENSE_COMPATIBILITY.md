# License compatibility policy

This draft proposes MIT for the original MODAX foundation code. Original procedural meshes and scripts do not reuse proprietary game assets. No reference source code or model weights have been imported. Repository-owner review is required before merging this license proposal.

Source and model licenses are separate. The reference audit links exact commits. A server adapter is not a redistribution license for model weights or third-party code. ComfyUI remains an independent external service: GPL obligations must be assessed for any future modifications/bundling/combined distribution. This separation is an architectural choice, not a blanket legal conclusion that all deployments have no obligations. Tencent Hunyuan license terms include territorial scope restrictions; no weights are admitted here. LTX source license does not automatically establish rights to every checkpoint. MIT reference code, if later imported, must retain applicable notices.

Before admitting a model/service package: record commit/checkpoint hash, separate source and weights licenses, intended territory/use/distribution, dependencies, required attribution, custom-node trust, hardware, and standalone integration results. Incompatible or unresolved packages remain blocked. No trained weights or proprietary world-model adapters exist in this release.

## SearXNG service exception,2026-10-19

The older no-bundled-reference-source statement applies to original MODAX modules, not the new independent deployment/searxng service. Its official pinned image includes SearXNG (container labels AGPL-3.0-or-later); original wrapper files are explicitly AGPL-3.0-only and include full upstream LICENSE. Public /source links offer corresponding service/source and exact upstream commit. Keep source access/notices when modifying/distributing. MODAX communicates through HTTP and does not import SearXNG in its process. Separation is not a blanket legal determination; review applicable obligations before redistribution or closing source. No model weights included.
