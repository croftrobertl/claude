<?php
namespace DCCL\Parsers;

use DCCL\Cottages;
use DCCL\Csv;
use DCCL\Dates;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Booking.com reservations CSV.
 *
 * Final amount is room sales net of tax; Booking.com's payout to Rob is the
 * guest's gross INCLUDING the taxes he remits, so the guest total for this
 * channel comes from the payout file, not from here. Commission is dated by
 * Departure because Booking.com invoices by departure month.
 *
 * Booker name / Guest name are never read.
 */
final class Bookingcom_Reservations extends Parser_Base
{
    public const KIND    = 'bookingcom_reservations';
    public const CHANNEL = 'bookingcom';

    public const HEADER = [
        'Reservation number', 'Invoice number', 'Booked on', 'Arrival', 'Departure',
        'Booker name', 'Guest name', 'Rooms', 'Persons', 'Room nights',
        'Commission %', 'Original amount', 'Final amount', 'Commission amount',
        'Status', 'Guest request', 'Currency', 'Hotel id', 'Property name',
        'City', 'Country',
    ];

    public static function label(): string
    {
        return __('Booking.com Reservations', 'dcc-ledger');
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

            $hotel_id = trim($row['Hotel id'] ?? '');
            $cottage  = Cottages::from_bookingcom_hotel_id($hotel_id);
            if ($cottage === '' && Cottages::is_excluded_text((string) ($row['Property name'] ?? ''))) {
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

            $check_in  = Dates::iso($row['Arrival'] ?? '') ?? Dates::us($row['Arrival'] ?? '');
            $check_out = Dates::iso($row['Departure'] ?? '') ?? Dates::us($row['Departure'] ?? '');
            if ($check_in === null || $check_out === null) {
                $result['counts']['malformed']++;
                continue;
            }

            $status_raw = strtoupper(trim($row['Status'] ?? ''));
            $status     = $status_raw === 'CANCELLED' ? 'cancelled' : 'ok';

            $nights = $this->int_or_null($row['Room nights'] ?? '') ?? Dates::nights($check_in, $check_out);

            $this->merge_stay($result['stays'], $this->stay(
                $code,
                $cottage,
                $check_in,
                $check_out,
                $nights,
                Dates::iso_datetime($row['Booked on'] ?? ''),
                $status,
                $this->int_or_null($row['Persons'] ?? ''),
                ['hotel_id' => $hotel_id, 'invoice_number' => trim($row['Invoice number'] ?? '')]
            ));

            $final      = $this->money($row['Final amount'] ?? '');
            $commission = $this->money($row['Commission amount'] ?? '');
            $invoice_no = trim($row['Invoice number'] ?? '');

            if ($final != 0.0) {
                $result['lines'][] = $this->line('room_sales', $final, $check_out, $code, null, $invoice_no ?: null, [
                    'hotel_id' => $hotel_id,
                    'status'   => $status,
                ]);
            }
            if ($commission != 0.0) {
                // Dated by departure: that is the month Booking.com invoices it in.
                $result['lines'][] = $this->line('commission', $commission, $check_out, $code, null, $invoice_no ?: null, [
                    'hotel_id' => $hotel_id,
                    'status'   => $status,
                ]);
            }
        }

        return $result;
    }
}
