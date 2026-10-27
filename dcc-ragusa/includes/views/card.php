<?php
/**
 * One fortress card.
 *
 * @var string $slug
 * @var array  $status   state, line, checked_at
 * @var string $state
 * @var array  $findings fingerprint => finding
 * @var array  $icons
 */

use DCCR\Admin;
use DCCR\Events;
use DCCR\Fortress;
use DCCR\Site;

if (!defined('ABSPATH')) {
    exit;
}

$tone = match ($state) {
    Fortress::HOLDING    => 'good',
    Fortress::NEEDS_LOOK => 'warn',
    Fortress::BREACHED   => 'bad',
    default              => 'muted',
};
?>
<section class="dccr-card dccr-card--<?php echo esc_attr($tone); ?>" aria-labelledby="dccr-card-<?php echo esc_attr($slug); ?>">
    <p class="dccr-card__state">
        <span class="dccr-card__icon" aria-hidden="true"><?php echo esc_html($icons[$state] ?? '…'); ?></span>
        <?php echo esc_html(Fortress::state_label($state)); ?>
    </p>
    <h2 class="dccr-card__name" id="dccr-card-<?php echo esc_attr($slug); ?>"><?php echo esc_html(Fortress::name($slug)); ?></h2>
    <p class="dccr-card__sub"><?php echo esc_html(Fortress::subtitle($slug)); ?></p>
    <p class="dccr-card__line"><?php echo esc_html($slug === Fortress::SVETI_IVAN ? DCCR\Fortress\Sveti_Ivan::status_line() : Fortress::row_line($slug)); ?></p>
    <p class="dccr-card__when">
        <?php
        /* translators: %s: relative time */
        echo esc_html($status['checked_at'] > 0 ? sprintf(__('Checked %s', 'dcc-ragusa'), Site::both((int) $status['checked_at'])) : __('Not Checked Yet', 'dcc-ragusa'));
        ?>
    </p>
    <?php if ($findings !== []) : ?>
        <?php
        $open_count = count(array_filter($findings, static fn($f) => DCCR\Alerts::state($f) === 'open'));
        $calm_count = count($findings) - $open_count;
        ?>
        <details class="dccr-card__details"<?php echo $open_count > 0 ? ' open' : ''; ?>>
            <summary>
                <?php
                if ($open_count > 0) {
                    /* translators: %d: number of findings */
                    echo esc_html(sprintf(_n('%d Finding', '%d Findings', $open_count, 'dcc-ragusa'), $open_count));
                    if ($calm_count > 0) {
                        /* translators: %d: number of settled findings */
                        echo esc_html(' · ' . sprintf(_n('%d Settled', '%d Settled', $calm_count, 'dcc-ragusa'), $calm_count));
                    }
                } else {
                    /* translators: %d: number of settled findings */
                    echo esc_html(sprintf(_n('%d Settled Finding', '%d Settled Findings', $calm_count, 'dcc-ragusa'), $calm_count));
                }
                ?>
            </summary>
            <ul class="dccr-findings">
                <?php foreach ($findings as $fp => $f) : ?>
                    <?php $fstate = DCCR\Alerts::state($f); ?>
                    <li class="dccr-finding dccr-finding--<?php echo esc_attr($fstate === 'open' ? (string) $f['severity'] : $fstate); ?>">
                        <p class="dccr-finding__title">
                            <?php if ($fstate === 'practice') : ?>
                                <span class="dccr-tag"><?php esc_html_e('Practice', 'dcc-ragusa'); ?></span>
                            <?php endif; ?>
                            <?php echo esc_html((string) $f['title']); ?>
                        </p>
                        <p class="dccr-finding__meta">
                            <?php
                            if ($fstate === 'resolved') {
                                /* translators: %s: relative time */
                                echo esc_html(sprintf(__('Resolved %s', 'dcc-ragusa'), Site::both((int) $f['resolved_at'])));
                            } elseif ($fstate === 'seen') {
                                /* translators: 1: name, 2: when */
                                echo esc_html(sprintf(__('Seen By %1$s, %2$s', 'dcc-ragusa'), (string) $f['seen_by'], Site::when((int) $f['seen_at'])));
                            } elseif ($fstate === 'practice') {
                                /* translators: %s: when */
                                echo esc_html(sprintf(__('A drill, %s. Not counted, not emailed.', 'dcc-ragusa'), Site::when((int) $f['last_seen'])));
                            } else {
                                /* translators: 1: first seen, 2: last seen */
                                echo esc_html(sprintf(__('First seen %1$s · last seen %2$s', 'dcc-ragusa'), Site::when((int) $f['first_seen']), Site::when((int) $f['last_seen'])));
                            }
                            ?>
                        </p>
                        <?php if ($fstate !== 'open') : ?>
                    </li>
                    <?php continue; ?>
                        <?php endif; ?>
                        <div class="dccr-finding__actions">
                            <?php
                            $kind   = (string) $f['kind'];
                            $target = (string) $f['target'];
                            $path   = preg_replace('/@[a-f0-9]+$/', '', $target) ?? $target;
                            if (in_array($kind, ['file-new', 'file-changed', 'sentinel-changed', 'guard-restored', 'guard-keeps-changing', 'uploads-control-changed'], true)) {
                                $seal_path = $kind === 'uploads-control-changed' ? 'wp-content/uploads/' . $path : $path;
                                echo Admin::form('seal', ['target' => $seal_path], __('Seal', 'dcc-ragusa'), 'button dccr-button');
                            } elseif ($kind === 'htaccess-block-changed' || $kind === 'htaccess-reversed') {
                                echo Admin::form('seal', ['target' => '.htaccess'], __('Seal', 'dcc-ragusa'), 'button dccr-button');
                            } elseif ($kind === 'vuln') {
                                $plugin_slug = (string) strtok($target, '@');
                                echo Admin::form('update_now', ['target' => $plugin_slug], __('Update Now', 'dcc-ragusa'), 'button button-primary dccr-button');
                            }
                            echo Admin::form('seen', ['target' => $fp], __('Mark As Seen', 'dcc-ragusa'), 'button dccr-button');
                            ?>
                        </div>
                    </li>
                <?php endforeach; ?>
            </ul>
        </details>
    <?php endif; ?>
</section>
