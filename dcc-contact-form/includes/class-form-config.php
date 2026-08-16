<?php
namespace DCC_Contact;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Server-side registry of per-widget form configuration.
 *
 * The submission endpoint must never trust the recipient address, subject,
 * field definitions or spam toggles coming from the browser — a spammer could
 * rewrite the "To" address and turn the form into an open relay. So on render
 * the widget saves its resolved config here, keyed by the Elementor element id,
 * and the form only posts that id back. The endpoint reloads the trusted copy.
 *
 * Configs are kept in one autoloaded option (bounded by the number of form
 * instances on the site) and only rewritten when the resolved config actually
 * changes, so cached page hits — which re-run render rarely — cause no churn.
 */
final class Form_Config
{
    public const OPTION = 'dcc_contact_form_configs';

    /**
     * Persist (only if changed) and return the storage key for this instance.
     */
    public static function save(string $form_id, array $config): string
    {
        $form_id = self::normalize_id($form_id);
        $all = self::all();

        $new = wp_json_encode($config);
        $old = isset($all[$form_id]) ? wp_json_encode($all[$form_id]) : null;

        if ($new !== $old) {
            $all[$form_id] = $config;
            update_option(self::OPTION, $all, false);
        }

        return $form_id;
    }

    public static function get(string $form_id): ?array
    {
        $form_id = self::normalize_id($form_id);
        $all = self::all();
        return isset($all[$form_id]) && is_array($all[$form_id]) ? $all[$form_id] : null;
    }

    private static function all(): array
    {
        $all = get_option(self::OPTION, []);
        return is_array($all) ? $all : [];
    }

    private static function normalize_id(string $form_id): string
    {
        $form_id = preg_replace('/[^A-Za-z0-9_-]/', '', $form_id) ?? '';
        return substr($form_id, 0, 64);
    }
}
