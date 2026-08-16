<?php
/**
 * Uninstall handler for DCC Contact Form.
 *
 * By design this plugin does NOT delete its data on uninstall — matching the
 * site's WPForms posture ("don't delete data on uninstall"). Submissions, the
 * custom table, saved settings and per-form configuration are all preserved so
 * an accidental delete-and-reinstall never loses the owner's contact history.
 *
 * To remove everything manually, drop the {$prefix}dcc_contact_entries table and
 * delete the dcc_contact_settings, dcc_contact_form_configs and
 * dcc_contact_db_version options.
 */

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

// Intentionally a no-op. See the file docblock above.
