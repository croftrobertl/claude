<?php
namespace DCCL\Parsers;

use DCCL\Cottages;
use DCCL\Csv;
use DCCL\Dates;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Airbnb reservations CSV. It carries no money at all — it confirms stays and
 * supplies the booking date (lead time). Interleaved "Payout,,,,,,," rows are
 * skipped.
 */
final class Airbnb_Reservations extends Parser_Base
{
    public const KIND    = 'airbnb_reservations';
    public const CHANNEL = 'airbnb';

    public const HEADER = [
        'Type', 'Confirmation code', 'Booking date', 'Start date', 'End date',
        'Nights', 'Guest', 'Listing',
    ];

    public static function label(): string
    {
        return __('Airbnb Reservations', 'dcc-ledger');
    }

    public function parse(string $path): array
    {
        $result = $this->empty_result();

        foreach (Csv::rows($path) as $row) {
            $result['counts']['read']++;

            $type = trim($row['Type'] ?? '');
            $code = trim($row['Confirmation code'] ?? '');

            if (strcasecmp($type, 'Payout') === 0 || $code === '') {
                $result['counts']['skipped']++;
                continue;
            }

            $cottage = Cottages::from_airbnb_listing((string) ($row['Listing'] ?? ''));
            if ($this->is_excluded($cottage)) {
                $result['counts']['excluded']++;
                continue;
            }
            if ($cottage === '') {
                $result['counts']['unknown_cottage']++;
                continue;
            }

            $check_in  = Dates::us($row['Start date'] ?? '');
            $check_out = Dates::us($row['End date'] ?? '');
            if ($check_in === null || $check_out === null) {
                $result['counts']['malformed']++;
                continue;
            }
            $nights = $this->int_or_null($row['Nights'] ?? '') ?? Dates::nights($check_in, $check_out);

            $booked = Dates::us($row['Booking date'] ?? '');

            $this->merge_stay($result['stays'], $this->stay(
                $code,
                $cottage,
                $check_in,
                $check_out,
                $nights,
                $booked === null ? null : $booked . ' 00:00:00',
                'ok'
            ));
        }

        return $result;
    }
}
