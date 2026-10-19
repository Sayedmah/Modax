# SPDX-License-Identifier: AGPL-3.0-only
import os

from gateway import SearchGateway
from searx.webapp import app

application = SearchGateway(app, os.environ.get("MODAX_SEARCH_TOKEN", ""))
