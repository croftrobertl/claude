<?php
namespace DCCL;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Plugin options. Nothing here autoloads — the maps are only read on admin
 * screens, imports and report builds.
 */
final class Settings
{
    public const OPTION_MAPS   = 'dccl_channel_maps';
    public const OPTION_DELETE = 'dccl_delete_data_on_uninstall';
    public const OPTION_CACHE  = 'dccl_report_cache';

    /**
     * The packaged map for a channel, overlaid with any admin edits.
     *
     * @param array<string,string> $packaged
     * @return array<string,string>
     */
    public static function map(string $channel, array $packaged): array
    {
        $saved = get_option(self::OPTION_MAPS, []);
        if (!is_array($saved) || !isset($saved[$channel]) || !is_array($saved[$channel])) {
            return $packaged;
        }
        $overlay = [];
        foreach ($saved[$channel] as $id => $cottage) {
            $id      = trim((string) $id);
            $cottage = trim((string) $cottage);
            if ($id === '') {
                continue;
            }
            if ($cottage !== Cottages::EXCLUDED && !Cottages::is_cottage($cottage)) {
                continue;
            }
            $overlay[$id] = $cottage;
        }
        return $overlay === [] ? $packaged : $overlay;
    }

    /**
     * @param array<string,array<string,string>> $maps
     */
    public static function save_maps(array $maps): void
    {
        $clean = [];
        foreach (['bookingcom', 'vrbo'] as $channel) {
            if (!isset($maps[$channel]) || !is_array($maps[$channel])) {
                continue;
            }
            foreach ($maps[$channel] as $id => $cottage) {
                $id      = preg_replace('/[^0-9A-Za-z_-]/', '', (string) $id);
                $cottage = trim((string) $cottage);
                if ($id === '' || ($cottage !== Cottages::EXCLUDED && !Cottages::is_cottage($cottage))) {
                    continue;
                }
                $clean[$channel][$id] = $cottage;
            }
        }
        update_option(self::OPTION_MAPS, $clean, false);
        Reports::flush_cache();
    }

    public static function delete_data_on_uninstall(): bool
    {
        return (bool) get_option(self::OPTION_DELETE, false);
    }

    public static function set_delete_data_on_uninstall(bool $value): void
    {
        update_option(self::OPTION_DELETE, $value ? 1 : 0, false);
    }
}
