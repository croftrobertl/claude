<?php
namespace DCCL\Parsers;

use DCCL\Cottages;
use DCCL\Csv;
use DCCL\Dates;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Booking.com monthly invoices, converted from the PDFs to one CSV.
 *
 * These are stored only to RECONCILE: per invoice number, the matched
 * reservations' Final amount and Commission must equal the invoice's own
 * figures. Nothing here feeds the revenue figures — the commission lines from
 * the reservations file already do that.
 */
final class Bookingcom_Invoices extends Parser_Base
{
    public const KIND    = 'bookingcom_invoices';
    public const CHANNEL = 'bookingcom';

    public const HEADER = [
        'Invoice number', 'Property ID', 'Invoice date', 'Period start',
        'Period end', 'Room sales', 'Commission', 'Debit account last4',
    ];

    public static function label(): string
    {
        return __('Booking.com Invoices', 'dcc-ledger');
    }

    public function parse(string $path): array
    {
        $result = $this->empty_result();

        foreach (Csv::rows($path) as $row) {
            $result['counts']['read']++;

            $invoice = trim($row['Invoice number'] ?? '');
            if ($invoice === '') {
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

            $invoice_date = Dates::iso($row['Invoice date'] ?? '') ?? Dates::us($row['Invoice date'] ?? '');
            $commission   = $this->money($row['Commission'] ?? '');
            $room_sales   = $this->money($row['Room sales'] ?? '');

            $result['lines'][] = $this->line(
                'invoice',
                $commission,
                $invoice_date,
                null,
                null,
                $invoice,
                [
                    'property_id'  => $property,
                    'cottage'      => $cottage,
                    'room_sales'   => $room_sales,
                    'period_start' => Dates::iso($row['Period start'] ?? '') ?? Dates::us($row['Period start'] ?? ''),
                    'period_end'   => Dates::iso($row['Period end'] ?? '') ?? Dates::us($row['Period end'] ?? ''),
                    // Last four digits of Rob's own debit account, not a guest's.
                    'debit_last4'  => preg_replace('/\D/', '', (string) ($row['Debit account last4'] ?? '')),
                ]
            );
        }

        return $result;
    }
}
