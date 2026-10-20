<?php
namespace DCCL\Parsers;

use DCCL\Cottages;
use DCCL\Csv;
use DCCL\Dates;
use DCCL\Names;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Airbnb payout (transaction history) CSV.
 *
 * A "Payout" row carries the bank transfer total and a Reference code, and the
 * reservation rows that FOLLOW it belong to that payout. The payout row itself
 * is not stored as a money line: its total is the sum of the per-reservation
 * Amount shares, so storing both would double the payout in every report. The
 * parser checks that sum against the stated total and raises a note when they
 * disagree.
 */
final class Airbnb_Payout extends Parser_Base
{
    public const KIND    = 'airbnb_payout';
    public const CHANNEL = 'airbnb';

    public const HEADER = [
        'Date', 'Arriving by date', 'Type', 'Confirmation code', 'Booking date',
        'Start date', 'End date', 'Nights', 'Guest', 'Listing', 'Details',
        'Reference code', 'Currency', 'Amount', 'Paid out', 'Service fee',
        'Fast pay fee', 'Cleaning fee', 'Pet fee', 'Gross earnings',
        'Airbnb remitted tax', 'Earnings year',
    ];

    public static function label(): string
    {
        return __('Airbnb Payouts', 'dcc-ledger');
    }

    public function parse(string $path): array
    {
        $result = $this->empty_result();

        $payout_ref   = null;
        $payout_date  = null;
        $payout_total = 0.0;
        $payout_sum   = 0.0;
        $open_payout  = false;
        $payout_partial = false;

        foreach (Csv::rows($path) as $row) {
            $result['counts']['read']++;

            $type = trim($row['Type'] ?? '');
            if ($type === '' && Csv::is_blank($row)) {
                $result['counts']['skipped']++;
                $result['counts']['skipped_blank']++;
                continue;
            }

            if (strcasecmp($type, 'Payout') === 0) {
                // Close the previous payout group before starting the next.
                $this->close_payout($result, $open_payout, $payout_ref, $payout_total, $payout_sum, $payout_partial);

                $payout_partial = false;
                $payout_ref  = trim($row['Reference code'] ?? '');
                $payout_date = Dates::us($row['Date'] ?? '');
                $payout_total = $this->money($row['Paid out'] ?? '');
                $payout_sum  = 0.0;
                $open_payout = true;
                continue;
            }

            $code = trim($row['Confirmation code'] ?? '');
            if ($code === '') {
                $result['counts']['malformed']++;
                continue;
            }

            // The Listing column is the only cottage signal in this file.
            $listing = (string) ($row['Listing'] ?? '');
            $cottage = Cottages::from_airbnb_listing($listing);
            if ($this->is_excluded($cottage)) {
                $result['counts']['excluded']++;
                // The stated payout total still includes this row, so the
                // group's total can no longer be checked against the rows.
                $payout_partial = true;
                continue;
            }

            $event_date = Dates::us($row['Date'] ?? '') ?? $payout_date;
            $amount     = $this->money($row['Amount'] ?? '');

            if (strcasecmp($type, 'Reservation') === 0) {
                if ($cottage === '') {
                    $result['counts']['unknown_cottage']++;
                    $payout_partial = true;
                    continue;
                }
                $check_in  = Dates::us($row['Start date'] ?? '');
                $check_out = Dates::us($row['End date'] ?? '');
                $nights    = $this->int_or_null($row['Nights'] ?? '');
                if ($nights === null) {
                    $nights = Dates::nights($check_in, $check_out);
                }
                // A 2025 payout can settle a 2022 reservation: the stay keeps
                // its own dates, the money keeps the payout's date.
                $this->merge_stay($result['stays'], $this->stay(
                    $code,
                    $cottage,
                    $check_in,
                    $check_out,
                    $nights,
                    Dates::us($row['Booking date'] ?? '') === null
                        ? null
                        : Dates::us($row['Booking date'] ?? '') . ' 00:00:00',
                    'ok',
                    null,
                    [],
                    // Hashed here and dropped: the name goes no further.
                    Names::keys((string) ($row['Guest'] ?? ''))
                ));

                $gross     = $this->money($row['Gross earnings'] ?? '');
                $svc       = abs($this->money($row['Service fee'] ?? ''));
                $fast_pay  = abs($this->money($row['Fast pay fee'] ?? ''));
                $tax       = $this->money($row['Airbnb remitted tax'] ?? '');

                if ($gross != 0.0) {
                    $result['lines'][] = $this->line('guest_total', $gross, $event_date, $code, $payout_ref, null, [
                        // Components of the gross, kept for reference only. They
                        // are NOT separate money lines: that would double-count.
                        'cleaning_fee' => $this->money($row['Cleaning fee'] ?? ''),
                        'pet_fee'      => $this->money($row['Pet fee'] ?? ''),
                    ]);
                }
                if ($svc != 0.0) {
                    $result['lines'][] = $this->line('service_fee', $svc, $event_date, $code, $payout_ref);
                }
                if ($fast_pay != 0.0) {
                    $result['lines'][] = $this->line('service_fee', $fast_pay, $event_date, $code, $payout_ref, null, [
                        'source' => 'fast_pay_fee',
                    ]);
                }
                if ($tax != 0.0) {
                    // Airbnb collected and remitted this itself. Never revenue.
                    $result['lines'][] = $this->line('tax_platform_remitted', $tax, $event_date, $code, $payout_ref);
                }
                if ($amount != 0.0) {
                    $result['lines'][] = $this->line('payout', $amount, $event_date, $code, $payout_ref);
                    $payout_sum += $amount;
                }
                continue;
            }

            $line_type = $this->type_for($type);
            if ($line_type === null) {
                $result['counts']['malformed']++;
                $payout_partial    = true;
                $result['notes'][] = sprintf(
                    /* translators: %s: the Type value from the file */
                    __('Unrecognised Airbnb row type: %s', 'dcc-ledger'),
                    $type
                );
                continue;
            }

            // A cancellation fee is the only trace a cancelled reservation
            // leaves in this file — it never gets a Reservation row. The stay
            // is created from it so the money has somewhere to belong, and the
            // cleanup list can show "a cancelled stay that still has money".
            if ($line_type === 'cancellation_fee' && $cottage !== '') {
                $check_in  = Dates::us($row['Start date'] ?? '');
                $check_out = Dates::us($row['End date'] ?? '');
                $this->merge_stay($result['stays'], $this->stay(
                    $code,
                    $cottage,
                    $check_in,
                    $check_out,
                    $this->int_or_null($row['Nights'] ?? '') ?? Dates::nights($check_in, $check_out),
                    Dates::us($row['Booking date'] ?? '') === null
                        ? null
                        : Dates::us($row['Booking date'] ?? '') . ' 00:00:00',
                    'cancelled',
                    null,
                    [],
                    Names::keys((string) ($row['Guest'] ?? ''))
                ));
            }

            // Adjustment-style rows carry no listing of their own in some
            // exports; they attach to their reservation by code.
            $result['lines'][] = $this->line($line_type, $amount, $event_date, $code, $payout_ref);
            $payout_sum += $amount;
        }

        $this->close_payout($result, $open_payout, $payout_ref, $payout_total, $payout_sum, $payout_partial);

        return $result;
    }

    private function type_for(string $type): ?string
    {
        switch (strtolower(trim($type))) {
            case 'resolution adjustment':
                return 'resolution';
            case 'adjustment':
                return 'adjustment';
            case 'cancellation fee':
                return 'cancellation_fee';
            case 'cancellation fee refund':
                return 'cancellation_fee_refund';
            default:
                return null;
        }
    }

    /**
     * @param array{notes:array<int,string>} $result
     */
    private function close_payout(
        array &$result,
        bool &$open,
        ?string $ref,
        float $total,
        float $sum,
        bool $partial
    ): void {
        if (!$open) {
            return;
        }
        $open = false;
        // A group that lost rows to the Crofty Bear exclusion, or to an
        // unreadable row, cannot be checked against its stated total.
        if ($partial || $total == 0.0) {
            return;
        }
        if (abs(round($total - $sum, 2)) >= 0.01) {
            $result['notes'][] = sprintf(
                /* translators: 1: payout reference code, 2: stated total, 3: sum of the rows */
                __('Airbnb payout %1$s states %2$s but its rows add up to %3$s.', 'dcc-ledger'),
                (string) $ref,
                number_format($total, 2),
                number_format($sum, 2)
            );
        }
    }
}
