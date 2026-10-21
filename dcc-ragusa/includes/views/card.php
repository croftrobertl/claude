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
    <p class="dccr-card__line"><?php echo esc_html($status['line']); ?></p>
    <p class="dccr-card__when">
        <?php
        /* translators: %s: relative time */
        echo esc_html($status['checked_at'] > 0 ? sprintf(__('Checked %s', 'dcc-ragusa'), Site::ago($status['checked_at'])) : __('Not Checked Yet', 'dcc-ragusa'));
        ?>
    </p>
    <?php if ($findings !== []) : ?>
        <details class="dccr-card__details">
            <summary>
                <?php
                /* translators: %d: number of findings */
                echo esc_html(sprintf(_n('%d Finding', '%d Findings', count($findings), 'dcc-ragusa'), count($findings)));
                ?>
            </summary>
            <ul class="dccr-findings">
                <?php foreach ($findings as $fp => $f) : ?>
                    <li class="dccr-finding dccr-finding--<?php echo esc_attr((string) $f['severity']); ?>">
                        <p class="dccr-finding__title"><?php echo esc_html((string) $f['title']); ?></p>
                        <p class="dccr-finding__meta">
                            <?php
                            /* translators: 1: first seen, 2: last seen */
                            echo esc_html(sprintf(__('First seen %1$s · last seen %2$s', 'dcc-ragusa'), Site::when((int) $f['first_seen']), Site::ago((int) $f['last_seen'])));
                            ?>
                        </p>
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
                            if ($f['severity'] !== Events::BREACHED) {
                                echo Admin::form('dismiss', ['target' => $fp], __('Dismiss', 'dcc-ragusa'), 'button-link dccr-link');
                            }
                            ?>
                        </div>
                    </li>
                <?php endforeach; ?>
            </ul>
        </details>
    <?php endif; ?>
</section>
