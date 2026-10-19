# SearXNG 2026.10.17-1c10abe2d, official linux/amd64 image.
FROM ghcr.io/searxng/searxng@sha256:2fc7a1ee644edac36b7ab2b7885b83b991720da8d81a03838ddf8c228893ca4e
COPY --chown=977:977 deployment/searxng/settings.yml /etc/searxng/settings.yml
COPY --chown=977:977 deployment/searxng/gateway.py /opt/modax-search/gateway.py
COPY --chown=977:977 deployment/searxng/app.py /opt/modax-search/modax_search_app.py
COPY --chown=977:977 deployment/searxng/start.sh /opt/modax-search/start.sh
COPY deployment/searxng/LICENSE /opt/modax-search/LICENSE
ENV PYTHONPATH=/opt/modax-search:/usr/local/searxng \
    SEARXNG_SETTINGS_PATH=/etc/searxng/settings.yml \
    GRANIAN_WORKERS=1 GRANIAN_BLOCKING_THREADS=4 GRANIAN_BACKPRESSURE=4
USER 977:977
EXPOSE 8080
ENTRYPOINT ["/bin/sh", "/opt/modax-search/start.sh"]
