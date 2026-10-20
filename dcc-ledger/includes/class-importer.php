<?php
namespace DCCL;

use DCCL\Parsers\Airbnb_Payout;
use DCCL\Parsers\Airbnb_Reservations;
use DCCL\Parsers\Bookingcom_Invoices;
use DCCL\Parsers\Bookingcom_Payout;
use DCCL\Parsers\Bookingcom_Reservations;
use DCCL\Parsers\Parser_Base;
use DCCL\Parsers\Vrbo_Payout;
use DCCL\Parsers\Vrbo_Reservations;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Picks the parser by header row, then writes what it produced.
 *
 * A dry run writes nothing at all — not a stay, not a line, not even a batch
 * row — and reports the same counts the real run would produce.
 */
final class Importer
{
    /** @return array<int,class-string<Parser_Base>> */
    public static function parsers(): array
    {
        return [
            Airbnb_Payout::class,
            Airbnb_Reservations::class,
            Bookingcom_Reservations::class,
            Bookingcom_Payout::class,
            Vrbo_Reservations::class,
            Vrbo_Payout::class,
            Bookingcom_Invoices::class,
        ];
    }

    /**
     * @param string[] $header
     * @return class-string<Parser_Base>|null
     */
    public static function detect(array $header): ?string
    {
        foreach (self::parsers() as $parser) {
            if ($parser::matches($header)) {
                return $parser;
            }
        }
        return null;
    }

    public static function unknown_header_message(): string
    {
        $names = [];
        foreach (self::parsers() as $parser) {
            $names[] = $parser::label();
        }
        return sprintf(
            /* translators: %s: comma-separated list of the formats the plugin accepts */
            __('This file\'s header row does not match any format DCC Ledger knows. Export it again without editing the columns. Accepted formats: %s.', 'dcc-ledger'),
            implode(', ', $names)
        );
    }

    /**
     * @return array{
     *   ok:bool, message:string, kind:string, label:string, dry_run:bool,
     *   batch_id:int|null, counts:array<string,int>, notes:array<int,string>
     * }
     */
    public static function run(string $path, string $label, bool $dry_run = false, ?int $user_id = null): array
    {
        $fail = static function (string $message): array {
            return [
                'ok'       => false,
                'message'  => $message,
                'kind'     => '',
                'label'    => '',
                'dry_run'  => true,
                'batch_id' => null,
                'counts'   => [],
                'notes'    => [],
            ];
        };

        if (!is_readable($path)) {
            return $fail(__('That file could not be read.', 'dcc-ledger'));
        }
        if (filesize($path) > Csv::MAX_BYTES) {
            return $fail(__('That file is larger than the 5 MB limit.', 'dcc-ledger'));
        }

        // The format is decided by the header row, never by the file extension.
        $parser_class = self::detect(Csv::header($path));
        if ($parser_class === null) {
            return $fail(self::unknown_header_message());
        }

        /** @var Parser_Base $parser */
        $parser = new $parser_class();
        $parsed = $parser->parse($path);

        $counts = [
            'read'            => $parsed['counts']['read'],
            'excluded'        => $parsed['counts']['excluded'],
            'unknown_cottage' => $parsed['counts']['unknown_cottage'],
            'malformed'       => $parsed['counts']['malformed'],
            'skipped'         => $parsed['counts']['skipped'],
            'skipped_payout_rows' => $parsed['counts']['skipped_payout_rows'] ?? 0,
            'skipped_no_code'     => $parsed['counts']['skipped_no_code'] ?? 0,
            'skipped_blank'       => $parsed['counts']['skipped_blank'] ?? 0,
            'stays_new'       => 0,
            'stays_unchanged' => 0,
            'stays_enriched'  => 0,
            'lines_new'       => 0,
            'lines_unchanged' => 0,
        ];
        $notes = $parsed['notes'];

        $hashed = self::hash_lines($parsed['lines']);

        if ($dry_run) {
            foreach ($parsed['stays'] as $stay) {
                $existing = Repo::find_stay((string) $stay['channel'], (string) $stay['code']);
                if ($existing === null) {
                    $counts['stays_new']++;
                } elseif (self::would_enrich($existing, $stay)) {
                    $counts['stays_enriched']++;
                } else {
                    $counts['stays_unchanged']++;
                }
            }
            foreach ($hashed as [$line, $hash]) {
                if (Repo::line_exists($hash)) {
                    $counts['lines_unchanged']++;
                } else {
                    $counts['lines_new']++;
                }
            }

            return [
                'ok'       => true,
                'message'  => __('Dry run complete. Nothing was written.', 'dcc-ledger'),
                'kind'     => $parser_class::KIND,
                'label'    => $label,
                'dry_run'  => true,
                'batch_id' => null,
                'counts'   => $counts,
                'notes'    => $notes,
            ];
        }

        $batch_id = Batches::create($parser_class::KIND, $label, $user_id);
        $undo     = [];
        $stay_ids = [];

        foreach ($parsed['stays'] as $key => $stay) {
            $out = Repo::upsert_stay($stay, $batch_id);
            $stay_ids[$key] = $out['id'];
            if ($out['action'] === 'new') {
                $counts['stays_new']++;
            } elseif ($out['action'] === 'enriched') {
                $counts['stays_enriched']++;
                if ($out['undo'] !== null) {
                    $undo[] = $out['undo'];
                }
            } else {
                $counts['stays_unchanged']++;
            }
        }

        foreach ($hashed as [$line, $hash]) {
            $stay_id = null;
            if (!empty($line['stay_code'])) {
                $key = $line['channel'] . ':' . $line['stay_code'];
                $stay_id = $stay_ids[$key] ?? Repo::stay_id((string) $line['channel'], (string) $line['stay_code']);
            }
            $action = Repo::insert_line($line, $hash, $stay_id, $batch_id);
            $action === 'new' ? $counts['lines_new']++ : $counts['lines_unchanged']++;
        }

        if ($parser_class::CHANNEL === 'bookingcom' && $parser_class !== Bookingcom_Invoices::class) {
            $derived = self::derive_bookingcom_tax($batch_id, $notes);
            $counts['lines_new'] += $derived;
        }

        Batches::finish($batch_id, [
            'read'      => $counts['read'],
            'inserted'  => $counts['stays_new'] + $counts['lines_new'],
            'unchanged' => $counts['stays_unchanged'] + $counts['lines_unchanged'],
            'skipped'   => $counts['skipped'] + $counts['malformed'] + $counts['unknown_cottage'],
            'excluded'  => $counts['excluded'],
        ], $undo);

        Reports::flush_cache();

        // Counts only — never the contents of a row.
        self::log(sprintf(
            'DCCL: import batch %d (%s) read=%d stays_new=%d lines_new=%d excluded=%d skipped=%d',
            $batch_id,
            $parser_class::KIND,
            $counts['read'],
            $counts['stays_new'],
            $counts['lines_new'],
            $counts['excluded'],
            $counts['skipped'] + $counts['malformed'] + $counts['unknown_cottage']
        ));

        return [
            'ok'       => true,
            'message'  => __('Import complete.', 'dcc-ledger'),
            'kind'     => $parser_class::KIND,
            'label'    => $label,
            'dry_run'  => false,
            'batch_id' => $batch_id,
            'counts'   => $counts,
            'notes'    => $notes,
        ];
    }

    /**
     * Give every line its natural-key hash, numbering identical keys within
     * the file so a genuinely repeated row is kept rather than swallowed.
     *
     * @param array<int,array<string,mixed>> $lines
     * @return array<int,array{0:array<string,mixed>,1:string}>
     */
    public static function hash_lines(array $lines): array
    {
        $seen = [];
        $out  = [];
        foreach ($lines as $line) {
            $base = Repo::line_hash($line, 0);
            $seq  = $seen[$base] ?? 0;
            $seen[$base] = $seq + 1;
            $out[] = [$line, $seq === 0 ? $base : Repo::line_hash($line, $seq)];
        }
        return $out;
    }

    /**
     * @param array<string,mixed> $existing
     * @param array<string,mixed> $incoming
     */
    private static function would_enrich(array $existing, array $incoming): bool
    {
        foreach (['check_in', 'check_out', 'nights', 'booked_on', 'persons'] as $field) {
            $value = $incoming[$field] ?? null;
            if ($value !== null && $value !== '' && ($existing[$field] ?? null) === null) {
                return true;
            }
        }
        return ($incoming['status'] ?? 'ok') !== 'ok' && ($existing['status'] ?? 'ok') === 'ok';
    }

    /**
     * Booking.com pays out the guest's gross INCLUDING the taxes Rob remits,
     * and invoices commission separately. The tax inside a payout is therefore
     * payout − Final amount, measured per reservation rather than assumed from
     * a rate.
     *
     * Only OK stays are derived. A stay that already has a derived figure is
     * left alone; if the inputs have since changed, that is raised as a note
     * rather than silently rewritten.
     *
     * @param array<int,string> $notes
     * @return int number of lines inserted
     */
    public static function derive_bookingcom_tax(int $batch_id, array &$notes): int
    {
        global $wpdb;

        $stays_t = Schema::stays();
        $lines_t = Schema::lines();

        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT s.id, s.code, s.status,
                        SUM(CASE WHEN l.type = 'payout' THEN l.amount ELSE 0 END)     AS payout_sum,
                        SUM(CASE WHEN l.type = 'room_sales' THEN l.amount ELSE 0 END) AS room_sales_sum,
                        SUM(CASE WHEN l.type = 'room_sales' THEN 1 ELSE 0 END)        AS room_sales_rows,
                        SUM(CASE WHEN l.type = 'payout' THEN 1 ELSE 0 END)            AS payout_rows,
                        MAX(CASE WHEN l.type = 'payout' THEN l.event_date END)        AS payout_date
                   FROM {$stays_t} s
                   INNER JOIN {$lines_t} l ON l.stay_id = s.id
                  WHERE s.channel = 'bookingcom'
                    AND s.status = 'ok'
                    AND s.id IN (
                        SELECT DISTINCT stay_id FROM {$lines_t}
                         WHERE source_batch = %d AND stay_id IS NOT NULL
                    )
                  GROUP BY s.id, s.code, s.status",
                $batch_id
            ),
            ARRAY_A
        ) ?: [];

        $inserted = 0;

        foreach ($rows as $row) {
            if ((int) $row['room_sales_rows'] === 0 || (int) $row['payout_rows'] === 0) {
                continue; // Not enough known yet; the other file will complete it.
            }
            $tax = round((float) $row['payout_sum'] - (float) $row['room_sales_sum'], 2);
            if (abs($tax) < 0.01) {
                continue;
            }

            $existing = $wpdb->get_row(
                $wpdb->prepare(
                    "SELECT id, amount FROM {$lines_t}
                      WHERE stay_id = %d AND type = 'tax_in_payout' LIMIT 1",
                    (int) $row['id']
                ),
                ARRAY_A
            );
            if ($existing !== null) {
                if (abs(round((float) $existing['amount'] - $tax, 2)) >= 0.01) {
                    $notes[] = sprintf(
                        /* translators: 1: reservation number, 2: stored amount, 3: newly derived amount */
                        __('Booking.com %1$s already has taxes collected in payout of %2$s, but the figures now give %3$s. The stored line was left as it is.', 'dcc-ledger'),
                        (string) $row['code'],
                        number_format((float) $existing['amount'], 2),
                        number_format($tax, 2)
                    );
                }
                continue;
            }

            $line = [
                'channel'    => 'bookingcom',
                'type'       => 'tax_in_payout',
                'amount'     => $tax,
                'event_date' => $row['payout_date'],
                'stay_code'  => (string) $row['code'],
                'payout_ref' => null,
                'ref_code'   => null,
                'meta'       => ['source' => 'derived', 'basis' => 'payout_minus_final_amount'],
            ];
            if (Repo::insert_line($line, Repo::line_hash($line, 0), (int) $row['id'], $batch_id) === 'new') {
                $inserted++;
            }
        }

        return $inserted;
    }

    private static function log(string $message): void
    {
        if (defined('WP_DEBUG') && WP_DEBUG) {
            error_log($message);
        }
    }
}
