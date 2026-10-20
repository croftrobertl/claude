<?php
namespace DCCL\Parsers;

use DCCL\Cottages;
use DCCL\Csv;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * One parser per export format.
 *
 * A parser turns a file into normalised stay and line records. It never touches
 * the database and never looks at MotoPress.
 *
 * A guest's name is read for one purpose only: it is turned into salted hashes
 * of the surname inside the row loop, so that a booking moved to another
 * cottage can be recognised as the same person. The name itself is dropped
 * there and then, and never reaches a variable that outlives the row, a stored
 * column, a log or the screen. Emails, phones and addresses are not read at
 * all.
 *
 * Sign conventions for line amounts:
 *   guest_total, room_sales, payout            positive (money in / money the guest paid)
 *   commission, service_fee                    positive (a cost; reports subtract them)
 *   tax_platform_remitted, tax_in_payout       positive
 *   refund                                     negative
 *   adjustment, resolution                     signed as the platform states it
 *   cancellation_fee, cancellation_fee_refund  signed as the platform states it
 *   invoice                                    positive (the invoiced commission)
 */
abstract class Parser_Base
{
    /** Machine kind, e.g. 'airbnb_payout'. Stored on the batch. */
    public const KIND = '';

    /** Channel these rows belong to. */
    public const CHANNEL = '';

    /** The exact header row this parser accepts. */
    public const HEADER = [];

    abstract public static function label(): string;

    /**
     * Header detection is exact: same columns, same order. Case and surrounding
     * whitespace are ignored, a UTF-8 BOM is stripped, nothing else is forgiven.
     *
     * @param string[] $header
     */
    public static function matches(array $header): bool
    {
        $want = array_map(static fn ($h) => strtolower($h), static::HEADER);
        $got  = array_map(static fn ($h) => strtolower(trim((string) $h)), $header);
        return $want === $got;
    }

    /**
     * @return array{stays:array<string,array>,lines:array<int,array>,counts:array<string,int>,notes:array<int,string>}
     */
    abstract public function parse(string $path): array;

    /** @return array{stays:array<string,array>,lines:array<int,array>,counts:array<string,int>,notes:array<int,string>} */
    protected function empty_result(): array
    {
        return [
            'stays'  => [],
            'lines'  => [],
            'counts' => [
                'read'            => 0,
                'excluded'        => 0,
                'unknown_cottage' => 0,
                'malformed'       => 0,
                'skipped'         => 0,
                // What the skipped rows were, so "skipped: 39" is never an
                // unexplained number on an import report.
                'skipped_payout_rows' => 0,
                'skipped_no_code'     => 0,
                'skipped_blank'       => 0,
            ],
            'notes'  => [],
        ];
    }

    /**
     * "$1,234.56", "(12.34)", "-12.34", "" → float. Returns 0.0 for an empty cell.
     */
    protected function money(string $value): float
    {
        $value = trim($value);
        if ($value === '' || $value === '-') {
            return 0.0;
        }
        $negative = false;
        if (str_starts_with($value, '(') && str_ends_with($value, ')')) {
            $negative = true;
            $value    = substr($value, 1, -1);
        }
        $value = preg_replace('/[^0-9.\-]/', '', $value) ?? '';
        if ($value === '' || $value === '-' || !is_numeric($value)) {
            return 0.0;
        }
        $amount = round((float) $value, 2);
        return $negative ? -$amount : $amount;
    }

    protected function int_or_null(string $value): ?int
    {
        $value = trim($value);
        if ($value === '' || !is_numeric($value)) {
            return null;
        }
        return (int) $value;
    }

    /**
     * @param array<string,mixed> $extra
     * @return array<string,mixed>
     */
    protected function stay(
        string $code,
        string $cottage,
        ?string $check_in,
        ?string $check_out,
        ?int $nights = null,
        ?string $booked_on = null,
        string $status = 'ok',
        ?int $persons = null,
        array $extra = [],
        array $guest_keys = []
    ): array {
        return [
            'channel'   => static::CHANNEL,
            'code'      => $code,
            'cottage'   => $cottage,
            'check_in'  => $check_in,
            'check_out' => $check_out,
            'nights'    => $nights,
            'booked_on' => $booked_on,
            'status'    => $status,
            'persons'   => $persons,
            'guest_keys' => $guest_keys,
            'meta'      => $extra,
        ];
    }

    /**
     * @param array<string,mixed> $meta
     * @return array<string,mixed>
     */
    protected function line(
        string $type,
        float $amount,
        ?string $event_date,
        ?string $stay_code = null,
        ?string $payout_ref = null,
        ?string $ref_code = null,
        array $meta = []
    ): array {
        return [
            'channel'    => static::CHANNEL,
            'type'       => $type,
            'amount'     => round($amount, 2),
            'event_date' => $event_date,
            'stay_code'  => $stay_code,
            'payout_ref' => $payout_ref,
            'ref_code'   => $ref_code,
            'meta'       => $meta,
        ];
    }

    /**
     * Merge a stay into the result set, filling blanks rather than overwriting
     * known values — a payout file may know less than a reservations file.
     *
     * @param array<string,array> $stays
     * @param array<string,mixed> $stay
     */
    protected function merge_stay(array &$stays, array $stay): void
    {
        $key = $stay['channel'] . ':' . $stay['code'];
        if (!isset($stays[$key])) {
            $stays[$key] = $stay;
            return;
        }
        foreach ($stay as $field => $value) {
            if ($field === 'meta') {
                $stays[$key]['meta'] = array_merge($stays[$key]['meta'], $value);
                continue;
            }
            if ($field === 'guest_keys') {
                if ($value !== [] && ($stays[$key]['guest_keys'] ?? []) === []) {
                    $stays[$key]['guest_keys'] = $value;
                }
                continue;
            }
            if ($value !== null && $value !== '' && ($stays[$key][$field] ?? null) === null) {
                $stays[$key][$field] = $value;
            }
        }
    }

    protected function is_excluded(string $cottage): bool
    {
        return $cottage === Cottages::EXCLUDED;
    }
}
