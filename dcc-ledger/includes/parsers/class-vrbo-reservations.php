<?php
namespace DCCL\Parsers;

use DCCL\Cottages;
use DCCL\Csv;
use DCCL\Dates;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Vrbo reservations CSV. Carries no money.
 *
 * Email, Inquirer and Phone are never read out of the row — they are not copied
 * into any variable, array or log.
 */
final class Vrbo_Reservations extends Parser_Base
{
    public const KIND    = 'vrbo_reservations';
    public const CHANNEL = 'vrbo';

    public const HEADER = [
        'Reservation ID', 'Listing Number', 'Property Name', 'Created On',
        'Email', 'Inquirer', 'Phone', 'Check-in', 'Check-out', 'Nights Stay',
        'Adults', 'Children', 'Status', 'Source',
    ];

    public static function label(): string
    {
        return __('Vrbo Reservations', 'dcc-ledger');
    }

    public function parse(string $path): array
    {
        $result = $this->empty_result();

        foreach (Csv::rows($path) as $row) {
            $result['counts']['read']++;

            $code = trim($row['Reservation ID'] ?? '');
            if ($code === '') {
                $result['counts']['malformed']++;
                continue;
            }

            $listing = trim($row['Listing Number'] ?? '');
            $cottage = Cottages::from_vrbo_listing_id($listing);
            if ($cottage === '' && Cottages::is_excluded_text((string) ($row['Property Name'] ?? ''))) {
                $cottage = Cottages::EXCLUDED;
            }
            if ($this->is_excluded($cottage)) {
                $result['counts']['excluded']++;
                continue;
            }
            if ($cottage === '') {
                $result['counts']['unknown_cottage']++;
                continue;
            }

            $status = $this->status_for((string) ($row['Status'] ?? ''));
            if ($status === null) {
                $result['counts']['malformed']++;
                $result['notes'][] = sprintf(
                    /* translators: %s: the Status value from the file */
                    __('Unrecognised Vrbo status: %s', 'dcc-ledger'),
                    trim((string) ($row['Status'] ?? ''))
                );
                continue;
            }

            $check_in  = Dates::us($row['Check-in'] ?? '');
            $check_out = Dates::us($row['Check-out'] ?? '');
            $nights    = $this->int_or_null($row['Nights Stay'] ?? '') ?? Dates::nights($check_in, $check_out);

            $adults   = $this->int_or_null($row['Adults'] ?? '');
            $children = $this->int_or_null($row['Children'] ?? '');
            $persons  = ($adults === null && $children === null) ? null : (int) $adults + (int) $children;

            $this->merge_stay($result['stays'], $this->stay(
                $code,
                $cottage,
                $check_in,
                $check_out,
                $nights,
                Dates::us($row['Created On'] ?? '') === null
                    ? null
                    : Dates::us($row['Created On'] ?? '') . ' 00:00:00',
                $status,
                $persons,
                ['listing_number' => $listing, 'source' => trim((string) ($row['Source'] ?? ''))]
            ));
        }

        return $result;
    }

    private function status_for(string $status): ?string
    {
        $status = strtolower(trim($status));
        if ($status === 'booked') {
            return 'ok';
        }
        if ($status === 'cancelled' || $status === 'canceled') {
            return 'cancelled';
        }
        if (str_contains($status, 'expired')) {
            return 'expired';
        }
        return null;
    }
}
