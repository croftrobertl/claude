<?php
namespace DCCR;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * The 8 cottage iCal exports, called in-process through MotoPress's own
 * exporter. An empty calendar is a valid file an OTA reads as "fully
 * available", which is exactly the failure this check exists to catch.
 */
final class Ical
{
    public const ROOMS = [1066, 1068, 1070, 1072, 1613, 1614, 1806, 1807];

    public static function available(): bool
    {
        return class_exists('\\MPHB\\iCal\\Exporter');
    }

    /**
     * @return array{ok:?bool,detail:string,rooms:array<int,int>} ok null = MotoPress not loaded (skipped)
     */
    public static function check(array $rooms = self::ROOMS): array
    {
        if (!self::available()) {
            return ['ok' => null, 'detail' => __('MotoPress exporter not loaded; iCal check skipped.', 'dcc-ragusa'), 'rooms' => []];
        }
        $counts = [];
        $empty  = [];
        foreach ($rooms as $room) {
            $ics = self::export((int) $room);
            $n   = $ics === null ? -1 : substr_count($ics, 'BEGIN:VEVENT');
            $counts[(int) $room] = $n;
            if ($n <= 0) {
                $empty[] = (int) $room;
            }
        }
        if ($empty === []) {
            /* translators: %d: number of rooms */
            return ['ok' => true, 'detail' => sprintf(__('All %d iCal exports carry events.', 'dcc-ragusa'), count($rooms)), 'rooms' => $counts];
        }
        return [
            'ok'     => false,
            /* translators: %s: room ids */
            'detail' => sprintf(__('iCal export empty or failed for room %s.', 'dcc-ragusa'), implode(', ', $empty)),
            'rooms'  => $counts,
        ];
    }

    /** Capture the exporter's output; swallow only the two header warnings. */
    public static function export(int $room_id): ?string
    {
        $class = '\\MPHB\\iCal\\Exporter';
        set_error_handler(static function (int $no, string $str): bool {
            if (($no & (E_WARNING | E_NOTICE)) && (str_contains($str, 'headers already sent') || str_contains($str, 'Cannot modify header'))) {
                return true;
            }
            return false;
        });
        ob_start();
        try {
            $exporter = new $class();
            $exporter->export($room_id);
            $out = (string) ob_get_clean();
        } catch (\Throwable $e) {
            ob_end_clean();
            $out = null;
        } finally {
            restore_error_handler();
        }
        return $out;
    }
}
