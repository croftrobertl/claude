<?php
/**
 * The mutation run: break each guarantee on purpose, and check a test catches it.
 *
 *     php tests/mutations.php
 *
 * Each mutation is applied to a throwaway copy of the plugin. A mutation that
 * the suite still passes is a hole in the tests, and is reported as a failure
 * of this run.
 */

declare(strict_types=1);

$plugin  = dirname(__DIR__);
$work    = sys_get_temp_dir() . '/dccl-mutations';

$mutations = [
    [
        'name' => 'A write to MotoPress during linking',
        'file' => 'includes/class-linker.php',
        'from' => '        $bookings = Mphb_Reader::bookings();',
        'to'   => "        global \$wpdb;\n        \$wpdb->insert(\$wpdb->postmeta, ['post_id' => 9001, 'meta_key' => 'dccl_touched', 'meta_value' => '1']);\n        \$bookings = Mphb_Reader::bookings();",
    ],
    [
        'name' => 'An overlap auto-linked instead of an exact match',
        'file' => 'includes/class-linker.php',
        'from' => '        $key  = self::key((string) $stay[\'cottage\'], (string) $stay[\'check_in\'], (string) $stay[\'check_out\']);
        $hits = $index[\'by_dates\'][$key] ?? [];',
        'to'   => '        $hits = [];
        foreach ($index[\'by_dates\'] as $k => $candidates) {
            foreach ($candidates as $candidate) {
                if ((string) $candidate[\'cottage\'] === (string) $stay[\'cottage\'] && self::overlaps($stay, $candidate)) {
                    $hits[] = $candidate;
                }
            }
        }',
    ],
    [
        'name' => 'A cross-channel match auto-linked',
        'file' => 'includes/class-linker.php',
        'from' => '            if ($booking[\'channel\'] !== $stay[\'channel\']) {
                continue;
            }
            $open[] = $booking;',
        'to'   => '            $open[] = $booking;',
    ],
    [
        'name' => 'A guest name stored on the stay',
        'file' => 'includes/parsers/class-airbnb-payout.php',
        'from' => <<<'EOT'
                    'ok',
                    null,
                    [],
                    // Hashed here and dropped: the name goes no further.
                    Names::keys((string) ($row['Guest'] ?? ''))
EOT,
        'to'   => <<<'EOT'
                    'ok',
                    null,
                    ['guest' => (string) ($row['Guest'] ?? '')],
                    Names::keys((string) ($row['Guest'] ?? ''))
EOT,
    ],
    [
        'name' => 'A Crofty Bear row included',
        'file' => 'includes/parsers/class-bookingcom-reservations.php',
        'from' => '            if ($this->is_excluded($cottage)) {
                $result[\'counts\'][\'excluded\']++;
                continue;
            }',
        'to'   => '            if ($this->is_excluded($cottage)) {
                $cottage = \'34\';
            }',
    ],
    [
        'name' => 'A hand-typed copy counted a second time',
        'file' => 'includes/class-reports.php',
        'from' => <<<'EOT'
            if (isset($copies[$booking_id])) {
EOT,
        'to'   => <<<'EOT'
            if (false) {
EOT,
    ],
    [
        'name' => 'A same-cottage copy no longer raised on the cleanup list',
        'file' => 'includes/class-issues.php',
        'from' => '        self::handtyped_matches($items, $stays, $links, $bookings);',
        'to'   => '        // removed',
    ],
    [
        'name' => 'An assumed payment reported as recorded',
        'file' => 'includes/class-reports.php',
        'from' => <<<'EOT'
        if ($view === 'original') {
            $out['paid']                = $out['recorded'];
            $out['assumed']             = 0;
EOT,
        'to'   => <<<'EOT'
        if ($view === 'original') {
            $out['recorded']            = $out['recorded'] + $out['assumed'];
            $out['paid']                = $out['recorded'];
            $out['assumed']             = 0;
EOT,
    ],
    [
        'name' => 'A payment on a copy counted as money received',
        'file' => 'includes/class-reports.php',
        'from' => <<<'EOT'
                    $out['copy_payments'] = $out['copy_payments'] + (int) $booking['paid'];
EOT,
        'to'   => <<<'EOT'
                    $out['copy_payments'] = $out['copy_payments'] + (int) $booking['paid'];
                    $out['recorded']      = $out['recorded'] + (int) $booking['paid'];
EOT,
    ],
    [
        'name' => 'Airbnb-remitted tax added to revenue',
        'file' => 'includes/class-reports.php',
        'from' => '        $room_revenue = $ota[\'guest_total\'] - $ota[\'tax_in_payout\'] - $ota[\'tax_platform_remitted\'];',
        'to'   => '        $room_revenue = $ota[\'guest_total\'] - $ota[\'tax_in_payout\'];',
    ],
    [
        'name' => "Vrbo's missing tax shown as $0 rather than unknown",
        'file' => 'includes/class-reports.php',
        'from' => '            if ((int) $row[\'stays\'] > 0 && (int) $row[\'tax\'] === 0) {',
        'to'   => '            if (false) {',
    ],
    [
        'name' => 'A hash that changes between imports',
        'file' => 'includes/class-repo.php',
        'from' => "            'seq'        => \$seq,",
        'to'   => "            'seq'        => \$seq,\n            'nonce'      => random_int(1, PHP_INT_MAX),",
    ],
    [
        'name' => 'Undo deleting rows it did not insert',
        'file' => 'includes/class-batches.php',
        'from' => '            $wpdb->prepare("DELETE FROM {$lines_t} WHERE source_batch = %d", $batch_id)',
        'to'   => '            "DELETE FROM {$lines_t}"',
    ],
    [
        'name' => 'The uploaded file left on disk',
        'file' => 'includes/class-admin.php',
        'from' => '        } finally {
            if (file_exists($temp)) {
                @unlink($temp);
            }
        }',
        'to'   => '        } finally {
            // mutation: the file is kept
        }',
    ],
    [
        'name' => 'An Original overwritten on refresh',
        'file' => 'includes/class-originals.php',
        'from' => <<<'EOT'
            $version    = (int) $current['version'] + 1;
            $superseded = (int) $current['id'];
EOT,
        'to'   => <<<'EOT'
            $version    = (int) $current['version'];
            $superseded = null;
            $wpdb->delete(self::table(), ['id' => (int) $current['id']]);
EOT,
    ],
    [
        'name' => 'An adjustment deleted by a refresh',
        'file' => 'includes/class-snapshot.php',
        'from' => <<<'EOT'
            self::assume_paid($bookings, $detected, $counts, $notes, $dry_run, $batch_id, $user_id);
EOT,
        'to'   => <<<'EOT'
            if (!$dry_run) {
                global $wpdb;
                $wpdb->query('DELETE FROM ' . Schema::adjustments());
            }
            self::assume_paid($bookings, $detected, $counts, $notes, $dry_run, $batch_id, $user_id);
EOT,
    ],
    [
        'name' => 'Assumed paid applied to a hand-typed copy',
        'file' => 'includes/class-snapshot.php',
        'from' => <<<'EOT'
            if (isset($copies[(int) $booking['id']])) {
                // Its money belongs to the OTA stay, once.
                $counts['copies_skipped']++;
EOT,
        'to'   => <<<'EOT'
            if (false) {
                $counts['copies_skipped']++;
EOT,
    ],
    [
        'name' => 'Assumed paid applied to an overpaid booking',
        'file' => 'includes/class-snapshot.php',
        'from' => <<<'EOT'
            $gap = (int) $booking['total'] - (int) $booking['paid_recorded'];
            if ($gap <= 0) {
                if ($gap < 0) {
EOT,
        'to'   => <<<'EOT'
            $gap = abs((int) $booking['total'] - (int) $booking['paid_recorded']);
            if ($gap < 0) {
                if ($gap < 0) {
EOT,
    ],
    [
        'name' => 'A refunded payment counted as paid',
        'file' => 'includes/class-originals.php',
        'from' => <<<'EOT'
            if ((string) $payment['payment_status'] === Mphb_Reader::PAYMENT_COMPLETED) {
                $bookings[$booking_id]['paid'] = $bookings[$booking_id]['paid'] + $amount;
            } elseif ((string) $payment['payment_status'] === Mphb_Reader::PAYMENT_REFUNDED) {
EOT,
        'to'   => <<<'EOT'
            if (in_array((string) $payment['payment_status'], [Mphb_Reader::PAYMENT_COMPLETED, Mphb_Reader::PAYMENT_REFUNDED], true)) {
                $bookings[$booking_id]['paid'] = $bookings[$booking_id]['paid'] + $amount;
            } elseif (false) {
EOT,
    ],
    [
        'name' => 'The unprefixed "completed" payment status',
        'file' => 'includes/class-mphb-reader.php',
        'from' => <<<'EOT'
    public const PAYMENT_COMPLETED = 'mphb-p-completed';
EOT,
        'to'   => <<<'EOT'
    public const PAYMENT_COMPLETED = 'completed';
EOT,
    ],
    [
        'name' => 'mphb_amount instead of _mphb_amount',
        'file' => 'includes/class-mphb-reader.php',
        'from' => <<<'EOT'
    public const META_PAYMENT_AMOUNT = '_mphb_amount';
EOT,
        'to'   => <<<'EOT'
    public const META_PAYMENT_AMOUNT = 'mphb_amount';
EOT,
    ],
    [
        'name' => 'The payment-to-booking link read from the wrong meta',
        'file' => 'includes/class-mphb-reader.php',
        'from' => <<<'EOT'
    public const META_PAYMENT_BOOKING = '_mphb_booking_id';
EOT,
        'to'   => <<<'EOT'
    public const META_PAYMENT_BOOKING = '_mphb_parent_id';
EOT,
    ],
    [
        'name' => 'A moved-cottage copy no longer recognised',
        'file' => 'includes/class-copies.php',
        'from' => <<<'EOT'
            $stay = self::move_candidate($booking, $by_dates, $direct_keys);
            if ($stay !== null) {
                $out[(int) $booking['id']] = $stay;
            }
EOT,
        'to'   => <<<'EOT'
            $stay = null;
            if ($stay !== null) {
                $out[(int) $booking['id']] = $stay;
            }
EOT,
    ],
    [
        'name' => 'A move auto-linked without anyone confirming it',
        'file' => 'includes/class-linker.php',
        'from' => <<<'EOT'
        foreach (Copies::detect(Copies::from_live()) as $booking_id => $match) {
            if ($match['stay_id'] === null) {
                continue;
            }
EOT,
        'to'   => <<<'EOT'
        $auto = Copies::detect(Copies::from_live());
        foreach (Copies::probable_moves(Copies::from_live()) as $move_id => $move) {
            $auto[$move_id] = ['reason' => Copies::REASON_DATES, 'stay_id' => $move['stay_id'], 'stay_code' => '', 'confirmed' => true];
        }
        foreach ($auto as $booking_id => $match) {
            if ($match['stay_id'] === null) {
                continue;
            }
EOT,
    ],
    [
        'name' => 'Assumed payments written before the exports are imported',
        'file' => 'includes/class-snapshot.php',
        'from' => <<<'EOT'
        if (self::reservations_imported()) {
EOT,
        'to'   => <<<'EOT'
        if (true) {
EOT,
    ],
    [
        'name' => 'An assumed payment on a copy deleted instead of reversed',
        'file' => 'includes/class-adjustments.php',
        'from' => <<<'EOT'
            if ((string) $adjustment['type'] === self::ASSUMED_REVERSAL) {
                $reversed = true;
            }
EOT,
        'to'   => <<<'EOT'
            if (false) {
                $reversed = true;
            }
EOT,
    ],
    [
        'name' => 'A rejected move quietly coming back as a copy',
        'file' => 'includes/class-copies.php',
        'from' => <<<'EOT'
            if (Decisions::move_rejected($id, (int) $stay['id'])) {
                continue;
            }
EOT,
        'to'   => <<<'EOT'
            if (false) {
                continue;
            }
EOT,
    ],
    [
        'name' => 'A move called on dates alone, with a different surname',
        'file' => 'includes/class-copies.php',
        'from' => <<<'EOT'
            if (!Names::match($booking_keys, $stay_keys)) {
                // A different party, on the same busy weekend.
                continue;
            }
EOT,
        'to'   => <<<'EOT'
            if (false) {
                continue;
            }
EOT,
    ],
    [
        'name' => 'A move guessed where there is no name to compare',
        'file' => 'includes/class-copies.php',
        'from' => <<<'EOT'
            if ($booking_keys === [] || $stay_keys === []) {
EOT,
        'to'   => <<<'EOT'
            if (false) {
EOT,
    ],
    [
        'name' => 'An unconfirmed move treated as a copy, dropping a real stay',
        'file' => 'includes/class-snapshot.php',
        'from' => <<<'EOT'
        $moves = Copies::probable_moves($live);
        foreach ($moves as $booking_id => $move) {
EOT,
        'to'   => <<<'EOT'
        $moves = Copies::probable_moves($live);
        foreach ($moves as $booking_id => $move) {
            $detected[(int) $booking_id] = ['reason' => 'dates', 'stay_id' => $move['stay_id'], 'stay_code' => '', 'confirmed' => false];
EOT,
    ],
    [
        'name' => 'A surname stored beside its hash',
        'file' => 'includes/class-names.php',
        'from' => <<<'EOT'
        foreach ($candidates as $candidate) {
            $out[] = hash_hmac('sha256', $candidate, $salt);
        }
EOT,
        'to'   => <<<'EOT'
        foreach ($candidates as $candidate) {
            $out[] = $candidate;
        }
EOT,
    ],
    [
        'name' => 'An unsalted surname hash, open to a dictionary',
        'file' => 'includes/class-names.php',
        'from' => <<<'EOT'
            $out[] = hash_hmac('sha256', $candidate, $salt);
EOT,
        'to'   => <<<'EOT'
            $out[] = hash('sha256', $candidate);
EOT,
    ],
    [
        'name' => 'The copy breakdown counting a different population again',
        'file' => 'includes/class-snapshot.php',
        'from' => <<<'EOT'
                $reason = (string) $copies[(int) $booking['id']]['reason'];
                if (in_array($reason, Copies::REASON_ORDER, true)) {
                    $counts['copies_by_' . $reason]++;
                }
EOT,
        'to'   => <<<'EOT'
                $counts['copies_by_dates'] += 2;
EOT,
    ],
    [
        'name' => 'An SQL comment back inside a CREATE TABLE',
        'file' => 'includes/class-schema.php',
        'from' => <<<'EOT'
        $lines = [];
        foreach ($definition['columns'] as $column => $type) {
            $lines[] = $column . ' ' . $type;
        }
EOT,
        'to'   => <<<'EOT'
        $lines = [];
        foreach ($definition['columns'] as $column => $type) {
            if ($column === 'guest_keys') {
                $lines[] = "-- Salted hashes of the guest's surname";
            }
            $lines[] = $column . ' ' . $type;
        }
EOT,
    ],
    [
        'name' => 'A cancelled booking offered as a probable move',
        'file' => 'includes/class-copies.php',
        'from' => <<<'EOT'
            if ((string) $booking['status'] !== Snapshot::CONFIRMED) {
                continue;
            }
EOT,
        'to'   => <<<'EOT'
            if (false) {
                continue;
            }
EOT,
    ],
    [
        'name' => 'A link created pointing at no stay at all',
        'file' => 'includes/class-repo.php',
        'from' => <<<'EOT'
        if ($stay_id <= 0 || $booking_id <= 0) {
            return false;
        }
EOT,
        'to'   => <<<'EOT'
EOT,
    ],
    [
        'name' => 'A confirmed move seeded by its dates alone',
        'file' => 'includes/class-copies.php',
        'from' => <<<'EOT'
            if ((string) $stay['channel'] !== $spec['channel']) {
                continue;
            }
            if ((string) $stay['cottage'] !== $spec['cottage']) {
                continue;
            }
EOT,
        'to'   => <<<'EOT'
            if (false) {
                continue;
            }
EOT,
    ],
    [
        'name' => 'A confirmed move seeded to the wrong channel',
        'file' => 'includes/class-copies.php',
        'from' => <<<'EOT'
            if ((string) $stay['channel'] !== $spec['channel']) {
                continue;
            }
EOT,
        'to'   => <<<'EOT'
            if ((string) $stay['channel'] === $spec['channel']) {
                continue;
            }
EOT,
    ],
    [
        'name' => 'A confirmed move with no stay passed over in silence',
        'file' => 'includes/class-issues.php',
        'from' => <<<'EOT'
        self::confirmed_moves_without_a_stay($items, $bookings);
EOT,
        'to'   => <<<'EOT'
EOT,
    ],
    [
        'name' => 'Bad links deleted silently, with no batch to undo',
        'file' => 'includes/class-repair.php',
        'from' => <<<'EOT'
        $batch_id = Batches::create(
            self::KIND,
            __('Removed links pointing at a stay that does not exist', 'dcc-ledger'),
            $user_id
        );
EOT,
        'to'   => <<<'EOT'
        $batch_id = 0;
EOT,
    ],
    [
        'name' => 'Undo failing to put a removed link back',
        'file' => 'includes/class-batches.php',
        'from' => <<<'EOT'
        if (isset($undo['deleted_links']) && is_array($undo['deleted_links'])) {
EOT,
        'to'   => <<<'EOT'
        if (false) {
EOT,
    ],
    [
        'name' => 'The upgrade leaving bad links where they are',
        'file' => 'includes/class-plugin.php',
        'from' => <<<'EOT'
        Repair::on_upgrade(get_current_user_id());
EOT,
        'to'   => <<<'EOT'
EOT,
    ],
    [
        'name' => 'A good link removed as if it were bad',
        'file' => 'includes/class-repair.php',
        'from' => <<<'EOT'
              WHERE s.id IS NULL
EOT,
        'to'   => <<<'EOT'
              WHERE s.id IS NULL OR s.id IS NOT NULL
EOT,
    ],
    [
        'name' => 'A cancellation fee counted as money for the stay',
        'file' => 'includes/class-copies.php',
        'from' => <<<'EOT'
    public const STAY_BILLED_TYPES = ['guest_total', 'room_sales'];
EOT,
        'to'   => <<<'EOT'
    public const STAY_BILLED_TYPES = ['guest_total', 'room_sales', 'cancellation_fee'];
EOT,
    ],
    [
        'name' => 'The cleanup list promising a link the matcher will not make',
        'file' => 'includes/class-issues.php',
        'from' => <<<'EOT'
            if (!isset($copyable[(int) $stay['id']])) {
                continue;
            }
EOT,
        'to'   => <<<'EOT'
EOT,
    ],
    [
        'name' => 'Nights that nobody counts, passed over in silence',
        'file' => 'includes/class-issues.php',
        'from' => <<<'EOT'
        self::cancelled_stay_with_a_copy($items, $stays);
EOT,
        'to'   => <<<'EOT'
EOT,
    ],
    [
        'name' => 'A cancelled platform stay allowed to originate a copy',
        'file' => 'includes/class-copies.php',
        'from' => <<<'EOT'
        return (string) $stay['status'] === 'ok';
EOT,
        'to'   => <<<'EOT'
        return true;
EOT,
    ],
    [
        'name' => 'A cancelled stay with money quietly making a copy',
        'file' => 'includes/class-copies.php',
        'from' => <<<'EOT'
    public static function can_originate_copy(array $stay): bool
    {
        return (string) $stay['status'] === 'ok';
    }
EOT,
        'to'   => <<<'EOT'
    public static function can_originate_copy(array $stay): bool
    {
        return (string) $stay['status'] === 'ok'
            || abs(self::stay_money($stay)) >= 0.01;
    }
EOT,
    ],
    [
        'name' => 'A cancelled stay with money and a twin passed over in silence',
        'file' => 'includes/class-issues.php',
        'from' => <<<'EOT'
        self::cancelled_with_money_and_a_twin($items, $stays);
EOT,
        'to'   => <<<'EOT'
EOT,
    ],
    [
        'name' => 'Nights taken from the file instead of the dates',
        'file' => 'includes/class-dates.php',
        'from' => <<<'EOT'
        $days = (int) $in->diff($out)->format('%r%a');
EOT,
        'to'   => <<<'EOT'
        $days = (int) $in->diff($out)->format('%r%a') + 1;
EOT,
    ],
    [
        'name' => 'A missing capability check',
        'file' => 'includes/class-admin.php',
        'from' => '        if (!current_user_can(self::CAP)) {
            wp_die(esc_html__(\'You do not have permission to do that.\', \'dcc-ledger\'), \'\', [\'response\' => 403]);
        }
        check_admin_referer(self::NONCE);
    }',
        'to'   => '        check_admin_referer(self::NONCE);
    }',
    ],
    [
        'name' => 'A refund line ignored when a stay is weighed for money',
        'file' => 'includes/class-copies.php',
        'from' => "    public const STAY_CASH_TYPES = ['payout', 'refund', 'adjustment', 'resolution'];",
        'to'   => "    public const STAY_CASH_TYPES = ['payout', 'adjustment', 'resolution'];",
    ],
    [
        'name' => 'An iCal block raised as a booking whose money is missing',
        'file' => 'includes/class-mphb-reader.php',
        'from' => '        if ($total_cents !== 0 || $summary === \'\') {
            return false;
        }',
        'to'   => '        return false;',
    ],
    [
        'name' => 'The pre-2025 assumption applied to a hand-typed copy',
        'file' => 'includes/class-snapshot.php',
        'from' => '            // Cannot happen before 2025 — there are no platform stays to be a
            // copy of — but the check costs nothing and keeps the rule honest.
            if (isset($copies[$booking_id])) {
                continue;
            }
',
        'to'   => '',
    ],
    [
        'name' => 'A by-number link to the wrong cottage accepted',
        'file' => 'includes/class-linker.php',
        'from' => '        if ($stay_cottage !== \'\' && $booking_cottage !== \'\' && $stay_cottage !== $booking_cottage) {',
        'to'   => '        if (false) {',
    ],
    [
        'name' => 'Only the window rule counted when chasing an unpaid booking',
        'file' => 'includes/class-issues.php',
        'from' => <<<'EOT'
            $assumed = Adjustments::assumed_for((int) $booking_id);
            $paid    = (int) $booking['paid'] + (int) ($assumed['amount_cents'] ?? 0);
EOT,
        'to'   => <<<'EOT'
            $paid = (int) $booking['paid'];
            foreach (Adjustments::for_booking($booking_id) as $adjustment) {
                if ((string) $adjustment['type'] === Adjustments::ASSUMED_PAID) {
                    $paid += (int) $adjustment['amount_cents'];
                }
            }
EOT,
    ],
    [
        'name' => "Rob's rulings left out of the snapshot's own report",
        'file' => 'includes/class-cli.php',
        'from' => <<<'EOT'
        \WP_CLI::log(sprintf(
            'Refunds recorded:     %d bookings, $%s',
            $c['refunds_recorded'],
            number_format(((int) $c['refunds_total']) / 100, 2)
        ));
EOT,
        'to'   => '',
    ],
    [
        'name' => 'Information items counted among the things needing a person',
        'file' => 'includes/class-cli.php',
        'from' => <<<'EOT'
            if ((string) ($item['severity'] ?? '') === 'info') {
                $information[] = $item;
            } else {
                $needs_a_person[] = $item;
            }
EOT,
        'to'   => <<<'EOT'
            $needs_a_person[] = $item;
EOT,
    ],
    [
        'name' => 'A booking linked to a second stay',
        'file' => 'includes/class-repo.php',
        'from' => <<<'EOT'
        if (self::link_for_booking($booking_id) !== null) {
            return false;
        }
EOT,
        'to'   => <<<'EOT'
        foreach (self::links_for_stay($stay_id) as $existing) {
            if ((int) $existing['mphb_booking_id'] === $booking_id) {
                return false;
            }
        }
EOT,
    ],
    [
        'name' => 'An amount read as a float instead of as text',
        'file' => 'includes/class-money.php',
        'from' => <<<'EOT'
        $parts   = explode('.', $text, 2);
EOT,
        'to'   => <<<'EOT'
        $cents = (int) (((float) $text) * 100);
        return $negative ? -$cents : $cents;
        $parts   = explode('.', $text, 2);
EOT,
    ],
    [
        'name' => 'A split whose parts no longer sum to the whole',
        'file' => 'includes/class-money.php',
        'from' => <<<'EOT'
        if ($last !== null) {
            $out[$last] += $cents - $allocated;
        }
EOT,
        'to'   => '',
    ],
    [
        'name' => 'A money cell converted without being backed up first',
        'file' => 'includes/class-money-migration.php',
        'from' => <<<'EOT'
                        if ($already === 0) {
EOT,
        'to'   => <<<'EOT'
                        if (false) {
EOT,
    ],
    [
        'name' => 'A rollback that writes an empty string over a NULL',
        'file' => 'includes/class-money-migration.php',
        'from' => <<<'EOT'
                    if ($row['old_value'] === null) {
EOT,
        'to'   => <<<'EOT'
                    if (false) {
EOT,
    ],
    [
        'name' => 'Money left in decimals reported as figures of zero',
        'file' => 'includes/class-health.php',
        'from' => <<<'EOT'
        $unconverted = self::money_not_in_cents();
        if ($unconverted > 0) {
EOT,
        'to'   => <<<'EOT'
        $unconverted = 0;
        if ($unconverted > 0) {
EOT,
    ],
    [
        'name' => 'The site clock used in place of the property clock',
        'file' => 'includes/class-dates.php',
        'from' => <<<'EOT'
            : new \DateTimeImmutable('now', self::timezone());
EOT,
        'to'   => <<<'EOT'
            : new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
EOT,
    ],
];

$caught = 0;
$missed = [];

echo "Mutation run\n";
echo str_repeat('=', 60) . "\n";

foreach ($mutations as $index => $mutation) {
    // Fresh copy of the plugin for each mutation.
    if (is_dir($work)) {
        exec('rm -rf ' . escapeshellarg($work));
    }
    exec(sprintf('cp -r %s %s', escapeshellarg($plugin), escapeshellarg($work)));

    $target = $work . '/' . $mutation['file'];
    $source = (string) file_get_contents($target);

    if (!str_contains($source, $mutation['from'])) {
        $missed[] = $mutation['name'] . ' — the mutation did not apply (the code it patches has moved)';
        echo sprintf("  ?? %-58s could not be applied\n", $mutation['name']);
        continue;
    }

    file_put_contents(
        $target,
        str_replace($mutation['from'], $mutation['to'], $source)
    );

    // The temp-file mutation also needs the shutdown safety net removed, or
    // the file is cleaned up anyway and the mutation proves nothing.
    if (str_contains($mutation['name'], 'uploaded file')) {
        $admin = $work . '/includes/class-admin.php';
        $text  = (string) file_get_contents($admin);
        $text  = preg_replace('/register_shutdown_function\(static function[^;]+;\s*\}\);/s', '', $text) ?? $text;
        file_put_contents($admin, $text);
    }

    $output = [];
    $status = 0;
    exec(
        sprintf(
            'DCCL_TEST_DIR=%s php %s 2>&1',
            escapeshellarg($work),
            escapeshellarg(__DIR__ . '/run-tests.php')
        ),
        $output,
        $status
    );

    $tail = '';
    foreach ($output as $line) {
        if (str_contains($line, 'failed')) {
            $tail = trim($line);
        }
    }

    if ($status !== 0) {
        $caught++;
        echo sprintf("  OK %-58s caught (%s)\n", $mutation['name'], $tail !== '' ? $tail : 'fatal error');
        continue;
    }

    $missed[] = $mutation['name'];
    echo sprintf("  !! %-58s NOT CAUGHT\n", $mutation['name']);
}

if (is_dir($work)) {
    exec('rm -rf ' . escapeshellarg($work));
}

echo str_repeat('=', 60) . "\n";
echo sprintf("%d of %d mutations caught\n", $caught, count($mutations));
foreach ($missed as $miss) {
    echo '  - ' . $miss . "\n";
}

exit($missed === [] ? 0 : 1);
