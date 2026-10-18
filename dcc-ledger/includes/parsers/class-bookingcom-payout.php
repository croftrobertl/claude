<?php
namespace DCCL\Parsers;

use DCCL\Cottages;
use DCCL\Csv;
use DCCL\Dates;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Booking.com payout CSV.
 *
 * The payout is the guest's gross INCLUDING the taxes Rob remits; commission is
 * invoiced and debited separately, so the payout is never revenue on its own.
 * tax_in_payout (payout − Final amount) is derived after import, once the
 * reservation's room_sales line is known — see Importer::derive_bookingcom_tax().
 *
 * A payout can exist for a reservation that is missing from the reservations
 * file. The stay is created from the payout row with nights unknown, and the
 * cleanup list raises it.
 */
final class Bookingcom_Payout extends Parser_Base
{
    public const KIND    = 'bookingcom_payout';
    public const CHANNEL = 'bookingcom';

    public const HEADER = [
        'Payout date', 'Property ID', 'Transaction type', 'Reservation number',
        'Check in date', 'Issue date', 'Total amount (gross)', 'Currency',
        'Statement Descriptor', 'Bank Name', 'Bank Account',
    ];

    public static function label(): string
    {
        return __('Booking.com Payouts', 'dcc-ledger');
    }

    public function parse(string $path): array
    {
        $result = $this->empty_result();

        foreach (Csv::rows($path) as $row) {
            $result['counts']['read']++;

            $code = trim($row['Reservation number'] ?? '');
            if ($code === '') {
                $result['counts']['malformed']++;
                continue;
            }

            $property = trim($row['Property ID'] ?? '');
            $cottage  = Cottages::from_bookingcom_hotel_id($property);
            if ($this->is_excluded($cottage)) {
                $result['counts']['excluded']++;
                continue;
            }
            if ($cottage === '') {
                $result['counts']['unknown_cottage']++;
                continue;
            }

            $payout_date = Dates::us($row['Payout date'] ?? '') ?? Dates::iso($row['Payout date'] ?? '');
            $check_in    = Dates::us($row['Check in date'] ?? '') ?? Dates::iso($row['Check in date'] ?? '');
            $gross       = $this->money($row['Total amount (gross)'] ?? '');
            $txn         = strtoupper(trim($row['Transaction type'] ?? ''));

            // Create the stay from the payout row when the reservations file
            // has none. Nights stay unknown; merge_stay never overwrites a
            // richer record from the reservations file.
            $this->merge_stay($result['stays'], $this->stay(
                $code,
                $cottage,
                $check_in,
                null,
                null,
                null,
                'ok',
                null,
                ['from_payout' => true, 'hotel_id' => $property]
            ));

            $ref = trim($row['Statement Descriptor'] ?? '');

            if ($txn === 'REFUND') {
                // Already negative in the file; normalise so a positive refund
                // figure in the export is still stored as money going out.
                $amount = $gross > 0 ? -$gross : $gross;
                $result['lines'][] = $this->line('refund', $amount, $payout_date, $code, $ref ?: null);
                continue;
            }

            if ($txn !== 'RESERVATION') {
                $result['counts']['malformed']++;
                $result['notes'][] = sprintf(
                    /* translators: %s: the Transaction type value from the file */
                    __('Unrecognised Booking.com transaction type: %s', 'dcc-ledger'),
                    $txn
                );
                continue;
            }

            if ($gross != 0.0) {
                $result['lines'][] = $this->line('payout', $gross, $payout_date, $code, $ref ?: null);
                // The guest's gross payment for this channel is the payout.
                $result['lines'][] = $this->line('guest_total', $gross, $payout_date, $code, $ref ?: null, null, [
                    'source' => 'payout_gross',
                ]);
            }
        }

        return $result;
    }
}
