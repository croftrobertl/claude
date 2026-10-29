<?php
namespace DCCL\Parsers;

use DCCL\Cottages;
use DCCL\Csv;
use DCCL\Money;
use DCCL\Dates;
use DCCL\Names;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Vrbo payout CSV.
 *
 * One reservation can have several rows, including a later negative one (a
 * partial refund) — each row is its own set of lines, distinguished by its
 * payout date and, when two rows are otherwise identical, by their order in the
 * file.
 *
 * Both tax columns are 0 in every row Rob has. They are stored anyway, and the
 * reports say "not reported by Vrbo" rather than "$0 tax".
 *
 * The traveller's name is read only to hash the surname inside the row loop,
 * and is dropped there.
 */
final class Vrbo_Payout extends Parser_Base
{
    public const KIND    = 'vrbo_payout';
    public const CHANNEL = 'vrbo';

    public const HEADER = [
        'Property ID', 'Unit ID', 'Address', 'Reservation ID',
        'Traveler First Name', 'Traveler Last Name', 'Booking status',
        'Check-in', 'Check-out', 'Nights', 'Payout date',
        'Gross booking amount', 'Deductions', 'Payout',
        'Lodging Tax Owner Remits', 'Tax Withheld', 'Payout currency',
    ];

    public static function label(): string
    {
        return __('Vrbo Payouts', 'dcc-ledger');
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

            // The payout file's "Property ID" is the reservations file's
            // "Listing Number" — the same id, under a different column name.
            $listing = trim($row['Property ID'] ?? '');
            $cottage = Cottages::from_vrbo_listing_id($listing);
            if ($cottage === '' && Cottages::is_excluded_text((string) ($row['Address'] ?? ''))) {
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

            $check_in  = Dates::long_month($row['Check-in'] ?? '') ?? Dates::us($row['Check-in'] ?? '');
            $check_out = Dates::long_month($row['Check-out'] ?? '') ?? Dates::us($row['Check-out'] ?? '');
            $payout_on = Dates::long_month($row['Payout date'] ?? '') ?? Dates::us($row['Payout date'] ?? '');
            $nights    = $this->int_or_null($row['Nights'] ?? '') ?? Dates::nights($check_in, $check_out);

            $status = strtolower(trim((string) ($row['Booking status'] ?? '')));
            $this->merge_stay($result['stays'], $this->stay(
                $code,
                $cottage,
                $check_in,
                $check_out,
                $nights,
                null,
                str_contains($status, 'cancel') ? 'cancelled' : 'ok',
                null,
                ['listing_number' => $listing],
                Names::keys_from_parts(
                    (string) ($row['Traveler First Name'] ?? ''),
                    (string) ($row['Traveler Last Name'] ?? '')
                )
            ));

            $gross      = $this->cents($row['Gross booking amount'] ?? '');
            $deductions = $this->cents($row['Deductions'] ?? '');
            $payout     = $this->cents($row['Payout'] ?? '');
            $tax_owner  = $this->cents($row['Lodging Tax Owner Remits'] ?? '');
            $tax_held   = $this->cents($row['Tax Withheld'] ?? '');

            if ($gross !== 0) {
                $result['lines'][] = $this->line('guest_total', $gross, $payout_on, $code);
            }
            if ($deductions !== 0) {
                // Stored as a positive cost regardless of the file's sign.
                $result['lines'][] = $this->line('service_fee', abs($deductions), $payout_on, $code);
            }
            if ($payout !== 0) {
                $result['lines'][] = $this->line('payout', $payout, $payout_on, $code);
            }
            // Always stored, even at 0.00: their absence is itself a fact the
            // reports report ("not reported by Vrbo").
            $result['lines'][] = $this->line('tax_in_payout', $tax_owner, $payout_on, $code, null, null, [
                'column' => 'Lodging Tax Owner Remits',
            ]);
            $result['lines'][] = $this->line('tax_platform_remitted', $tax_held, $payout_on, $code, null, null, [
                'column' => 'Tax Withheld',
            ]);
        }

        return $result;
    }
}
