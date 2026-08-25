<?php
// No persistent options or transients are stored, so there is nothing to clean
// up on uninstall. This file exists so WordPress doesn't fall back to the
// (unsafe) per-plugin uninstall hook.
if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}
